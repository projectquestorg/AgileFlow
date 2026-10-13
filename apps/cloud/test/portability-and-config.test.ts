import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { clerkMembershipSource, UpstreamUnavailable } from '../src/auth/membership';
import { configFromEnv } from '../src/config';
import { harness, seeded } from './helpers';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

function readWork(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const abs = path.join(d, e.name);
      if (e.isDirectory()) walk(abs);
      else if (e.name.endsWith('.md')) out[path.relative(dir, abs).split(path.sep).join('/')] = fs.readFileSync(abs, 'utf8');
    }
  };
  walk(dir);
  return out;
}

describe('native Work import, re-import, and export', () => {
  it('imports the agile-app fixture preserving IDs, relations, and documents; re-import is three-way', async () => {
    const h = await harness();
    const { admin, projectId } = await seeded(h);
    const files = readWork(path.join(ROOT, 'fixtures/agile-app/docs/agile'));
    const preview = (await h.api(admin, 'POST', `/projects/${projectId}/import/preview`, { files, operationKey: h.rid() })).body.data;
    expect(preview.preview.blocked).toBe(false);
    expect(preview.preview.counts).toMatchObject({ epics: 2, stories: 2, decisions: 1, documents: 2 });
    const commit = (await h.api(admin, 'POST', `/projects/${projectId}/import/${preview.jobId}/commit`, { requestId: h.rid() })).body;
    expect(commit.data.created).toBe(5);
    // Retrying the commit is safe.
    const retry = (await h.api(admin, 'POST', `/projects/${projectId}/import/${preview.jobId}/commit`, { requestId: h.rid() })).body;
    expect(retry.data.created).toBe(5);
    const story = (await h.api(admin, 'POST', `/projects/${projectId}/tools/agileflow_work_get`, { workId: 'STORY-R3N7M2QA' })).body.data;
    expect(story.id).toBe('STORY-R3N7M2QA');
    const product = (await h.api(admin, 'POST', `/projects/${projectId}/tools/agileflow_document_get`, { document: 'product' })).body.data;
    expect(product.content.body).toBe(files['00-product/product.md']);

    // Both sides change the same story: re-import reports a conflict; a file-only change is an update.
    const storyPath = Object.keys(files).find((f) => f.includes('STORY-R3N7M2QA'))!;
    const otherPath = Object.keys(files).find((f) => f.includes('STORY-M9V4C6TE'))!;
    await h.api(admin, 'POST', `/projects/${projectId}/tools/agileflow_work_update`, { workId: 'STORY-R3N7M2QA', expectedVersion: story.version, patch: { title: 'Cloud title' }, requestId: h.rid() });
    const edited = { ...files };
    edited[storyPath] = files[storyPath]!.replace(/^title: .*$/m, 'title: File title');
    edited[otherPath] = files[otherPath]! + '\nLocal addition.\n';
    delete edited['04-decisions/DEC-P3M9A6HD-role-model.md'];
    const re = (await h.api(admin, 'POST', `/projects/${projectId}/import/preview`, { files: edited, operationKey: h.rid() })).body.data;
    const byId = Object.fromEntries(re.preview.changes.map((c: any) => [c.id, c.action]));
    expect(byId['STORY-R3N7M2QA']).toBe('conflict');
    expect(byId['STORY-M9V4C6TE']).toBe('update');
    expect(byId['DEC-P3M9A6HD']).toBe('possible-removal');
    const blocked = (await h.api(admin, 'POST', `/projects/${projectId}/import/${re.jobId}/commit`, { requestId: h.rid() })).body;
    expect(blocked.error.code).toBe('VERSION_CONFLICT');
    const done = (await h.api(admin, 'POST', `/projects/${projectId}/import/${re.jobId}/commit`, { resolutions: { 'STORY-R3N7M2QA': 'cloud' }, requestId: h.rid() })).body.data;
    expect(done.updated).toBe(1);
    // Missing file did not delete; cloud title kept.
    expect((await h.api(admin, 'POST', `/projects/${projectId}/tools/agileflow_work_get`, { workId: 'DEC-P3M9A6HD' })).body.ok).toBe(true);
    expect((await h.api(admin, 'POST', `/projects/${projectId}/tools/agileflow_work_get`, { workId: 'STORY-R3N7M2QA' })).body.data.title).toBe('Cloud title');
  });

  it('blocks duplicate IDs and dangling references, and rejects unsafe paths', async () => {
    const h = await harness();
    const { admin, projectId } = await seeded(h);
    const files = readWork(path.join(ROOT, 'fixtures/agile-app/docs/agile'));
    const storyPath = Object.keys(files).find((f) => f.startsWith('03-stories/'))!;
    const dup = { ...files, '03-stories/STORY-COPY-duplicate.md': files[storyPath]! };
    const p = (await h.api(admin, 'POST', `/projects/${projectId}/import/preview`, { files: dup, operationKey: h.rid() })).body.data;
    expect(p.preview.blocked).toBe(true);
    expect(p.preview.issues.some((i: any) => /duplicate/.test(i.message))).toBe(true);
    expect((await h.api(admin, 'POST', `/projects/${projectId}/import/${p.jobId}/commit`, { requestId: h.rid() })).body.error.code).toBe('VALIDATION_ERROR');
    for (const bad of ['../etc/passwd.md', '/abs.md', '02-epics/../../x.md', 'src/app.md', '02-epics\\x.md']) {
      const r = (await h.api(admin, 'POST', `/projects/${projectId}/import/preview`, { files: { [bad]: 'x' }, operationKey: h.rid() })).body;
      expect(r.error?.code, bad).toBe('VALIDATION_ERROR');
    }
    // A viewer cannot even prepare an import; an editor's preview needs an admin to commit.
    const viewer = await h.session('user_viewer', 'org_acme', 'member');
    expect((await h.api(viewer, 'POST', `/projects/${projectId}/import/preview`, { files, operationKey: h.rid() })).body.error.code).toBe('FORBIDDEN');
  });
});

