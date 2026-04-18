import { Router } from 'express';
import { z } from 'zod';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { randomBytes } from 'node:crypto';
import { prisma } from '../../db.js';
import { HttpError } from '../../middleware/error.js';
import { sendEmail } from '../../lib/sendgrid.js';

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
// For small lists this is fine inline; for large lists you'd want a queue.
router.post('/campaigns/:id/send', async (req, res) => {
  const campaign = await prisma.emailCampaign.findUnique({
    where: { id: req.params.id },
    include: {
      list: { include: { members: { include: { subscriber: true } } } },
      attachments: true,
    },
  });
  if (!campaign) throw new HttpError(404, 'Campaign not found');
  if (campaign.status === 'SENDING' || campaign.status === 'SENT') {
    throw new HttpError(400, `Campaign is already ${campaign.status.toLowerCase()}`);
  }

  await prisma.emailCampaign.update({
    where: { id: campaign.id },
    data: { status: 'SENDING' },
  });

  const recipients = new Map<string, { email: string; subscriberId?: string }>();
  for (const m of campaign.list?.members ?? []) {
    if (m.subscriber.optedIn) recipients.set(m.subscriber.email, { email: m.subscriber.email, subscriberId: m.subscriber.id });
  }
  for (const extra of campaign.extraRecipients ?? []) {
    if (/.+@.+/.test(extra)) recipients.set(extra, { email: extra });
  }

  // Load attachments into memory (base64) for SendGrid
  const encodedAttachments = [];
  for (const a of campaign.attachments) {
    try {
      const buffer = await fs.readFile(path.join(UPLOADS_DIR, a.storageKey));
      encodedAttachments.push({
        filename: a.filename,
        contentType: a.contentType,
        contentBase64: buffer.toString('base64'),
      });
    } catch {
      // skip missing files
    }
  }

  let ok = 0;
  let fail = 0;
  for (const r of recipients.values()) {
    try {
      const { providerRef } = await sendEmail({
        to: { email: r.email },
        subject: campaign.subject,
        html: campaign.html,
        text: campaign.text ?? undefined,
        attachments: encodedAttachments,
        customArgs: { campaignId: campaign.id, ...(r.subscriberId ? { subscriberId: r.subscriberId } : {}) },
      });
      await prisma.emailSend.create({
        data: {
          campaignId: campaign.id,
          subscriberId: r.subscriberId,
          toEmail: r.email,
          subject: campaign.subject,
          status: 'SENT',
          providerRef,
        },
      });
      ok++;
    } catch (e: any) {
      await prisma.emailSend.create({
        data: {
          campaignId: campaign.id,
          subscriberId: r.subscriberId,
          toEmail: r.email,
          subject: campaign.subject,
          status: 'FAILED',
          errorMessage: e.message,
        },
      });
      fail++;
    }
  }

  await prisma.emailCampaign.update({
    where: { id: campaign.id },
    data: {
      status: fail === 0 ? 'SENT' : ok > 0 ? 'SENT' : 'FAILED',
      sentAt: new Date(),
    },
  });

  res.json({ sent: ok, failed: fail, total: recipients.size });
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

// SendGrid Event Webhook receiver (opens, clicks, bounces, etc.)
router.post('/webhooks/sendgrid', async (req, res) => {
  const events = Array.isArray(req.body) ? req.body : [];
  for (const evt of events) {
    const providerRef = evt['sg_message_id'] as string | undefined;
    if (!providerRef) continue;
    // SendGrid sg_message_id has suffix like "filter.domain" — strip it to match header id
    const baseRef = providerRef.split('.')[0];
    const mapStatus: Record<string, any> = {
      delivered: 'DELIVERED',
      open: 'OPENED',
      click: 'CLICKED',
      bounce: 'BOUNCED',
      dropped: 'FAILED',
      deferred: 'QUEUED',
      processed: 'SENT',
      unsubscribe: 'UNSUBSCRIBED',
      group_unsubscribe: 'UNSUBSCRIBED',
      spamreport: 'BOUNCED',
    };
    const status = mapStatus[evt.event as string];
    if (!status) continue;
    await prisma.emailSend.updateMany({
      where: { providerRef: { startsWith: baseRef } },
      data: {
        status,
        ...(evt.event === 'open' ? { openedAt: new Date() } : {}),
        ...(evt.event === 'click' ? { clickedAt: new Date() } : {}),
        ...(evt.reason ? { errorMessage: evt.reason } : {}),
      },
    });
  }
  res.status(204).end();
});

export default router;
