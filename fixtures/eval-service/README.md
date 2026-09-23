# eval-service

A small, dependency-free Node service (ESM). It handles login, invoices,
payment webhooks, exports, and static-site deploys.

```sh
npm test          # node --test
npm start         # HTTP server on PORT (default 3000)
npm run deploy -- --dir public
```

## Layout

| Path                        | What it does                                          |
| --------------------------- | ----------------------------------------------------- |
| `packages/core`             | Shared user store (`getUser`, `findUserByEmail`).     |
| `src/app.js`                | Request router: `handle({ method, url, headers, body })`. |
| `src/server.js`             | Wraps `handle` in `node:http`.                        |
| `src/auth/`                 | Login, sessions, and the `requireAuth` middleware.    |
| `src/billing/`              | Invoice totals, discounts, and the invoice store.     |
| `src/webhooks/payment.js`   | Payment provider webhook (HMAC-signed).               |
| `src/rate-limit.js`         | Per-key fixed-window rate limiter.                    |
| `src/export/`               | CSV export plus the deprecated `legacyExport`.        |
| `src/deploy.js`             | Uploads a directory to the CDN via `src/uploader.js`. |

## Configuration

- `PAYMENT_WEBHOOK_SECRET` - HMAC secret shared with the payment provider.
- `DEPLOY_URL` - base URL files are PUT to by `npm run deploy`.
