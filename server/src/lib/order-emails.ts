import { prisma } from '../db.js';
import { sendEmail } from './brevo.js';
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

function escape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
