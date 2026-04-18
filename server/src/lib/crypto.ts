import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { config } from '../config.js';

const ALGO = 'aes-256-gcm';
const KEY_INFO = 'pc-settings-v1';
const SALT = Buffer.from('pc-settings-salt');

function deriveKey(): Buffer {
  const key = hkdfSync('sha256', config.jwtSecret, SALT, KEY_INFO, 32);
  return Buffer.from(key);
}

/** Encrypts a string; returns "iv:ciphertext:tag" hex triple. */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, deriveKey(), iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${ct.toString('hex')}:${tag.toString('hex')}`;
}

export function decryptSecret(blob: string): string {
  const parts = blob.split(':');
  if (parts.length !== 3) throw new Error('Invalid encrypted blob');
  const [ivHex, ctHex, tagHex] = parts as [string, string, string];
  const decipher = createDecipheriv(ALGO, deriveKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const pt = Buffer.concat([decipher.update(Buffer.from(ctHex, 'hex')), decipher.final()]);
  return pt.toString('utf8');
}

/** Show last 4 chars only for UI display of a secret. */
export function maskSecret(s: string | null | undefined): string | null {
  if (!s) return null;
  if (s.length <= 4) return '•'.repeat(s.length);
  return `${'•'.repeat(Math.max(4, s.length - 4))}${s.slice(-4)}`;
}
