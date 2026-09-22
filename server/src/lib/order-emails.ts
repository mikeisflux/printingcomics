import { prisma } from '../db.js';
import { sendEmail } from './mailgun.js';
import { getSetting } from './settings.js';

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

async function resolveStoreName(): Promise<string> {
  return (await getSetting('store.name')) ?? 'Printing Comics';
}

export async function sendOrderConfirmationEmail(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });
  if (!order) return;

  const storeName = await resolveStoreName();
  const itemsHtml = order.items.map((i) =>
    `<tr>
      <td style="padding:8px;border-bottom:1px solid #eee">${escape(i.name)} × ${i.quantity}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${formatMoney(i.totalCents)}</td>
    </tr>`
  ).join('');

  const html = `
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:auto">
      <h2>Thanks for your order!</h2>
      <p>Order <strong>${escape(order.number)}</strong> confirmed. We'll send a proof within 2 business days.</p>
      <table style="width:100%;border-collapse:collapse;margin-top:1rem">${itemsHtml}</table>
      <table style="width:100%;margin-top:1rem">
        <tr><td>Subtotal</td><td style="text-align:right">${formatMoney(order.subtotalCents)}</td></tr>
        <tr><td>Shipping</td><td style="text-align:right">${formatMoney(order.shippingCents)}</td></tr>
        <tr><td>Tax</td><td style="text-align:right">${formatMoney(order.taxCents)}</td></tr>
        <tr style="font-weight:700"><td>Total</td><td style="text-align:right">${formatMoney(order.totalCents)}</td></tr>
      </table>
      <p style="margin-top:2rem;color:#666;font-size:0.9rem">${escape(storeName)}</p>
    </div>
  `;

  try {
    const { providerRef } = await sendEmail({
      trackClicks: false,
      to: { email: order.email },
      subject: `Order ${order.number} confirmed`,
      html,
      tags: [`order:${order.number}`, 'order-confirmation'],
    });
    await prisma.orderStatusEvent.create({
      data: {
        orderId: order.id,
        kind: 'email',
        message: `Confirmation email sent to ${order.email}${providerRef ? ` (${providerRef})` : ''}`,
      },
    });
  } catch (e: any) {
    await prisma.orderStatusEvent.create({
      data: {
        orderId: order.id,
        kind: 'email',
        message: `Failed to send confirmation: ${e.message}`,
      },
    });
  }
}

export async function sendShippingNotificationEmail(orderId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || !order.trackingNumber) return;

  const storeName = await resolveStoreName();
  const html = `
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:auto">
      <h2>Your order is on its way!</h2>
      <p>Order <strong>${escape(order.number)}</strong> shipped${order.shippingMethod ? ` via ${escape(order.shippingMethod)}` : ''}.</p>
      <p><strong>Tracking:</strong> <code>${escape(order.trackingNumber)}</code></p>
      <p style="margin-top:2rem;color:#666;font-size:0.9rem">${escape(storeName)}</p>
    </div>
  `;

  try {
    const { providerRef } = await sendEmail({
      trackClicks: false,
      to: { email: order.email },
      subject: `Order ${order.number} has shipped`,
      html,
      tags: [`order:${order.number}`, 'shipping-notification'],
    });
    await prisma.orderStatusEvent.create({
      data: {
        orderId: order.id,
        kind: 'email',
        message: `Shipping email sent to ${order.email}${providerRef ? ` (${providerRef})` : ''}`,
      },
    });
  } catch (e: any) {
    await prisma.orderStatusEvent.create({
      data: {
        orderId: order.id,
        kind: 'email',
        message: `Failed to send shipping email: ${e.message}`,
      },
    });
  }
}

export async function sendOrderCancelledEmail(orderId: string, reason?: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return;

  const storeName = await resolveStoreName();
  const html = `
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:auto">
      <h2>Order ${escape(order.number)} cancelled</h2>
      <p>${reason ? escape(reason) : 'Your order has been cancelled.'}</p>
      <p>If you didn't request this cancellation, please contact us right away.</p>
      <p style="margin-top:2rem;color:#666;font-size:0.9rem">${escape(storeName)}</p>
    </div>
  `;

  try {
    const { providerRef } = await sendEmail({
      trackClicks: false,
      to: { email: order.email },
      subject: `Order ${order.number} cancelled`,
      html,
      tags: [`order:${order.number}`, 'order-cancelled'],
    });
    await prisma.orderStatusEvent.create({
      data: {
        orderId: order.id,
        kind: 'email',
        message: `Cancellation email sent${providerRef ? ` (${providerRef})` : ''}`,
      },
    });
  } catch {
    // swallow — cancellation email isn't critical
  }
}

type EmailChange = { itemName: string; diff: { label: string; from: string; to: string }[] };

