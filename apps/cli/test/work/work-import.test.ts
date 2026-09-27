import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { scriptedPrompter } from '../../src/ui/prompts';
import { read, tree } from '../helpers';
import { json, sandbox, workSandbox } from './helpers';

const V4: Record<string, string> = {
  'docs/09-agents/status.json': JSON.stringify({
    epics: { 'EP-0001': { title: 'Onboarding', status: 'active' } },
    stories: {
      'US-0001': { title: 'Welcome screen', epic: 'EP-0001', status: 'completed', priority: 'P1', acceptance_criteria: ['Shows a greeting'] },
      'US-0002': { title: 'Tour', epic: 'EP-0001', status: 'ready', depends_on: ['US-0001'] },
    },
  }),
  'docs/06-stories/US-0002-tour.md': '---\nstory_id: US-0002\nepic: EP-0001\n---\n\n# US-0002: Tour\n\n## Acceptance Criteria\n- [ ] Three steps\n',
};

function writeV4(project: string): void {
  for (const [rel, content] of Object.entries(V4)) {
    fs.mkdirSync(path.dirname(path.join(project, rel)), { recursive: true });
    fs.writeFileSync(path.join(project, rel), content);
  }
}

const workFiles = (project: string) => tree(path.join(project, 'docs/agile')).filter((f) => /^0[234]-.*\.md$/.test(f));

describe('agileflow work import v4', () => {
  it('previews by default when not interactive; --yes imports; running again imports nothing', async () => {
    const sb = await workSandbox();
    writeV4(sb.project);

    const preview = await sb.af(['work', 'import', 'v4']);
    expect(preview.code).toBe(0);
    expect(preview.stdout).toContain('Import the v4 backlog into docs/agile/');
    expect(preview.stdout).toContain('Read: docs/09-agents/status.json, docs/06-stories');
    expect(preview.stdout).toMatch(/EP-0001\s+EPIC-\w{8}\s+active\s+Onboarding/);
    expect(preview.stdout).toMatch(/US-0002\s+STORY-\w{8}\s+ready\s+EP-0001\s+Tour/);
    expect(preview.stdout).toContain('Nothing was written. Run `agileflow work import v4 --yes`');
    expect(workFiles(sb.project)).toEqual([]);
    expect((await sb.af(['work', 'import', 'v4', '--preview', '--yes'])).stdout).toContain('Nothing was written.');
    expect(workFiles(sb.project)).toEqual([]);

    const res = await sb.af(['work', 'import', 'v4', '--yes']);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('Imported 1 epic and 2 stories into docs/agile/.');
    expect(res.stdout).toContain('The v4 files were not changed');
    for (const [rel, content] of Object.entries(V4)) expect(read(path.join(sb.project, rel))).toBe(content);

    const stories = await json<Array<Record<string, unknown>>>(sb, ['work', 'list', '--type', 'story']);
    const byLegacy = Object.fromEntries(stories.map((s) => [s.legacy_id, s]));
    const [epic] = await json<Array<Record<string, unknown>>>(sb, ['work', 'list', '--type', 'epic']);
    expect(epic).toMatchObject({ title: 'Onboarding', status: 'active', legacy_id: 'EP-0001' });
    expect(byLegacy['US-0001']).toMatchObject({ title: 'Welcome screen', status: 'done', priority: 'p1', epic: epic!.id, acceptanceCriteria: { total: 1, checked: 1 } });
    expect(byLegacy['US-0002']).toMatchObject({ status: 'ready', epic: epic!.id, depends_on: [byLegacy['US-0001']!.id], ready: true });
    expect((await sb.af(['check'])).code).toBe(0);

    const again = await sb.af(['work', 'import', 'v4', '--yes']);
    expect(again.stdout).toContain('Already imported: 3 (skipped)');
    expect(again.stdout).toContain('Nothing to import.');
    expect(workFiles(sb.project)).toHaveLength(3);
  });

  it('asks before writing when interactive', async () => {
    const sb = await workSandbox();
    writeV4(sb.project);
    const declined = await sb.af(['work', 'import', 'v4'], { prompter: scriptedPrompter([false]) });
    expect(declined.stdout).toContain('Nothing was written.');
    expect(workFiles(sb.project)).toEqual([]);
    const accepted = await sb.af(['work', 'import', 'v4'], { prompter: scriptedPrompter([true]) });
    expect(accepted.code).toBe(0);
    expect(workFiles(sb.project)).toHaveLength(3);
  });

  it('--json: plan without --yes, result with --yes, errors as JSON', async () => {
    const sb = await workSandbox();
    writeV4(sb.project);
    const plan = await json<Record<string, unknown>>(sb, ['work', 'import', 'v4']);
    expect(plan).toMatchObject({ applied: false, root: 'docs/agile', sources: ['docs/09-agents/status.json', 'docs/06-stories'], created: [], skipped: [], notes: [] });
    expect((plan.stories as Array<Record<string, unknown>>)[1]).toMatchObject({
      legacyId: 'US-0002',
      type: 'story',
      title: 'Tour',
      status: 'ready',
      legacyStatus: 'ready',
      priority: null,
      sources: ['docs/09-agents/status.json', 'docs/06-stories/US-0002-tour.md'],
    });
    expect(workFiles(sb.project)).toEqual([]);
    const applied = await json<{ applied: boolean; created: string[] }>(sb, ['work', 'import', 'v4', '--yes']);
    expect(applied.applied).toBe(true);
    expect(applied.created).toHaveLength(3);

    const empty = await workSandbox();
    const none = await empty.af(['work', 'import', 'v4', '--json']);
    expect(none.code).toBe(1);
    expect(JSON.parse(none.stdout).error.message).toBe('No v4 backlog found');
    expect(JSON.parse((await empty.af(['work', 'import', 'v3', '--json'])).stdout).error.message).toBe('Cannot import from "v3"');
    const off = await sandbox();
    expect((await off.af(['work', 'import', 'v4'])).stderr).toContain('AgileFlow Work is not enabled');
  });
});
