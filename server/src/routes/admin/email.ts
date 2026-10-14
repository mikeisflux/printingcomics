import { Router } from 'express';
import { z } from 'zod';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { MAX_UPLOAD_BYTES } from '../../config.js';
import { randomBytes } from 'node:crypto';
import { prisma } from '../../db.js';
import { HttpError } from '../../middleware/error.js';
import { sendEmail } from '../../lib/mailgun.js';
import { runCampaignSend } from '../../lib/email-send.js';
import { getMailgunConfig } from '../../lib/settings.js';
import { attachInbound, recordOutbound, snippetOf } from '../../lib/email-threads.js';

const router = Router();

const UPLOADS_DIR = path.resolve(process.env.UPLOADS_DIR ?? './uploads');
await fs.mkdir(UPLOADS_DIR, { recursive: true }).catch(() => undefined);

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).slice(0, 8);
      cb(null, `${Date.now()}-${randomBytes(6).toString('hex')}${ext}`);
    },
  }),
  limits: { fileSize: MAX_UPLOAD_BYTES },
});

// -------- Templates --------

const templateSchema = z.object({
  name: z.string().min(1),
  subject: z.string().min(1),
  html: z.string().min(1),
  text: z.string().optional(),
  variables: z.record(z.string(), z.string()).optional(),
});

router.get('/templates', async (_req, res) => {
  const templates = await prisma.emailTemplate.findMany({
    where: { archived: false },
    orderBy: { updatedAt: 'desc' },
  });
  res.json({ templates });
});

router.get('/templates/:id', async (req, res) => {
  const template = await prisma.emailTemplate.findUnique({ where: { id: req.params.id } });
  if (!template) throw new HttpError(404, 'Template not found');
  res.json({ template });
});

router.post('/templates', async (req, res) => {
  const data = templateSchema.parse(req.body);
  const template = await prisma.emailTemplate.create({
    data: { ...data, variables: data.variables ?? undefined },
  });
  res.json({ template });
});

router.put('/templates/:id', async (req, res) => {
  const data = templateSchema.parse(req.body);
  const template = await prisma.emailTemplate.update({
    where: { id: req.params.id },
    data: { ...data, variables: data.variables ?? undefined },
  });
  res.json({ template });
});

router.delete('/templates/:id', async (req, res) => {
  await prisma.emailTemplate.update({
    where: { id: req.params.id },
    data: { archived: true },
  });
  res.json({ ok: true });
});

// -------- Subscribers --------

