import { HttpError } from '../../../middleware/error.js';

/**
 * PayPal's REST error envelope. `details[0].issue` is the machine-readable
 * code (INSTRUMENT_DECLINED, ORDER_ALREADY_CAPTURED, …); `debug_id` is what
 * PayPal support asks for.
 */
interface PayPalErrorBody {
  name?: string;
  message?: string;
  debug_id?: string;
  details?: { issue?: string; description?: string; field?: string }[];
  /** The OAuth token endpoint uses this pair instead of the REST envelope. */
  error?: string;
  error_description?: string;
}

/**
 * Codes we know how to explain. Anything else falls through to a 502 that
 * still carries PayPal's own wording, so nothing is ever reduced to a bare
 * "Internal server error" again.
 */
const KNOWN: Record<string, { status: number; message: string }> = {
  // --- capture ---
  INSTRUMENT_DECLINED: {
    status: 402,
    message: 'Your card was declined by the issuing bank. Try a different card, or pay with your PayPal balance.',
  },
  PAYER_ACTION_REQUIRED: {
    status: 402,
    message: 'Your bank needs an extra verification step. Please try the payment again and complete the prompt.',
  },
  PAYER_CANNOT_PAY: {
    status: 402,
    message: 'PayPal could not process a payment from this account. Try a different payment method.',
  },
  ORDER_NOT_APPROVED: {
    status: 400,
    message: 'The payment was not approved. Please try again.',
  },
  ORDER_ALREADY_CAPTURED: {
    status: 409,
    message: 'This payment has already been completed — check your email for the order confirmation.',
  },
  ORDER_EXPIRED: {
    status: 410,
    message: 'This checkout session expired. Please start the payment again.',
  },
  TRANSACTION_REFUSED: {
    status: 402,
    message: 'PayPal refused the transaction. Try a different payment method.',
  },
  TRANSACTION_LIMIT_EXCEEDED: {
    status: 402,
    message: 'This amount is over the limit for this payment method.',
  },
  COMPLIANCE_VIOLATION: {
    status: 402,
    message: 'PayPal declined this transaction for compliance reasons.',
  },
  // --- refund ---
  CAPTURE_FULLY_REFUNDED: {
    status: 409,
    message: 'This payment has already been fully refunded.',
  },
  REFUND_AMOUNT_EXCEEDED: {
    status: 422,
    message: 'That is more than what is left to refund on this payment.',
  },
  REFUND_TIME_LIMIT_EXCEEDED: {
    status: 422,
    message: 'PayPal no longer allows refunds on this payment (too old). Send the money another way.',
  },
  PENDING_CAPTURE: {
    status: 409,
    message: 'PayPal is still holding this capture as pending — it can be refunded once it settles.',
  },
  // --- merchant / account ---
  invalid_client: {
    status: 502,
    message: 'PayPal rejected our credentials. Re-check the Client ID, Secret, and Sandbox/Live setting in Admin → Settings → Payments.',
  },
  PERMISSION_DENIED: {
    status: 403,
    message: 'The PayPal app for this site is not allowed to do that — check its permissions in the PayPal developer dashboard.',
  },
  PAYEE_ACCOUNT_RESTRICTED: {
    status: 503,
    message: 'PayPal has restricted the merchant account. Check the PayPal business dashboard for a notice.',
  },
  DUPLICATE_INVOICE_ID: {
    status: 409,
    message: 'PayPal already has a completed payment with this order number.',
  },
  RESOURCE_NOT_FOUND: {
    status: 404,
    message: 'PayPal has no record of that payment id.',
  },
  INVALID_RESOURCE_ID: {
    status: 404,
    message: 'PayPal has no record of that payment id.',
  },
};

/**
 * Turn a failed PayPal response into an HttpError the buyer or admin can act
 * on, and log the full body under a greppable tag so the real reason is in
 * `pm2 logs` even when the UI only shows the short message.
 */
export async function paypalHttpError(res: Response, stage: string): Promise<HttpError> {
  const text = await res.text().catch(() => '');
  let body: PayPalErrorBody = {};
  try { body = JSON.parse(text) as PayPalErrorBody; } catch { /* PayPal sometimes returns HTML on 5xx */ }

  const issue = body.details?.[0]?.issue ?? body.name ?? body.error ?? `HTTP_${res.status}`;
  const field = body.details?.[0]?.field;
  const description = body.details?.[0]?.description ?? body.message ?? body.error_description ?? text.slice(0, 300);
  const details = { issue, field: field ?? null, debugId: body.debug_id ?? null, stage };

  console.error(`[paypal] ${stage} failed`, {
    status: res.status,
    issue,
    debugId: body.debug_id,
    description,
    body: text.slice(0, 2000),
  });

  const known = KNOWN[issue];
  if (known) return new HttpError(known.status, known.message, details);

  if (res.status >= 500) {
    return new HttpError(502, 'PayPal is having trouble right now. Please try again in a moment.', details);
  }
  // A schema rejection (INVALID_REQUEST / INVALID_STRING_LENGTH / …) is a bug
  // in what WE sent, so name the field — that is the whole diagnosis.
  return new HttpError(502, `PayPal rejected the ${stage}: ${issue}${field ? ` on ${field}` : ''}${description ? ` — ${description}` : ''}`, details);
}

/** For when `fetch` itself throws (DNS, TLS, timeout) rather than PayPal answering. */
export function paypalNetworkError(stage: string, err: unknown): HttpError {
  console.error(`[paypal] ${stage}: could not reach PayPal`, err);
  return new HttpError(502, 'Could not reach PayPal. Please try again in a moment.', { stage, issue: 'NETWORK' });
}
