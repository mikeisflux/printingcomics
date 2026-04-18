import { Router } from 'express';
import { z } from 'zod';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { randomBytes } from 'node:crypto';
import { prisma } from '../../db.js';
import { HttpError } from '../../middleware/error.js';
import { sendEmail } from '../../lib/mailgun.js';
import { runCampaignSend } from '../../lib/email-send.js';

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
  limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // 2 GB per file
});

// -------- Templates --------

const templateSchema = z.object({
  name: z.string().min(1),
  subject: z.string().min(1),
  html: z.string().min(1),
  text: z.string().optional(),
  variables: z.record(z.string()).optional(),
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
  const created = [];
  for (const f of files) {
    const att = await prisma.emailAttachment.create({
      data: {
        campaignId: req.params.id,
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

// One-off transactional send
const transactSchema = z.object({
  to: z.string().email(),
  subject: z.string(),
  html: z.string(),
  text: z.string().optional(),
});
router.post('/send', async (req, res) => {
  const data = transactSchema.parse(req.body);
  const { providerRef } = await sendEmail({
    to: { email: data.to },
    subject: data.subject,
    html: data.html,
    text: data.text,
  });
  await prisma.emailSend.create({
    data: {
      toEmail: data.to,
      subject: data.subject,
      status: 'SENT',
      providerRef,
    },
  });
  res.json({ ok: true, providerRef });
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
    data: { handled: true },
  });

  res.json({ ok: true, providerRef });
});

export default router;