const subscriberSchema = z.object({
  email: z.string().email(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  tags: z.array(z.string()).optional(),
  optedIn: z.boolean().optional(),
});

router.get('/subscribers', async (req, res) => {
  const q = (req.query.q as string | undefined)?.trim();
  const subscribers = await prisma.emailSubscriber.findMany({
    where: q
      ? {
          OR: [
            { email: { contains: q, mode: 'insensitive' } },
            { firstName: { contains: q, mode: 'insensitive' } },
            { lastName: { contains: q, mode: 'insensitive' } },
          ],
        }
      : undefined,
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  res.json({ subscribers });
});

router.post('/subscribers', async (req, res) => {
  const data = subscriberSchema.parse(req.body);
  const subscriber = await prisma.emailSubscriber.upsert({
    where: { email: data.email.toLowerCase() },
    create: { ...data, email: data.email.toLowerCase(), tags: data.tags ?? [] },
    update: { ...data, tags: data.tags ?? undefined },
  });
  res.json({ subscriber });
});

router.put('/subscribers/:id', async (req, res) => {
  const data = subscriberSchema.parse(req.body);
  const subscriber = await prisma.emailSubscriber.update({
    where: { id: req.params.id },
    data: { ...data, tags: data.tags ?? undefined },
  });
  res.json({ subscriber });
});

router.delete('/subscribers/:id', async (req, res) => {
  await prisma.emailSubscriber.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

// Import CSV of emails: { emails: "a@x.com\nb@y.com" }
router.post('/subscribers/import', async (req, res) => {
  const body = z.object({ text: z.string() }).parse(req.body);
  const lines = body.text.split(/[\n,]+/).map((s) => s.trim()).filter((s) => /.+@.+\..+/.test(s));
  const created: string[] = [];
  for (const email of lines) {
    const e = email.toLowerCase();
    await prisma.emailSubscriber.upsert({
      where: { email: e },
      create: { email: e, tags: ['imported'] },
      update: {},
    });
    created.push(e);
  }
  res.json({ imported: created.length });
});

// -------- Lists --------

router.get('/lists', async (_req, res) => {
  const lists = await prisma.emailList.findMany({
    include: { _count: { select: { members: true } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ lists });
});

router.post('/lists', async (req, res) => {
  const data = z.object({ slug: z.string().min(1), name: z.string().min(1), description: z.string().optional() }).parse(req.body);
  const list = await prisma.emailList.create({ data });
  res.json({ list });
});

router.post('/lists/:id/add', async (req, res) => {
  const { subscriberIds } = z.object({ subscriberIds: z.array(z.string()) }).parse(req.body);
  for (const sid of subscriberIds) {
    await prisma.emailListMember.upsert({
      where: { listId_subscriberId: { listId: req.params.id, subscriberId: sid } },
      create: { listId: req.params.id, subscriberId: sid },
      update: {},
    }).catch(() => undefined);
  }
  res.json({ ok: true });
});

// -------- Campaigns --------

const campaignSchema = z.object({
  name: z.string().min(1),
  subject: z.string().min(1),
  fromName: z.string().optional(),
  fromEmail: z.string().email().optional(),
  replyTo: z.string().email().optional(),
  html: z.string().min(1),
  text: z.string().optional(),
  templateId: z.string().optional(),
  listId: z.string().optional(),
  extraRecipients: z.array(z.string()).optional(),
  scheduledAt: z.string().datetime().optional(),
});

router.get('/campaigns', async (_req, res) => {
  const campaigns = await prisma.emailCampaign.findMany({
    orderBy: { updatedAt: 'desc' },
    include: { _count: { select: { sends: true, attachments: true } }, list: { select: { id: true, name: true } } },
  });
  res.json({ campaigns });
});

router.get('/campaigns/:id', async (req, res) => {
  const campaign = await prisma.emailCampaign.findUnique({
    where: { id: req.params.id },
    include: { attachments: true, list: true, template: true },
  });
  if (!campaign) throw new HttpError(404, 'Campaign not found');
  res.json({ campaign });
});

router.post('/campaigns', async (req, res) => {
  const data = campaignSchema.parse(req.body);
  const campaign = await prisma.emailCampaign.create({
    data: {
      ...data,
      extraRecipients: data.extraRecipients ?? [],
      scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : undefined,
    },
  });
  res.json({ campaign });
});

router.put('/campaigns/:id', async (req, res) => {
  const data = campaignSchema.parse(req.body);
  const campaign = await prisma.emailCampaign.update({
    where: { id: req.params.id },
    data: {
      ...data,
      extraRecipients: data.extraRecipients ?? undefined,
      scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
    },
  });
  res.json({ campaign });
});

router.delete('/campaigns/:id', async (req, res) => {
  await prisma.emailCampaign.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

router.post('/campaigns/:id/attachments', upload.array('files', 10), async (req, res) => {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  const created: any[] = [];
  for (const f of files) {
    const att = await prisma.emailAttachment.create({
      data: {
        campaignId: String(req.params.id),
        filename: f.originalname,
        contentType: f.mimetype,
        sizeBytes: f.size,
        storageKey: path.basename(f.path),
      },
    });
    created.push(att);
  }
  res.json({ attachments: created });
});

router.delete('/campaigns/:campaignId/attachments/:attachmentId', async (req, res) => {
  const att = await prisma.emailAttachment.findUnique({ where: { id: req.params.attachmentId } });
  if (att) {
    await fs.unlink(path.join(UPLOADS_DIR, att.storageKey)).catch(() => undefined);
    await prisma.emailAttachment.delete({ where: { id: att.id } });
  }
  res.json({ ok: true });
});

// Send campaign immediately (to list members + extraRecipients).
router.post('/campaigns/:id/send', async (req, res) => {
  try {
    const result = await runCampaignSend(req.params.id);
    res.json(result);
  } catch (e: any) {
    if (e.message === 'Campaign not found') throw new HttpError(404, e.message);
    throw new HttpError(400, e.message ?? 'Send failed');
  }
});

// Schedule a campaign — flips it to SCHEDULED with a future scheduledAt.
// The scheduler picks it up when scheduledAt <= now.
const scheduleSchema = z.object({ scheduledAt: z.string().datetime() });
router.post('/campaigns/:id/schedule', async (req, res) => {
  const { scheduledAt } = scheduleSchema.parse(req.body);
  const when = new Date(scheduledAt);
  if (when.getTime() <= Date.now()) throw new HttpError(400, 'scheduledAt must be in the future');

  const campaign = await prisma.emailCampaign.findUnique({ where: { id: req.params.id } });
  if (!campaign) throw new HttpError(404, 'Campaign not found');
  if (campaign.status === 'SENDING' || campaign.status === 'SENT') {
    throw new HttpError(400, `Campaign is already ${campaign.status.toLowerCase()}`);
  }

  const updated = await prisma.emailCampaign.update({
    where: { id: campaign.id },
    data: { status: 'SCHEDULED', scheduledAt: when },
  });
  res.json({ campaign: updated });
});

// Cancel a scheduled campaign, reverting it to DRAFT.
router.post('/campaigns/:id/unschedule', async (req, res) => {
  const campaign = await prisma.emailCampaign.findUnique({ where: { id: req.params.id } });
  if (!campaign) throw new HttpError(404, 'Campaign not found');
  if (campaign.status !== 'SCHEDULED') throw new HttpError(400, 'Campaign is not scheduled');
  const updated = await prisma.emailCampaign.update({
    where: { id: campaign.id },
    data: { status: 'DRAFT', scheduledAt: null },
  });
  res.json({ campaign: updated });
});

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] ?? c));
}

/** Plain text typed by staff → the HTML the customer's mail program shows. */
function textToHtml(text: string): string {
  return `<div style="font-family:system-ui,-apple-system,sans-serif;font-size:15px;line-height:1.5;color:#1a1a1a">${text.split('\n').map((l) => escapeHtml(l)).join('<br>')}</div>`;
}

/** The signature from Settings → Email, once, unless the text already carries it. */
function withSignature(text: string, signature: string): string {
  const sig = signature.trim();
  if (!sig || text.trim().endsWith(sig)) return text;
  return `${text.trimEnd()}\n\n${sig}`;
}

/**
 * Send one email and keep it as a conversation: a thread with our message
 * in it, so the inbox shows it and the customer's answer threads back.
 */
async function startThread(args: { to: string; name?: string | null; subject: string; text: string; html?: string; sentBy?: string | null; signature?: boolean }) {
  const cfg = await getMailgunConfig();
  const text = args.signature === false ? args.text : withSignature(args.text, cfg.signature);
  const html = args.html ?? textToHtml(text);
  const { providerRef } = await sendEmail({ to: { email: args.to, name: args.name ?? undefined }, subject: args.subject, html, text, tags: ['admin-compose'], trackClicks: false });
  const send = await prisma.emailSend.create({ data: { toEmail: args.to, subject: args.subject, status: 'SENT', providerRef } });
  const thread = await prisma.emailThread.create({
    data: { subject: args.subject, contactEmail: args.to.toLowerCase(), contactName: args.name ?? null, status: 'closed', unreadCount: 0, lastDirection: 'out', lastSnippet: snippetOf(text, html) },
  });
  await recordOutbound({ threadId: thread.id, toEmail: args.to, toName: args.name, fromEmail: cfg.fromEmail, subject: args.subject, text, html, providerRef, sentBy: args.sentBy, linkedSendId: send.id });
  return { thread, providerRef };
}

// One-off send — kept as a conversation in the inbox.
const transactSchema = z.object({
  to: z.string().email(),
  name: z.string().max(120).optional(),
  subject: z.string().min(1),
  html: z.string().optional(),
  text: z.string().min(1),
});
router.post('/send', async (req, res) => {
  const data = transactSchema.parse(req.body);
  const { thread, providerRef } = await startThread({ to: data.to, name: data.name, subject: data.subject, text: data.text, html: data.html, sentBy: req.session?.email ?? null });
  res.json({ ok: true, providerRef, threadId: thread.id });
});

// Send log
router.get('/sends', async (req, res) => {
  const campaignId = req.query.campaignId as string | undefined;
  const sends = await prisma.emailSend.findMany({
    where: campaignId ? { campaignId } : undefined,
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: {
      campaign: { select: { id: true, name: true } },
      subscriber: { select: { id: true, email: true } },
    },
  });
  res.json({ sends });
});

// Retired endpoints (Brevo webhooks, self-hosted inbound). Moved to
// /api/webhooks/mailgun. Leave 410s so stale configs fail loud.
router.all('/webhooks/brevo', (_req, res) => {
  res.status(410).json({ error: 'Retired; see /api/webhooks/mailgun' });
});

// -------- Inbox: conversations --------
//
//   GET    /threads?status=open|closed|all&bounces=1&q=   the list, newest first
//   GET    /threads/:id                                   the conversation, read on open, with the contact's orders
//   POST   /threads/:id/reply { text, close? }            reply (threaded, signed), optionally close
//   POST   /threads { to, name?, subject, text }          start a conversation
//   PATCH  /threads/:id { status?, unread?, notes? }
//   DELETE /threads/:id

const threadListSelect = {
  id: true, subject: true, contactEmail: true, contactName: true, status: true, unreadCount: true,
  lastMessageAt: true, lastDirection: true, lastSnippet: true, updatedAt: true,
  _count: { select: { messages: true } },
} as const;

router.get('/threads', async (req, res) => {
  const status = String(req.query.status ?? 'open');
  const q = (req.query.q as string | undefined)?.trim();
  const where: any = {};
  if (status === 'open' || status === 'closed') where.status = status;
  if (req.query.bounces) where.messages = { some: { kind: 'bounce' } };
  if (q) where.OR = [
    { subject: { contains: q, mode: 'insensitive' } },
    { contactEmail: { contains: q, mode: 'insensitive' } },
    { contactName: { contains: q, mode: 'insensitive' } },
    { messages: { some: { textBody: { contains: q, mode: 'insensitive' } } } },
  ];
  const threads = await prisma.emailThread.findMany({ where, orderBy: { lastMessageAt: 'desc' }, take: 200, select: threadListSelect });
  // How many orders each contact has placed, for the badge.
  const emails = [...new Set(threads.map((t) => t.contactEmail))];
  const orders = emails.length ? await prisma.order.groupBy({ by: ['email'], where: { email: { in: emails } }, _count: { _all: true } }) : [];
  const bounced = threads.length ? await prisma.inboundEmail.findMany({ where: { threadId: { in: threads.map((t) => t.id) }, kind: 'bounce' }, select: { threadId: true }, distinct: ['threadId'] }) : [];
  const bounceSet = new Set(bounced.map((b) => b.threadId));
  const counts = await prisma.emailThread.groupBy({ by: ['status'], _count: { _all: true } });
  res.json({
    threads: threads.map((t) => ({ ...t, messageCount: t._count.messages, orderCount: orders.find((o) => o.email === t.contactEmail)?._count._all ?? 0, hasBounce: bounceSet.has(t.id) })),
    counts: { open: counts.find((c) => c.status === 'open')?._count._all ?? 0, closed: counts.find((c) => c.status === 'closed')?._count._all ?? 0 },
  });
});

async function threadDetail(id: string) {
  const thread = await prisma.emailThread.findUnique({
    where: { id },
    include: { messages: { orderBy: { receivedAt: 'asc' } } },
  });
  if (!thread) return null;
  const refs = thread.messages.map((m) => m.providerRef).filter((r): r is string => !!r);
  const sends = refs.length ? await prisma.emailSend.findMany({ where: { providerRef: { in: refs } }, select: { providerRef: true, status: true, openedAt: true, errorMessage: true } }) : [];
  const [orders, customer] = await Promise.all([
    prisma.order.findMany({
      where: { email: thread.contactEmail },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, number: true, status: true, paymentStatus: true, totalCents: true, createdAt: true, proofStatus: true },
    }),
    prisma.user.findUnique({ where: { email: thread.contactEmail }, select: { id: true, firstName: true, lastName: true } }),
  ]);
  return {
    ...thread,
    messages: thread.messages.map((m) => {
      const send = m.providerRef ? sends.find((s) => s.providerRef === m.providerRef) : null;
      return { ...m, rawHeaders: undefined, delivery: send ? { status: send.status, openedAt: send.openedAt, error: send.errorMessage } : null };
    }),
    orders,
    customer,
  };
}

router.get('/threads/:id', async (req, res) => {
  const id = String(req.params.id);
  const detail = await threadDetail(id);
  if (!detail) throw new HttpError(404, 'Conversation not found');
  // Opening a conversation reads it.
  if (detail.unreadCount > 0 || detail.messages.some((m) => m.direction === 'in' && !m.readAt)) {
    await prisma.emailThread.update({ where: { id }, data: { unreadCount: 0 } });
    await prisma.inboundEmail.updateMany({ where: { threadId: id, direction: 'in', readAt: null }, data: { readAt: new Date(), handled: true } });
    detail.unreadCount = 0;
  }
  res.json({ thread: detail });
});

const composeSchema = z.object({
  to: z.string().email(),
  name: z.string().max(120).optional(),
  subject: z.string().min(1).max(300),
  text: z.string().min(1),
});
router.post('/threads', async (req, res) => {
  const data = composeSchema.parse(req.body);
  const { thread } = await startThread({ to: data.to, name: data.name, subject: data.subject, text: data.text, sentBy: req.session?.email ?? null });
  res.json({ thread: await threadDetail(thread.id) });
});

const threadReplySchema = z.object({
  text: z.string().min(1),
  close: z.boolean().optional(),
});
router.post('/threads/:id/reply', async (req, res) => {
  const id = String(req.params.id);
  const thread = await prisma.emailThread.findUnique({ where: { id }, include: { messages: { orderBy: { receivedAt: 'asc' } } } });
  if (!thread) throw new HttpError(404, 'Conversation not found');
  const data = threadReplySchema.parse(req.body);
  const cfg = await getMailgunConfig();

  // Thread the reply under the contact's latest message, with the whole chain in References.
  const theirs = [...thread.messages].reverse().find((m) => m.direction === 'in' && m.messageId);
  const chain = thread.messages.map((m) => m.messageId).filter((x): x is string => !!x).slice(-20);
  const headers: Record<string, string> = {};
  if (theirs?.messageId) headers['In-Reply-To'] = theirs.messageId;
  if (chain.length) headers['References'] = chain.join(' ');

  const text = withSignature(data.text, cfg.signature);
  const html = textToHtml(text);
  const subject = /^re:/i.test(thread.subject) ? thread.subject : `Re: ${thread.subject}`;
  const { providerRef } = await sendEmail({
    to: { email: thread.contactEmail, name: thread.contactName ?? undefined },
    subject, html, text, headers, trackClicks: false,
    tags: ['admin-reply'],
  });
  const send = await prisma.emailSend.create({ data: { toEmail: thread.contactEmail, subject, status: 'SENT', providerRef } });
  await recordOutbound({
    threadId: id, toEmail: thread.contactEmail, toName: thread.contactName, fromEmail: cfg.fromEmail, subject, text, html, providerRef,
    sentBy: req.session?.email ?? null, inReplyTo: headers['In-Reply-To'] ?? null, references: headers['References'] ?? null, linkedSendId: send.id,
  });
  await prisma.inboundEmail.updateMany({ where: { threadId: id, direction: 'in' }, data: { handled: true, readAt: new Date() } });
  await prisma.emailThread.update({ where: { id }, data: { status: data.close ? 'closed' : 'open', unreadCount: 0 } });
  res.json({ thread: await threadDetail(id), providerRef });
});

const threadPatchSchema = z.object({
  status: z.enum(['open', 'closed']).optional(),
  unread: z.boolean().optional(),
  notes: z.string().max(5000).nullable().optional(),
});
router.patch('/threads/:id', async (req, res) => {
  const id = String(req.params.id);
  const data = threadPatchSchema.parse(req.body);
  const patch: any = {};
  if (data.status) patch.status = data.status;
  if (data.notes !== undefined) patch.notes = data.notes;
  if (data.unread) {
    patch.unreadCount = 1;
    patch.status = 'open';
    await prisma.inboundEmail.updateMany({ where: { threadId: id, direction: 'in' }, data: { readAt: null, handled: false } });
  }
  const updated = await prisma.emailThread.update({ where: { id }, data: patch }).catch(() => null);
  if (!updated) throw new HttpError(404, 'Conversation not found');
  res.json({ thread: await threadDetail(id) });
});

router.delete('/threads/:id', async (req, res) => {
  await prisma.emailThread.delete({ where: { id: String(req.params.id) } }).catch(() => undefined);
  res.json({ ok: true });
});

// -------- Inbox (stores messages Mailgun delivers to /webhooks/mailgun/inbound) --------

router.get('/inbound', async (req, res) => {
  const kind = req.query.kind as string | undefined;
  const handled = req.query.handled as string | undefined;
  const q = (req.query.q as string | undefined)?.trim();
  const where: any = {};
  if (kind) where.kind = kind;
  if (handled === 'true') where.handled = true;
  else if (handled === 'false') where.handled = false;
  if (q) where.OR = [
    { subject: { contains: q, mode: 'insensitive' } },
    { fromEmail: { contains: q, mode: 'insensitive' } },
    { fromName: { contains: q, mode: 'insensitive' } },
  ];
  const items = await prisma.inboundEmail.findMany({
    where,
    orderBy: { receivedAt: 'desc' },
    take: 200,
    select: {
      id: true, messageId: true, inReplyTo: true,
      fromEmail: true, fromName: true, toEmail: true, subject: true,
      strippedText: true,
      kind: true, bounceType: true, linkedSendId: true, handled: true,
      receivedAt: true,
    },
  });
  res.json({ items });
});

router.get('/inbound/:id', async (req, res) => {
  const item = await prisma.inboundEmail.findUnique({ where: { id: req.params.id } });
  if (!item) return res.status(404).json({ error: 'Not found' });
  res.json({ item });
});

router.patch('/inbound/:id', async (req, res) => {
  const handled = typeof req.body?.handled === 'boolean' ? req.body.handled : undefined;
  const item = await prisma.inboundEmail.update({
    where: { id: req.params.id },
    data: { handled: handled ?? false },
  });
  res.json({ item });
});

router.delete('/inbound/:id', async (req, res) => {
  await prisma.inboundEmail.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

// Reply composer — sends a reply via Mailgun and auto-marks the inbound as
// handled. Threads by stamping In-Reply-To + References headers.
const replySchema = z.object({
  html: z.string().min(1),
  text: z.string().optional(),
  subject: z.string().optional(),
});
router.post('/inbound/:id/reply', async (req, res) => {
  const parent = await prisma.inboundEmail.findUnique({ where: { id: req.params.id } });
  if (!parent) throw new HttpError(404, 'Message not found');

  const data = replySchema.parse(req.body);
  const subject = data.subject ?? (parent.subject.startsWith('Re:') ? parent.subject : `Re: ${parent.subject}`);

  const threadHeaders: Record<string, string> = {};
  if (parent.messageId) {
    threadHeaders['In-Reply-To'] = parent.messageId;
    threadHeaders['References'] = parent.messageId;
  }

  const { providerRef } = await sendEmail({
    to: { email: parent.fromEmail, name: parent.fromName ?? undefined },
    subject,
    html: data.html,
    text: data.text,
    headers: threadHeaders,
    tags: ['admin-reply', parent.linkedSendId ? `send:${parent.linkedSendId}` : 'standalone'],
  });

  await prisma.inboundEmail.update({
    where: { id: parent.id },
    data: { handled: true, readAt: new Date() },
  });
  if (parent.threadId) {
    const cfg = await getMailgunConfig();
    await recordOutbound({ threadId: parent.threadId, toEmail: parent.fromEmail, toName: parent.fromName, fromEmail: cfg.fromEmail, subject, text: data.text ?? data.html.replace(/<[^>]+>/g, ''), html: data.html, providerRef, sentBy: req.session?.email ?? null, inReplyTo: parent.messageId, references: parent.messageId });
  } else {
    await attachInbound(parent.id).catch(() => undefined);
  }

  res.json({ ok: true, providerRef });
});

export default router;
