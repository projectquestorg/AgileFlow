import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { create, sandbox, workSandbox } from './helpers';

describe('agileflow check validates Agile Work', () => {
  it('reports counts and passed checks, and warnings keep the result healthy', async () => {
    const sb = await workSandbox();
    const dep = await create(sb, 'story', 'Auth provider abstraction', '--status', 'in-progress');
    await create(sb, 'story', 'Google sign-in', '--status', 'ready', '--depends-on', dep);
    await create(sb, 'epic', 'Social authentication');
    const res = await sb.af(['check']);
    expect(res.code).toBe(0);
    const section = res.stdout.slice(res.stdout.indexOf('Agile Work'));
    expect(section).toContain(
      [
        'Agile Work',
        '  [ok] workspace structure valid',
        '  [ok] 1 epic',
        '  [ok] 2 stories',
        '  [ok] 0 decisions',
        '  [ok] no duplicate IDs',
        '  [ok] no missing epic references',
        '  [ok] dependency graph valid',
      ].join('\n'),
    );
    expect(section).toMatch(/\[!\] STORY-\w{8} is marked ready but depends on STORY-\w{8} \(in-progress\)/);
    expect(res.stdout).toContain('Result: healthy with 1 warning');
  });

  it('fails on duplicate ids, unknown epics, missing dependencies, cycles, and done epics with open stories', async () => {
    const sb = await sandbox('agile-app');
    await sb.af(['sync']);
    const stories = path.join(sb.project, 'docs/agile/03-stories');
    const rename = fs.readFileSync(path.join(stories, 'STORY-R3N7M2QA-rename-workspace.md'), 'utf8');
    fs.writeFileSync(path.join(stories, 'STORY-R3N7M2QA-rename-copy.md'), rename);
    fs.writeFileSync(
      path.join(stories, 'STORY-AAAA1111-a.md'),
      '---\nschema: 1\ntype: story\nid: STORY-AAAA1111\ntitle: A\nstatus: backlog\nepic: EPIC-ZZZZ2222\ndepends_on:\n  - STORY-BBBB2222\n---\n# A\n',
    );
    fs.writeFileSync(
      path.join(stories, 'STORY-BBBB2222-b.md'),
      '---\nschema: 1\ntype: story\nid: STORY-BBBB2222\ntitle: B\nstatus: backlog\ndepends_on:\n  - STORY-AAAA1111\n  - STORY-CCCC3333\n---\n# B\n',
    );
    const epic = path.join(sb.project, 'docs/agile/02-epics/EPIC-W5K8R2QT-workspace-management.md');
    fs.writeFileSync(epic, fs.readFileSync(epic, 'utf8').replace('status: active', 'status: done'));
    const res = await sb.af(['check']);
    expect(res.code).toBe(1);
    const out = res.stdout;
    expect(out).toContain('[x] duplicate story id STORY-R3N7M2QA');
    expect(out).toContain('docs/agile/03-stories/STORY-R3N7M2QA-rename-copy.md');
    expect(out).toContain('[x] STORY-AAAA1111 references unknown epic EPIC-ZZZZ2222');
    expect(out).toContain('[x] STORY-BBBB2222 depends on unknown story STORY-CCCC3333');
    expect(out).toContain('[x] dependency cycle\n       STORY-AAAA1111 -> STORY-BBBB2222 -> STORY-AAAA1111');
    expect(out).toContain('[x] EPIC-W5K8R2QT is marked done but has unfinished stories:');
    expect(out).toMatch(/Result: \d+ problems found/);
    const asJson = JSON.parse((await sb.af(['check', '--json'])).stdout);
    expect(asJson[0].healthy).toBe(false);
    expect(asJson[0].sections.map((s: { title: string }) => s.title)).toContain('Agile Work');
  });

  it('warns about done stories with unchecked criteria and stray files, without changing anything', async () => {
    const sb = await sandbox('agile-app');
    await sb.af(['sync']);
    const file = path.join(sb.project, 'docs/agile/03-stories/STORY-M9V4C6TE-leave-workspace.md');
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('status: in-review', 'status: done'));
    fs.writeFileSync(path.join(sb.project, 'docs/agile/status.json'), '{}');
    const res = await sb.af(['check']);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('[!] STORY-M9V4C6TE is done but has 4 unchecked acceptance criteria');
    expect(res.stdout).toContain('[!] status.json is not part of the Work workspace');
    expect(fs.readFileSync(file, 'utf8')).toContain('status: done');
  });

  it('projects without Work get no Agile Work section', async () => {
    const sb = await sandbox();
    await sb.af(['init', '--yes']);
    expect((await sb.af(['check'])).stdout).not.toContain('Agile Work');
  });
});