describe('production configuration', () => {
  it('requires an explicit issuer and cursor secret outside dev mode', () => {
    expect(() => configFromEnv({})).toThrow(/CLERK_ISSUER/);
    expect(() => configFromEnv({ CLERK_ISSUER: 'https://clerk.example.com' })).toThrow(/AGILEFLOW_CURSOR_SECRET/);
    const cfg = configFromEnv({ CLERK_ISSUER: 'https://clerk.example.com', AGILEFLOW_CURSOR_SECRET: 's', AGILEFLOW_PUBLIC_URL: 'https://app.example.com/' });
    expect(cfg.auth.resources).toEqual({ mcp: 'https://app.example.com/mcp', cli: 'https://app.example.com/cli', 'local-control': 'https://app.example.com/local-control' });
    expect(cfg.authorizationServer).toBe('https://clerk.example.com');
    expect(cfg.devAuth).toBe(false);
  });

  it('reads Clerk memberships and fails closed when Clerk is unavailable', async () => {
    const calls: string[] = [];
    const ok = clerkMembershipSource('sk_test', 'https://api.clerk.test', (async (url: string) => {
      calls.push(url);
      return new Response(JSON.stringify({ data: [{ role: 'org:admin', organization: { name: 'Acme' }, public_user_data: { user_id: 'user_1', first_name: 'Ada', identifier: 'ada@example.com' } }] }), { status: 200 });
    }) as never);
    expect(await ok.fetch('org_1', 'user_1')).toEqual({ role: 'admin', orgName: 'Acme', user: { displayName: 'Ada', email: 'ada@example.com' } });
    expect(calls[0]).toBe('https://api.clerk.test/v1/organizations/org_1/memberships?user_id=user_1&limit=1');
    expect(await ok.fetch('org_1', 'user_2')).toBeNull();
    const down = clerkMembershipSource('sk_test', 'https://api.clerk.test', (async () => new Response('x', { status: 503 })) as never);
    await expect(down.fetch('org_1', 'user_1')).rejects.toBeInstanceOf(UpstreamUnavailable);
    const gone = clerkMembershipSource('sk_test', 'https://api.clerk.test', (async () => new Response('{}', { status: 404 })) as never);
    expect(await gone.fetch('org_1', 'user_1')).toBeNull();
  });
});
