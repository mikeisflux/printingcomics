/**
 * Password reset and sign-in links for an account: the single-use reset
 * token (an hour), the email that carries it, and the record of who asked.
 * Used by the public forgot-password flow and by staff from the admin.
 */
import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '../db.js';
import { sendEmail } from './mailgun.js';
import { getSetting } from './settings.js';

const RESET_TTL_MS = 60 * 60 * 1000;

/** A fresh reset link for the account (older unused tokens stay valid until they expire). */
export async function createPasswordResetLink(userId: string): Promise<{ link: string; expiresAt: Date }> {
  const rawToken = randomBytes(32).toString('hex');
  const tokenHash = createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + RESET_TTL_MS);
  await prisma.passwordReset.create({ data: { userId, tokenHash, expiresAt } });
  const publicUrl = ((await getSetting<string>('store.publicUrl')) || process.env.PUBLIC_URL || 'https://printingcomics.com').replace(/\/$/, '');
  return { link: `${publicUrl}/reset-password?token=${rawToken}`, expiresAt };
}

/**
 * Email a link that lets the owner of an existing account choose a password.
 * "claim" is for accounts created at checkout that never had one.
 */
export async function sendSetPasswordEmail(user: { id: string; email: string }, kind: 'reset' | 'claim'): Promise<{ link: string; sent: boolean }> {
  const { link } = await createPasswordResetLink(user.id);
  const heading = kind === 'claim' ? 'Finish setting up your account' : 'Reset your password';
  const intro = kind === 'claim'
    ? 'An account for this email already exists — it was created when you ordered. Choose a password with the link below and everything you have ordered will be waiting in it.'
    : 'Click the link below to choose a new password.';
  const html = `
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:520px;margin:auto">
      <h2>${heading}</h2>
      <p>${intro} The link expires in 1 hour.</p>
      <p><a href="${link}" style="background:#C61A22;color:#fff;padding:.6rem 1rem;border-radius:6px;text-decoration:none;display:inline-block">${kind === 'claim' ? 'Choose a password' : 'Reset password'}</a></p>
      <p style="color:#666;font-size:.85rem">If you didn't request this, ignore this email — nothing changes.</p>
    </div>
  `;
  try {
    await sendEmail({
      to: { email: user.email },
      subject: kind === 'claim' ? 'Finish setting up your Printing Comics account' : 'Reset your Printing Comics password',
      html,
      text: `${heading}: ${link}\n\nThe link expires in 1 hour.`,
      tags: ['password-reset'],
      trackClicks: false,
    });
    return { link, sent: true };
  } catch (e: any) {
    // eslint-disable-next-line no-console
    console.warn('[set-password email] Mailgun send failed:', e.message);
    return { link, sent: false };
  }
}
