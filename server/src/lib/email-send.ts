import { promises as fs } from 'node:fs';
import path from 'node:path';
import { prisma } from '../db.js';
import { sendEmail } from './brevo.js';

const UPLOADS_DIR = path.resolve(process.env.UPLOADS_DIR ?? './uploads');

export interface CampaignSendResult {
  sent: number;
  failed: number;
  total: number;
}

// Runs a campaign send end-to-end: collects recipients (list + extras),
// encodes attachments, calls Brevo per-recipient, records EmailSend rows,
// and flips campaign status + sentAt. Safe to call from a request handler
// or from the scheduler.
export async function runCampaignSend(campaignId: string): Promise<CampaignSendResult> {
  const campaign = await prisma.emailCampaign.findUnique({
    where: { id: campaignId },
    include: {
      list: { include: { members: { include: { subscriber: true } } } },
      attachments: true,
    },
  });
  if (!campaign) throw new Error('Campaign not found');
  if (campaign.status === 'SENDING' || campaign.status === 'SENT') {
    throw new Error(`Campaign is already ${campaign.status.toLowerCase()}`);
  }

  // CAS-style guard so two concurrent senders can't both start.
  const claimed = await prisma.emailCampaign.updateMany({
    where: { id: campaign.id, status: { in: ['DRAFT', 'SCHEDULED'] } },
    data: { status: 'SENDING' },
  });
  if (claimed.count === 0) {
    throw new Error('Campaign already being sent by another worker');
  }

  const recipients = new Map<string, { email: string; subscriberId?: string }>();
  for (const m of campaign.list?.members ?? []) {
    if (m.subscriber.optedIn) {
      recipients.set(m.subscriber.email, { email: m.subscriber.email, subscriberId: m.subscriber.id });
    }
  }
  for (const extra of campaign.extraRecipients ?? []) {
    if (/.+@.+/.test(extra)) recipients.set(extra, { email: extra });
  }

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
        params: { campaignId: campaign.id, ...(r.subscriberId ? { subscriberId: r.subscriberId } : {}) },
        tags: [`campaign:${campaign.id}`],
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
      status: ok > 0 ? 'SENT' : 'FAILED',
      sentAt: new Date(),
    },
  });

  return { sent: ok, failed: fail, total: recipients.size };
}

// Scheduler: poll for SCHEDULED campaigns whose scheduledAt <= now and send them.
// Singleton — call startCampaignScheduler() once at startup.
let schedulerStarted = false;

export function startCampaignScheduler(intervalMs = 60_000) {
  if (schedulerStarted) return;
  schedulerStarted = true;

  const tick = async () => {
    try {
      const due = await prisma.emailCampaign.findMany({
        where: { status: 'SCHEDULED', scheduledAt: { lte: new Date() } },
        select: { id: true },
        take: 10,
      });
      for (const c of due) {
        try {
          const result = await runCampaignSend(c.id);
          // eslint-disable-next-line no-console
          console.log(`[campaign-scheduler] ${c.id}: ${result.sent}/${result.total} sent, ${result.failed} failed`);
        } catch (e: any) {
          // eslint-disable-next-line no-console
          console.warn(`[campaign-scheduler] ${c.id} failed:`, e.message);
        }
      }
    } catch (e: any) {
      // eslint-disable-next-line no-console
      console.warn('[campaign-scheduler] tick failed:', e.message);
    }
  };

  setInterval(() => { void tick(); }, intervalMs);
  // Run once at startup so a campaign scheduled in the past doesn't sit for
  // a full tick before firing.
  void tick();
}
