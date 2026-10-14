/**
 * Email threads: one conversation per outside address and subject, holding
 * what they sent and what we replied, so the inbox shows conversations and a
 * reply never makes a message disappear.
 *
 * An incoming message joins the thread whose message ids its In-Reply-To /
 * References name (ours or theirs); failing that, the contact's recent thread
 * with the same subject; failing that, a new thread. Our replies are stored
 * in the thread with Mailgun's id for them, which is what the contact's mail
 * program puts in In-Reply-To when they answer.
 */
import { prisma } from '../db.js';

/** "Re: RE: Fwd: Order PC-1" → "order pc-1" */
export function normalizeSubject(subject: string): string {
  return subject.replace(/^(\s*(re|fwd?|fw|aw|sv)\s*:\s*)+/i, '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** The first line or so of a message, for the list. */
export function snippetOf(text: string | null | undefined, html: string | null | undefined, max = 160): string {
  let s = (text ?? '').trim();
  if (!s && html) s = html.replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  s = s.replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** Every way a message id may be written: with and without the angle brackets. */
function idVariants(ids: (string | null | undefined)[]): string[] {
  const out = new Set<string>();
  for (const raw of ids) {
    for (const id of (raw ?? '').split(/\s+/)) {
      const t = id.trim();
      if (!t) continue;
      const bare = t.replace(/^<|>$/g, '');
      out.add(bare); out.add(`<${bare}>`);
    }
  }
  return [...out];
}

/** The thread an incoming message belongs to, if one exists. */
export async function findThreadFor(args: { fromEmail: string; subject: string; inReplyTo?: string | null; references?: string | null }): Promise<string | null> {
  const ids = idVariants([args.inReplyTo, args.references]);
  if (ids.length > 0) {
    const hit = await prisma.inboundEmail.findFirst({
      where: { threadId: { not: null }, OR: [{ messageId: { in: ids } }, { providerRef: { in: ids } }] },
      select: { threadId: true },
      orderBy: { receivedAt: 'desc' },
    });
    if (hit?.threadId) return hit.threadId;
  }
  // No header match: the same person writing about the same subject lately.
  const key = normalizeSubject(args.subject);
  const since = new Date(Date.now() - 60 * 24 * 3600 * 1000);
  const recent = await prisma.emailThread.findMany({
    where: { contactEmail: args.fromEmail.toLowerCase(), lastMessageAt: { gte: since } },
    orderBy: { lastMessageAt: 'desc' },
    take: 25,
    select: { id: true, subject: true },
  });
  const same = recent.find((t) => normalizeSubject(t.subject) === key);
  return same?.id ?? null;
}

/**
 * Put a stored incoming message into its thread (creating one if needed) and
 * bring the thread forward: open, one more unread, last word theirs.
 */
export async function attachInbound(messageRowId: string): Promise<string> {
  const m = await prisma.inboundEmail.findUnique({ where: { id: messageRowId } });
  if (!m) throw new Error('message not found');
  const contactEmail = m.fromEmail.toLowerCase();
  let threadId = m.threadId ?? (await findThreadFor({ fromEmail: contactEmail, subject: m.subject, inReplyTo: m.inReplyTo, references: m.references }));
  const snippet = snippetOf(m.strippedText ?? m.textBody, m.htmlBody);
  if (!threadId) {
    const created = await prisma.emailThread.create({
      data: {
        subject: m.subject.replace(/^(\s*(re|fwd?|fw)\s*:\s*)+/i, '').trim() || '(no subject)',
        contactEmail,
        contactName: m.fromName,
        status: m.handled ? 'closed' : 'open',
        unreadCount: m.handled ? 0 : 1,
        lastMessageAt: m.receivedAt,
        lastDirection: 'in',
        lastSnippet: snippet,
      },
      select: { id: true },
    });
    threadId = created.id;
    await prisma.inboundEmail.update({ where: { id: m.id }, data: { threadId } });
    return threadId;
  }
  await prisma.inboundEmail.update({ where: { id: m.id }, data: { threadId } });
  const thread = await prisma.emailThread.findUnique({ where: { id: threadId }, select: { lastMessageAt: true, contactName: true, unreadCount: true } });
  const newer = !thread || m.receivedAt >= thread.lastMessageAt;
  await prisma.emailThread.update({
    where: { id: threadId },
    data: {
      status: m.handled ? undefined : 'open',
      unreadCount: m.handled ? undefined : { increment: 1 },
      contactName: thread?.contactName ?? m.fromName ?? undefined,
      ...(newer ? { lastMessageAt: m.receivedAt, lastDirection: 'in', lastSnippet: snippet } : {}),
    },
  });
  return threadId;
}

/** Store a reply (or a fresh outgoing email) in its thread, as the thread's latest word. */
export async function recordOutbound(args: {
  threadId: string;
  toEmail: string;
  toName?: string | null;
  fromEmail: string;
  subject: string;
  text: string;
  html: string;
  providerRef?: string | null;
  sentBy?: string | null;
  inReplyTo?: string | null;
  references?: string | null;
  linkedSendId?: string | null;
}) {
  const row = await prisma.inboundEmail.create({
    data: {
      threadId: args.threadId,
      direction: 'out',
      sentBy: args.sentBy ?? null,
      providerRef: args.providerRef ?? null,
      messageId: args.providerRef ?? null,
      inReplyTo: args.inReplyTo ?? null,
      references: args.references ?? null,
      fromEmail: args.fromEmail,
      fromName: null,
      toEmail: args.toEmail,
      subject: args.subject,
      textBody: args.text,
      strippedText: args.text,
      htmlBody: args.html,
      kind: 'reply',
      linkedSendId: args.linkedSendId ?? null,
      handled: true,
      readAt: new Date(),
    },
  });
  await prisma.emailThread.update({
    where: { id: args.threadId },
    data: { lastMessageAt: row.receivedAt, lastDirection: 'out', lastSnippet: snippetOf(args.text, args.html), unreadCount: 0 },
  });
  return row;
}

/**
 * Messages stored before threads existed are grouped into threads once, at
 * start-up: the mail headers first, then the same address and subject. A
 * message that was already marked handled does not reopen its thread.
 */
export async function backfillEmailThreads(): Promise<number> {
  const loose = await prisma.inboundEmail.findMany({ where: { threadId: null }, orderBy: { receivedAt: 'asc' }, select: { id: true } });
  for (const m of loose) await attachInbound(m.id);
  if (loose.length > 0) {
    // A thread whose every message was handled is closed, with nothing unread.
    const threads = await prisma.emailThread.findMany({ where: { messages: { some: { id: { in: loose.map((m) => m.id) } } } }, select: { id: true } });
    for (const t of threads) {
      const open = await prisma.inboundEmail.count({ where: { threadId: t.id, direction: 'in', handled: false } });
      if (open === 0) await prisma.emailThread.update({ where: { id: t.id }, data: { status: 'closed', unreadCount: 0 } });
    }
  }
  return loose.length;
}
