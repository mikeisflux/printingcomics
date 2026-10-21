/**
 * Files attached to inbox email — what customers send us and what we send
 * them — kept under UPLOADS_DIR/email with a random storage key, named and
 * typed in the message's `attachments` JSON.
 */
import { promises as fs, createReadStream } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import type { Response } from 'express';

export interface StoredAttachment {
  filename: string;
  contentType: string;
  size: number;
  /** Relative to the email attachments folder; absent when the bytes were not kept. */
  storageKey?: string;
}

const UPLOADS_DIR = path.resolve(process.env.UPLOADS_DIR ?? './uploads');
export const EMAIL_DIR = path.join(UPLOADS_DIR, 'email');
/** Mailgun refuses messages over 25 MB; stay under it with room for the text. */
export const MAX_OUTBOUND_TOTAL = 20 * 1024 * 1024;

function safeName(name: string): string {
  const base = path.basename(name || 'file').replace(/[\r\n"]/g, '_').trim();
  return base.length > 0 ? base.slice(0, 180) : 'file';
}

export async function storeEmailAttachment(bytes: Buffer, filename: string, contentType: string): Promise<StoredAttachment> {
  await fs.mkdir(EMAIL_DIR, { recursive: true });
  const ext = path.extname(filename).slice(0, 10).replace(/[^.\w]/g, '');
  const storageKey = `${Date.now().toString(36)}-${randomBytes(8).toString('hex')}${ext}`;
  await fs.writeFile(path.join(EMAIL_DIR, storageKey), bytes);
  return { filename: safeName(filename), contentType: contentType || 'application/octet-stream', size: bytes.length, storageKey };
}

/** Read a stored file back, for sending it on. */
export async function readEmailAttachment(a: StoredAttachment): Promise<Buffer | null> {
  if (!a.storageKey) return null;
  try { return await fs.readFile(path.join(EMAIL_DIR, path.basename(a.storageKey))); } catch { return null; }
}

/** The attachments list on a message row, validated. */
export function attachmentsOf(raw: unknown): StoredAttachment[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((a) => a && typeof a === 'object' && typeof (a as any).filename === 'string').map((a: any) => ({
    filename: String(a.filename), contentType: String(a.contentType ?? 'application/octet-stream'), size: Number(a.size ?? 0) || 0, storageKey: typeof a.storageKey === 'string' ? a.storageKey : undefined,
  }));
}

/** Stream a stored attachment to a browser under its real name. */
export function sendEmailAttachment(res: Response, a: StoredAttachment, download = false): boolean {
  if (!a.storageKey) return false;
  const file = path.join(EMAIL_DIR, path.basename(a.storageKey));
  res.setHeader('Content-Type', a.contentType);
  res.setHeader('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename="${encodeURIComponent(a.filename)}"; filename*=UTF-8''${encodeURIComponent(a.filename)}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, max-age=3600');
  const stream = createReadStream(file);
  stream.on('error', () => { if (!res.headersSent) res.status(404).json({ error: 'File not found' }); else res.end(); });
  stream.pipe(res);
  return true;
}
