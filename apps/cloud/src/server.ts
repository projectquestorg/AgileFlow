import { serve } from '@hono/node-server';
import { serviceFromEnv } from './bootstrap';

const port = Number(process.env.PORT ?? 8787);
const { app, services } = await serviceFromEnv();
serve({ fetch: app.fetch, port }, (info) => {
  console.log(JSON.stringify({ level: 'info', msg: 'agileflow cloud listening', port: info.port, devAuth: process.env.AGILEFLOW_DEV_AUTH === '1' }));
});
// Outbox delivery (change notifications) after commit.
services.outbox.start();
// Background maintenance: purge projects past the recovery window.
setInterval(() => void services.admin.purgeExpired().catch((err) => console.error(JSON.stringify({ level: 'error', msg: 'purge failed', error: String(err).slice(0, 200) }))), 3600_000).unref();