function changesTableHtml(changes: EmailChange[]): string {
  return changes.map((c) => `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #eee;vertical-align:top"><strong>${escape(c.itemName)}</strong></td>
      <td style="padding:8px;border-bottom:1px solid #eee">
        ${c.diff.map((d) => `${escape(d.label)}: <span style="color:#888;text-decoration:line-through">${escape(d.from)}</span> &rarr; <strong>${escape(d.to)}</strong>`).join('<br>')}
      </td>
    </tr>`).join('');
}

/** "Here's what changed, here's the difference, here's where to pay it." */
export async function sendAdjustmentRequestEmail(adjustmentId: string) {
  const adj = await prisma.orderAdjustment.findUnique({
    where: { id: adjustmentId },
    include: { order: { select: { id: true, number: true, email: true } } },
  });
  if (!adj) return;
  const { adjustmentPayUrl } = await import('./order-adjustments.js');
  const payUrl = await adjustmentPayUrl(adj.token);
  const storeName = await resolveStoreName();
  const changes = adj.changes as unknown as EmailChange[];
  const totals = adj.totals as unknown as { before: { totalCents: number }; after: { totalCents: number } };

  const html = `
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:auto">
      <h2>A change to order ${escape(adj.order.number)} needs your OK</h2>
      ${adj.note ? `<p style="background:#f6f6f6;padding:12px;border-radius:6px">${escape(adj.note)}</p>` : ''}
      <p>Here is what we've changed on your order:</p>
      <table style="width:100%;border-collapse:collapse">${changesTableHtml(changes)}</table>
      <table style="width:100%;margin-top:1rem">
        <tr><td>Order total before</td><td style="text-align:right">${formatMoney(totals.before.totalCents)}</td></tr>
        <tr><td>Order total after</td><td style="text-align:right">${formatMoney(totals.after.totalCents)}</td></tr>
        <tr style="font-weight:700;font-size:1.1em"><td>Difference due</td><td style="text-align:right">${formatMoney(adj.amountCents)}</td></tr>
      </table>
      ${payUrl
        ? `<p style="margin-top:1.5rem"><a href="${payUrl}" style="display:inline-block;background:#d62828;color:#fff;padding:12px 22px;border-radius:6px;text-decoration:none;font-weight:700">Pay ${formatMoney(adj.amountCents)}</a></p>
           <p style="color:#666;font-size:.9rem">The change takes effect as soon as the balance is paid. This link is good until ${adj.expiresAt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}.</p>`
        : `<p style="color:#b91c1c">Reply to this email and we'll send you a payment link.</p>`}
      <p style="margin-top:2rem;color:#666;font-size:0.9rem">${escape(storeName)}</p>
    </div>
  `;

  try {
    const { providerRef } = await sendEmail({
      trackClicks: false,
      to: { email: adj.order.email },
      subject: `Order ${adj.order.number}: ${formatMoney(adj.amountCents)} due for a change to your order`,
      html,
      tags: [`order:${adj.order.number}`, 'order-adjustment'],
    });
    await prisma.orderStatusEvent.create({
      data: { orderId: adj.order.id, kind: 'email', message: `Payment request for ${formatMoney(adj.amountCents)} sent to ${adj.order.email}${providerRef ? ` (${providerRef})` : ''}` },
    });
  } catch (e: any) {
    await prisma.orderStatusEvent.create({
      data: { orderId: adj.order.id, kind: 'email', message: `Failed to send payment request: ${e.message}` },
    });
  }
}

/** Receipt for the balance, with the updated order. */
export async function sendAdjustmentPaidEmail(adjustmentId: string) {
  const adj = await prisma.orderAdjustment.findUnique({
    where: { id: adjustmentId },
    include: { order: { select: { id: true, number: true, email: true, totalCents: true } } },
  });
  if (!adj) return;
  const storeName = await resolveStoreName();
  const changes = adj.changes as unknown as EmailChange[];

  const html = `
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:auto">
      <h2>Payment received — order ${escape(adj.order.number)} updated</h2>
      <p>Thanks! We received ${formatMoney(adj.amountCents)} and your order now reads:</p>
      <table style="width:100%;border-collapse:collapse">${changesTableHtml(changes)}</table>
      <table style="width:100%;margin-top:1rem">
        <tr style="font-weight:700"><td>Order total</td><td style="text-align:right">${formatMoney(adj.order.totalCents)}</td></tr>
      </table>
      <p style="margin-top:2rem;color:#666;font-size:0.9rem">${escape(storeName)}</p>
    </div>
  `;

  try {
    const { providerRef } = await sendEmail({
      trackClicks: false,
      to: { email: adj.order.email },
      subject: `Order ${adj.order.number}: payment received, order updated`,
      html,
      tags: [`order:${adj.order.number}`, 'order-adjustment-paid'],
    });
    await prisma.orderStatusEvent.create({
      data: { orderId: adj.order.id, kind: 'email', message: `Balance receipt sent to ${adj.order.email}${providerRef ? ` (${providerRef})` : ''}` },
    });
  } catch (e: any) {
    await prisma.orderStatusEvent.create({
      data: { orderId: adj.order.id, kind: 'email', message: `Failed to send balance receipt: ${e.message}` },
    });
  }
}

function escape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
