import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import YAML from 'yaml';
import { BASE, harness, seeded, type Harness } from '../../../cloud/test/helpers';
import { memoryStore } from '../../src/cloud/credentials';
import type { CloudDeps } from '../../src/cloud/client';
import { createSandbox, exists, read, type Sandbox } from '../helpers';

/**
 * `agileflow cloud` against the in-process dev service: real OAuth (dev
 * authorization server, PKCE, loopback redirect), real connected CLI and
 * local-control APIs, and a real project on disk for the companion.
 */

let h: Harness;
let sb: Sandbox;
let pid: string;
let admin: string;
const store = memoryStore();
let browserAs = { user: 'user_admin', org: 'org_acme' };
let onSleep: (() => Promise<void>) | null = null;

const decode = (s: string) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/** Plays the user in the browser: open the dev consent form, submit it, follow the redirect to the CLI's loopback server. */
async function browser(url: string) {
  const page = await h.fetchApp(url);
  expect(page.status).toBe(200);
  const html = await page.text();
  const form = new URLSearchParams();
  for (const m of html.matchAll(/<input type="hidden" name="(\w+)" value="([^"]*)">/g)) form.append(m[1]!, decode(m[2]!));
  form.append('user', browserAs.user);
  form.append('org', browserAs.org);
  form.append('role', 'admin');
  for (const s of (new URL(url).searchParams.get('scope') ?? '').split(' ')) if (s) form.append('scope', s);
  const res = await h.fetchApp(url.split('?')[0]!, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form.toString() });
  expect(res.status).toBe(302);
  const cb = await fetch(res.headers.get('location')!);
  expect(cb.status).toBe(200);
}

function cloud(): Partial<CloudDeps> {
  return {
    fetch: ((input: string | URL | Request, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      return url.startsWith(BASE) ? h.fetchApp(url, init) : fetch(input, init);
    }) as typeof fetch,
    store,
    openBrowser: (url) => browser(url),
    sleep: async () => {
      if (onSleep) await onSleep();
    },
    arch: 'x64',
  };
}

const af = (args: string[]) => sb.af(['cloud', ...args], { cloud: cloud(), env: { AGILEFLOW_CLOUD_URL: BASE } });

beforeAll(async () => {
  h = await harness();
  const s = await seeded(h);
  pid = s.projectId;
  admin = s.admin;
  sb = await createSandbox({ fixture: 'clean-node' });
  expect((await sb.af(['init', '--yes'])).code).toBe(0);
  expect((await sb.af(['work', 'init', '--yes', '--no-skills'])).code).toBe(0);
  expect((await sb.af(['work', 'new', 'story', '--title', 'Imported story'])).code).toBe(0);
}, 120_000);

afterAll(() => sb?.cleanup());

