import { handleLogin } from './auth/login.js';
import { requireAuth } from './auth/middleware.js';
import { handleProfile } from './routes/profile.js';
import { handleDeactivate } from './admin/deactivate.js';
import { getInvoice } from './billing/store.js';
import { createPaymentWebhookHandler } from './webhooks/payment.js';
import { createRateLimiter } from './rate-limit.js';
import { UserNotFoundError } from '../packages/core/src/errors.js';

const loginLimiter = createRateLimiter();
const paymentWebhook = createPaymentWebhookHandler();

const me = requireAuth((req) => ({ status: 200, body: { id: req.user.id, name: req.user.name, role: req.user.role } }));
const invoice = requireAuth((req, id) => {
  const inv = getInvoice(id);
  return inv ? { status: 200, body: inv } : { status: 404, body: { error: 'not found' } };
});
const deactivate = requireAuth(handleDeactivate, { role: 'admin' });

function route(req) {
  const { method, url } = req;
  let m;
  if (method === 'POST' && url === '/login') {
    const verdict = loginLimiter.check(req.ip ?? 'unknown');
    if (!verdict.allowed) return { status: 429, body: { error: 'too many requests' } };
    return handleLogin(req);
  }
  if (method === 'GET' && url === '/me') return me(req);
  if (method === 'GET' && (m = url.match(/^\/users\/([\w-]+)$/))) return handleProfile(req, m[1]);
  if (method === 'GET' && (m = url.match(/^\/invoices\/([\w-]+)$/))) return invoice(req, m[1]);
  if (method === 'POST' && (m = url.match(/^\/admin\/users\/([\w-]+)\/deactivate$/))) return deactivate(req, m[1]);
  if (method === 'POST' && url === '/webhooks/payment') return paymentWebhook(req);
  return { status: 404, body: { error: 'not found' } };
}

/**
 * Route a request: `{ method, url, headers, body, rawBody, ip }` -> `{ status, body }`.
 * Uncaught errors become 500s.
 */
export function handle(req) {
  try {
    return route({ headers: {}, ...req });
  } catch (err) {
    if (err instanceof UserNotFoundError) return { status: 404, body: { error: 'not found' } };
    console.error(err);
    return { status: 500, body: { error: 'internal server error' } };
  }
}
