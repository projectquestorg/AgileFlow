import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { dashboardRoutes } from '../src/dashboard/static';

const index = path.join(__dirname, '../src/dashboard/public/index.html');

describe.skipIf(!fs.existsSync(index))('dashboard static routes', () => {
  const app = dashboardRoutes('https://app.test', 'clerk.app.test');

  it.each(['/', '/sign-in', '/sign-up', '/sign-in/'])('serves the app with a CSP at %s', async (p) => {
    const res = await app.request(`${p}?redirect_url=https%3A%2F%2Fclerk.app.test%2Foauth%2Fauthorize`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(res.headers.get('content-security-policy')).toContain('https://clerk.app.test');
  });

  it('does not serve the app for other unknown paths', async () => {
    expect((await app.request('/sign-in-elsewhere')).status).toBe(404);
  });
});
