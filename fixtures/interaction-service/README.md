# interaction-service

A small, dependency-free Node service (ESM): login, accounts, and file uploads.

```sh
npm test   # node --test
```

## Layout

| Path                          | What it does                                               |
| ----------------------------- | ---------------------------------------------------------- |
| `src/rate-limit.js`           | Per-key fixed-window rate limiter.                         |
| `src/auth/login.js`           | Password login, throttled by `src/rate-limit.js`.          |
| `src/accounts/store.js`       | In-memory users and their data (orders, files).            |
| `src/accounts/delete-account.js` | Account deletion.                                       |
| `src/uploads/retry.js`        | `withRetry`: the retry policy for uploads.                 |
| `src/uploads/*.js`            | Avatar, document, and attachment uploads.                  |
| `docs/data-retention.md`      | Data retention policy.                                     |