describe('agileflow cloud', () => {
  it('status before sign-in reports each state separately', async () => {
    const r = await af(['status', '--json']);
    expect(r.code).toBe(1);
    const j = JSON.parse(r.stdout);
    expect(j.registered.ok).toBe(false);
    expect(j.reachable.ok).toBe(true);
    expect(j.authorized.ok).toBe(false);
    expect(j.operationVerified.ok).toBe(false);
  });

  it('login runs the PKCE flow and requests only the minimum scopes by default', async () => {
    const r = await af(['login']);
    expect(r.code, r.stderr).toBe(0);
    expect(r.stderr).toContain('/dev/oauth/authorize?');
    expect(r.stdout).toContain('Scopes: user:org:read agileflow:read');
    const rec = JSON.parse(store.entries.get(`oauth:${BASE}:cli`)!);
    expect(rec.scopes).toEqual(['user:org:read', 'agileflow:read']);
    expect(rec.resourceUri).toBe(`${BASE}/cli`);
    expect(rec.refreshToken).toBeTruthy();
  });

  it('refreshes an access token near expiry, keeping the refresh token client-side', async () => {
    const key = `oauth:${BASE}:cli`;
    const rec = JSON.parse(store.entries.get(key)!);
    store.entries.set(key, JSON.stringify({ ...rec, expiresAt: Date.now() + 5_000 }));
    const r = await af(['status', '--json']);
    const after = JSON.parse(store.entries.get(key)!);
    expect(after.accessToken).not.toBe(rec.accessToken);
    expect(after.refreshToken).not.toBe(rec.refreshToken);
    expect(JSON.parse(r.stdout).authorized.ok).toBe(true);
  });

  it('connect refuses an unknown project and writes a token-free manifest for a known one', async () => {
    expect((await af(['connect', '--project', 'prj_nope'])).stderr).toContain('not available to this sign-in');
    const r = await af(['connect', '--project', pid]);
    expect(r.code, r.stderr).toBe(0);
    const text = read(path.join(sb.project, '.agileflow/connection.json'));
    const m = JSON.parse(text);
    expect(m).toMatchObject({ schemaVersion: 1, service: BASE, projectId: pid, authority: 'connected', repoIdentity: null });
    expect(m.checkout.pathHash).toMatch(/^[0-9a-f]{64}$/);
    expect(m.workspaceId).toBeTruthy();
    expect(m.minimumCliVersion).toBeTruthy();
    expect(text).not.toMatch(/eyJ|refresh|accessToken/);
    expect(read(path.join(sb.project, '.gitignore'))).toContain('.agileflow/connection.json');
    expect(r.stdout).toContain('Added .agileflow/connection.json to .gitignore');
  });

  it('status shows four passing states once connected', async () => {
    const r = await af(['status']);
    expect(r.code, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toMatch(/\[ok\] registered/);
    expect(r.stdout).toMatch(/\[ok\] reachable/);
    expect(r.stdout).toMatch(/\[ok\] authorized\s+Acme|\[ok\] authorized/);
    expect(r.stdout).toMatch(/\[ok\] operation verified/);
    expect(r.stdout).toContain('scopes: agileflow:read user:org:read');
  });

  it('a write without the scope explains which scope is needed', async () => {
    const r = await af(['work', 'create', 'story', 'Needs', 'scope']);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('agileflow:work:write');
    expect(r.stderr).toContain('agileflow cloud login --scope agileflow:work:write');
  });

  it('work create, list, show, move, and note go through the service', async () => {
    expect((await af(['login', '--scope', 'agileflow:work:write', '--scope', 'agileflow:notes:write'])).code).toBe(0);
    const c = await af(['work', 'create', 'story', 'Ship', 'the', 'thing', '--json']);
    expect(c.code, c.stderr).toBe(0);
    expect(c.stderr).toContain(`Project: Acme App (${pid})`);
    const id = JSON.parse(c.stdout).result.data.id as string;
    expect(id).toMatch(/^STORY-/);
    const l = await af(['work', 'list']);
    expect(l.stdout).toContain(id);
    expect(l.stdout).toContain('Ship the thing');
    const m = await af(['work', 'move', id, 'ready']);
    expect(m.code, m.stderr).toBe(0);
    expect(m.stdout).toContain(`${id}: backlog -> ready`);
    const s = await af(['work', 'show', id, '--json']);
    expect(JSON.parse(s.stdout).item.status).toBe('ready');
    const n = await af(['work', 'note', 'Looks', 'good', '--work', id]);
    expect(n.code, n.stderr).toBe(0);
  });

  it('refuses a binding whose checkout moved or whose Git remote changed', async () => {
    const file = path.join(sb.project, '.agileflow/connection.json');
    const original = read(file);
    const m = JSON.parse(original);
    fs.writeFileSync(file, JSON.stringify({ ...m, checkout: { pathHash: '0'.repeat(64) } }));
    let r = await af(['work', 'list']);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('moved or is a different worktree');
    fs.writeFileSync(file, JSON.stringify({ ...m, repoIdentity: 'github.com/someone/else' }));
    r = await af(['work', 'list']);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('Git remote changed');
    fs.writeFileSync(file, original);
    expect((await af(['work', 'list'])).code).toBe(0);
  });

  it('a paused project refuses CLI work writes (no local fallback) while notes still work', async () => {
    await h.api(admin, 'PATCH', `/projects/${pid}`, { clientWritesPaused: true, requestId: h.rid() });
    const before = fs.readdirSync(path.join(sb.project, 'docs/agile/03-stories')).length;
    const c = await af(['work', 'create', 'story', 'Blocked']);
    expect(c.code).toBe(1);
    expect(c.stderr).toContain('CLIENT_WRITES_PAUSED');
    expect(fs.readdirSync(path.join(sb.project, 'docs/agile/03-stories')).length).toBe(before);
    expect((await af(['work', 'note', 'still', 'allowed'])).code).toBe(0);
    await h.api(admin, 'PATCH', `/projects/${pid}`, { clientWritesPaused: false, requestId: h.rid() });
  });

  it('import uploads the native Work tree for preview and prints the review URL', async () => {
    const before = read(path.join(sb.project, 'docs/agile/README.md'));
    const r = await af(['import', '--json']);
    expect(r.code, r.stderr).toBe(0);
    const j = JSON.parse(r.stdout);
    expect(j.reviewUrl).toContain(`${BASE}/#/p/${pid}/import/`);
    expect(j.preview.counts.stories).toBe(1);
    expect(read(path.join(sb.project, 'docs/agile/README.md'))).toBe(before);
    const text = await af(['import']);
    expect(text.stdout).toContain('confirms the import in the dashboard');
  });

  it('export writes native files, complete JSON outside the Work root, and a validation report', async () => {
    const out = path.join(sb.root, 'export');
    const r = await af(['export', '--out', out, '--complete']);
    expect(r.code, r.stderr).toBe(0);
    const stories = fs.readdirSync(path.join(out, 'docs/agile/03-stories'));
    expect(stories.some((f) => f.endsWith('.md'))).toBe(true);
    expect(exists(path.join(out, 'docs/agile/README.md'))).toBe(true);
    expect(exists(path.join(out, 'agileflow-connected/notes.json'))).toBe(true);
    expect(JSON.parse(read(path.join(out, 'agileflow-connected/validation-report.json'))).projectId).toBe(pid);
    const again = await af(['export', '--out', out]);
    expect(again.code).toBe(1);
    expect(again.stderr).toContain('Refusing to overwrite');
  });

  describe('companion', () => {
    let companionId: string;
    const settings = async () => (await h.api(admin, 'POST', `/projects/${pid}/tools/agileflow_settings_get`, {})).body.data.checkouts[0];
    const yaml = () => YAML.parse(read(path.join(sb.project, 'agileflow.yaml')));

    it('refuses unsupported platforms', async () => {
      const r = await sb.af(['cloud', 'companion', 'enroll'], { cloud: { ...cloud(), arch: 'ia32' }, env: { AGILEFLOW_CLOUD_URL: BASE } });
      expect(r.code).toBe(1);
      expect(r.stderr).toContain('not supported on');
    });

    it('enrolls after a dashboard approval and stores the credential once', async () => {
      onSleep = async () => {
        const list = await h.api(admin, 'GET', `/projects/${pid}/companions`);
        const pending = list.body.data.pending[0];
        if (pending) await h.api(admin, 'POST', `/projects/${pid}/enrollments/${pending.id}/approve`, { capabilities: ['skills.enable', 'skills.activation', 'skills.update', 'providers.mode', 'questions.preference'], requestId: h.rid() });
      };
      const r = await af(['companion', 'enroll', '--apply']);
      onSleep = null;
      expect(r.code, r.stderr).toBe(0);
      expect(r.stdout).toContain(`${BASE}/#/p/${pid}/controls`);
      const key = [...store.entries.keys()].find((k) => k.startsWith('companion:'))!;
      const cred = JSON.parse(store.entries.get(key)!);
      expect(cred.credential).toMatch(/^afc_/);
      companionId = cred.companionId;
      const lc = JSON.parse(store.entries.get(`oauth:${BASE}:local-control`)!);
      expect(lc.scopes).toEqual(expect.arrayContaining(['agileflow:local:observe', 'agileflow:local:apply']));
    });

    it('run --once applies desired settings with native config writes and advances observedRevision', async () => {
      const put = await h.api(admin, 'PUT', `/projects/${pid}/settings`, {
        desired: { skills: { 'reviewing-changes': { activation: 'manual' } }, providers: { claude: 'on' }, questions: 'minimize' },
        requestId: h.rid(),
      });
      expect(put.status, JSON.stringify(put.body)).toBe(200);
      const r = await af(['companion', 'run', '--once']);
      expect(r.code, r.stderr).toBe(0);
      expect(r.stdout).toContain('applied');
      const y = yaml();
      expect(y.skills['reviewing-changes'].activation).toBe('manual');
      expect(y.providers.claude.enabled).toBe(true);
      expect(y.interaction.questionPreference).toBe('minimize');
      // Materialized like `agileflow configure`: the rendered skill reflects manual activation.
      expect(read(path.join(sb.project, '.agents/skills/reviewing-changes/SKILL.md'))).toContain('disable-model-invocation: true');
      const k = await settings();
      expect(k.observedRevision).toBe(k.desiredRevision);
      expect(k.lastOperation.state).toBe('applied');
      expect(k.lastOperation.receipt.reloadRequired).toBe(true);
      expect(k.observation.questions).toBe('minimize');
    });

    it('pins a dashboard-approved official skill version; an unavailable version fails and restores the range', async () => {
      const lockVersion = () => YAML.parse(read(path.join(sb.project, 'agileflow.lock'))).resolved['reviewing-changes'].version;
      const current = lockVersion();
      const range = yaml().skills['reviewing-changes'].version;
      await h.api(admin, 'PUT', `/projects/${pid}/settings`, { desired: { skills: { 'reviewing-changes': { version: '0.0.1' } } }, requestId: h.rid() });
      let r = await af(['companion', 'run', '--once']);
      expect(r.code, r.stderr).toBe(0);
      let k = await settings();
      expect(k.lastOperation.state).toBe('failed');
      expect(JSON.stringify(k.lastOperation.receipt.results)).toContain('No version of @agileflow/reviewing-changes matches');
      expect(yaml().skills['reviewing-changes'].version).toBe(range);
      expect(lockVersion()).toBe(current);

      await h.api(admin, 'PUT', `/projects/${pid}/settings`, { desired: { skills: { 'reviewing-changes': { version: current } } }, requestId: h.rid() });
      r = await af(['companion', 'run', '--once']);
      expect(r.code, r.stderr).toBe(0);
      k = await settings();
      expect(k.lastOperation.state).toBe('applied');
      expect(k.observedRevision).toBe(k.desiredRevision);
      expect(yaml().skills['reviewing-changes'].version).toBe(current);
      expect(lockVersion()).toBe(current);
      // A moving range is never accepted as a desired version.
      const bad = await h.api(admin, 'PUT', `/projects/${pid}/settings`, { desired: { skills: { 'reviewing-changes': { version: '^1' } } }, requestId: h.rid() });
      expect(bad.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('a locally modified skill is blocked, not overwritten', async () => {
      const lock = YAML.parse(read(path.join(sb.project, 'agileflow.lock')));
      const victim = Object.keys(lock.resolved).find((id) => id !== 'reviewing-changes')!;
      const file = path.join(sb.project, '.agents/skills', victim, 'SKILL.md');
      fs.appendFileSync(file, '\nLocal edit.\n');
      const edited = read(file);
      await h.api(admin, 'PUT', `/projects/${pid}/settings`, { desired: { skills: { [victim]: { activation: 'manual' } } }, requestId: h.rid() });
      const r = await af(['companion', 'run', '--once']);
      expect(r.code, r.stderr).toBe(0);
      expect(r.stdout).toContain('blocked');
      expect(read(file)).toBe(edited);
      expect(yaml().skills[victim]?.activation).not.toBe('manual');
      const k = await settings();
      expect(k.lastOperation.state).toBe('blocked');
      expect(k.observedRevision).toBeLessThan(k.desiredRevision);
    });

    it('a revoked companion can no longer poll; local disconnect reports remote revocation unconfirmed', async () => {
      await h.api(admin, 'POST', `/projects/${pid}/companions/${companionId}/revoke`, { requestId: h.rid() });
      const r = await af(['companion', 'run', '--once']);
      expect(r.code).toBe(1);
      expect(r.stderr).toContain('The service refused this companion');
      expect(r.stderr).toContain('disconnected in the dashboard');
      const d = await af(['companion', 'disconnect']);
      expect(d.code).toBe(0);
      expect(d.stdout).toContain('Remote revocation: unconfirmed');
      expect([...store.entries.keys()].some((k) => k.startsWith('companion:'))).toBe(false);
    });
  });

  it('disconnect removes the manifest; logout removes credentials and points to the dashboard', async () => {
    const d = await af(['disconnect']);
    expect(d.code).toBe(0);
    expect(exists(path.join(sb.project, '.agileflow/connection.json'))).toBe(false);
    const o = await af(['logout']);
    expect(o.stdout).toContain('Connections');
    expect([...store.entries.keys()]).toEqual([]);
  });
});
