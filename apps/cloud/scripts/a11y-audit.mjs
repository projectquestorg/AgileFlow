// Automated WCAG 2.1 A/AA audit (axe-core) of every dashboard route at desktop and mobile widths, plus a
// keyboard-only check. Run against a dev server: AGILEFLOW_DEV_AUTH=1 PORT=8799 ... npx tsx apps/cloud/src/server.ts
//   AXE_PATH=node_modules/axe-core/axe.min.js [PLAYWRIGHT_MODULE=...] [CHROME_PATH=...] node apps/cloud/scripts/a11y-audit.mjs
import fs from 'node:fs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const axeSrc = fs.readFileSync(process.env.AXE_PATH, 'utf8');
const B = process.env.DASHBOARD_URL ?? 'http://localhost:8799/';
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(B);
await page.getByRole('button', { name: 'Sign in' }).click();
await page.getByLabel('Project name').fill('Audit');
await page.getByRole('button', { name: 'Create project' }).click();
await page.waitForURL(/overview/);
const base = page.url().replace(/overview$/, '');
const pid = base.match(/#\/p\/([^/]+)\//)[1];
const token = await page.evaluate(() => Object.values(sessionStorage).find((v) => typeof v === 'string' && v.split('.').length === 3) ?? JSON.stringify(sessionStorage));
const api = (name, args) => page.evaluate(async ([pid, name, args, token]) => (await fetch(`/api/projects/${pid}/tools/${name}`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(args) })).json(), [pid, name, args, token]);
const epic = await api('agileflow_work_create', { kind: 'epic', title: 'Audit epic', requestId: crypto.randomUUID() });
const story = await api('agileflow_work_create', { kind: 'story', title: 'Audit story', epic: epic.data?.id, requestId: crypto.randomUUID() });
const routes = ['overview', 'board', 'work', `work/${story.data?.id}`, `work/${epic.data?.id}`, 'decisions', 'docs/product', 'docs/roadmap', 'agents', 'notes', 'controls', 'approvals', 'admin', 'import', 'connect'];
const results = {};
for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  await page.setViewportSize(vp);
  for (const r of routes) {
    await page.goto(base + r);
    await page.waitForTimeout(900);
    await page.evaluate(axeSrc);
    const res = await page.evaluate(async () => (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] })).violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length, sample: v.nodes[0]?.target?.join(" "), html: v.nodes[0]?.html?.slice(0,220), fix: v.nodes[0]?.failureSummary?.slice(0,200) })));
    results[`${vp.width}:${r}`] = res;
  }
}
// Keyboard-only: tab to the first card status select on the board and change it.
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto(base + 'board');
await page.waitForTimeout(800);
let kb = 'not reached';
for (let i = 0; i < 80; i++) {
  await page.keyboard.press('Tab');
  const label = await page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? '');
  if (/status/i.test(label)) { kb = `focused "${label}"`; break; }
}
console.log(JSON.stringify({ keyboard: kb, results }, null, 1));
await browser.close();
