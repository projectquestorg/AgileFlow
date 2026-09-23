import crypto from 'node:crypto';
import * as invoiceStore from '../billing/store.js';

/** HMAC-SHA256 of the raw request body, hex encoded, as sent in `x-payment-signature`. */
export function sign(rawBody, secret) {
  return crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
}

function signatureValid(rawBody, signature, secret) {
  if (typeof signature !== 'string') return false;
  const expected = Buffer.from(sign(rawBody, secret), 'hex');
  const actual = Buffer.from(signature, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

/**
 * POST /webhooks/payment
 *
 * The provider retries any non-2xx response with backoff, so only return 2xx
 * once the event is durably handled (or is a duplicate we already handled).
 */
export function createPaymentWebhookHandler({ secret = process.env.PAYMENT_WEBHOOK_SECRET, store = invoiceStore } = {}) {
  const seenEvents = new Set();

  return function handlePaymentWebhook(req) {
    if (!secret) return { status: 500, body: { error: 'webhook secret not configured' } };
    const rawBody = req.rawBody ?? '';
    if (!signatureValid(rawBody, req.headers?.['x-payment-signature'], secret)) {
      return { status: 401, body: { error: 'invalid signature' } };
    }

    let event;
    try {
      event = JSON.parse(rawBody);
    } catch {
      return { status: 400, body: { error: 'malformed JSON' } };
    }
    if (seenEvents.has(event.id)) return { status: 200, body: { received: true, duplicate: true } };

    switch (event.type) {
      case 'payment.succeeded':
        if (!store.markPaid(event.data.invoiceId, event.data.paymentId)) {
          return { status: 404, body: { error: 'unknown invoice' } };
        }
        break;
      case 'payment.failed':
        if (!store.markPaymentFailed(event.data.invoiceId, event.data.reason)) {
          return { status: 404, body: { error: 'unknown invoice' } };
        }
        break;
      default:
        // Ignore event types we do not subscribe to.
        break;
    }
    seenEvents.add(event.id);
    return { status: 200, body: { received: true } };
  };
}
