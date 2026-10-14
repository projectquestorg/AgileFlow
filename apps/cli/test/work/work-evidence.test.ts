import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { read } from '../helpers';
import { json, workSandbox } from './helpers';

const STORY = 'docs/agile/03-stories/STORY-AAAAAAA1.md';

async function storySandbox() {
  const sb = await workSandbox();
  fs.mkdirSync(path.join(sb.project, 'docs/agile/03-stories'), { recursive: true });
  fs.writeFileSync(
    path.join(sb.project, STORY),
    '---\nschema: 1\ntype: story\nid: STORY-AAAAAAA1\ntitle: Rename\nstatus: in-review\n---\n\n# Rename\n\n## Acceptance Criteria\n\n- [x] Owners can rename\n- [x] Members get an error\n- [ ] Names are trimmed\n',
  );
  fs.mkdirSync(path.join(sb.project, 'src'), { recursive: true });
  fs.writeFileSync(path.join(sb.project, 'src/rename.js'), 'module.exports = 1;\n');
  fs.writeFileSync(path.join(sb.project, 'src/rename.test.js'), 'test("renames", () => {});\n');
  execFileSync('git', ['add', '-A'], { cwd: sb.project });
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-qm', 'init'], { cwd: sb.project });
  return sb;
}

describe('agileflow work evidence', () => {
  it('records evidence per criterion; show reports verified / stale / not verified; checked boxes are not proof', async () => {
    const sb = await storySandbox();
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: sb.project, encoding: 'utf8' }).trim();

    const res = await sb.af(['work', 'evidence', 'AAAAAAA1', '--criterion', '1', '--kind', 'test', '--ref', 'src/rename.test.js::renames', '--file', 'src/rename.js']);
    expect(res.code).toBe(0);
    expect(res.stdout).toBe(
      [
        'Recorded evidence for STORY-AAAAAAA1 criterion 1: Owners can rename',
        `  test src/rename.test.js::renames at ${head.slice(0, 8)}`,
        '  Staleness is checked against: src/rename.test.js, src/rename.js',
        STORY,
        '',
      ].join('\n'),
    );
    expect(read(path.join(sb.project, STORY))).toContain(`## Evidence\n\n\`\`\`yaml agileflow-evidence\n- criterion: Owners can rename\n  kind: test\n  ref: src/rename.test.js::renames\n  commit: ${head}\n  files:\n    src/rename.test.js: sha256:`);
    const pr = await json<{ record: { kind: string; files?: unknown } }>(sb, ['work', 'evidence', 'AAAAAAA1', '--criterion', 'members get', '--kind', 'pr', '--ref', 'https://github.com/o/r/pull/7', '--note', 'reviewed']);
    expect(pr.record.kind).toBe('pr');
    expect(pr.record.files).toBeUndefined();

    const show = await sb.af(['work', 'show', 'AAAAAAA1']);
    expect(show.stdout).toContain(
      [
        'Acceptance Criteria:',
        '  2 / 3 checked; evidence: 2 verified, 1 not verified',
        '  [x] 1. Owners can rename  (verified)',
        `         test src/rename.test.js::renames (at ${head.slice(0, 8)}, `,
      ].join('\n'),
    );
    expect(show.stdout).toContain(`  [x] 2. Members get an error  (verified)\n         pr https://github.com/o/r/pull/7 (at ${head.slice(0, 8)}, `);
    expect(show.stdout).toContain(') - reviewed\n  [ ] 3. Names are trimmed  (not verified)\n');

    // The code changes: the test evidence becomes stale.
    fs.writeFileSync(path.join(sb.project, 'src/rename.js'), 'module.exports = 2;\n');
    const stale = await sb.af(['work', 'evidence', 'AAAAAAA1']);
    expect(stale.stdout).toContain('  2 / 3 checked; evidence: 1 verified, 1 stale, 1 not verified');
    expect(stale.stdout).toContain('  [x] 1. Owners can rename  (stale)');
    expect(stale.stdout).toContain('; changed since: src/rename.js');
    const data = await json<{ evidence: { counts: Record<string, number>; criteria: Array<{ status: string; checked: boolean }> } }>(sb, ['work', 'show', 'AAAAAAA1']);
    expect(data.evidence.counts).toEqual({ verified: 1, stale: 1, 'not-verified': 1 });
    expect(data.evidence.criteria.map((c) => `${c.checked} ${c.status}`)).toEqual(['true stale', 'true verified', 'false not-verified']);

    // Unchecking or editing a criterion orphans its evidence: shown, and `check` warns.
    fs.writeFileSync(path.join(sb.project, STORY), read(path.join(sb.project, STORY)).replace('- [x] Members get an error', '- [x] Members get a clear error'));
    const orphan = await sb.af(['work', 'show', 'AAAAAAA1']);
    expect(orphan.stdout).toContain('  [x] 2. Members get a clear error  (not verified: checked, no evidence)');
    expect(orphan.stdout).toContain('  Evidence for criteria that no longer exist (edited or removed):\n    "Members get an error": pr https://github.com/o/r/pull/7');
    expect((await sb.af(['check'])).stdout).toContain('STORY-AAAAAAA1: 1 evidence record is for a criterion that no longer exists');
  });

  it('explains missing options and bad input without writing', async () => {
    const sb = await storySandbox();
    const before = read(path.join(sb.project, STORY));
    const missing = await sb.af(['work', 'evidence', 'AAAAAAA1', '--criterion', '1']);
    expect(missing.code).toBe(1);
    expect(missing.stderr).toContain('Recording evidence needs --kind, --ref');
    const kind = await sb.af(['work', 'evidence', 'AAAAAAA1', '--criterion', '9', '--kind', 'test', '--ref', 'x', '--json']);
    expect(JSON.parse(kind.stdout).error.message).toBe('STORY-AAAAAAA1 has 3 acceptance criteria; there is no criterion 9');
    expect(read(path.join(sb.project, STORY))).toBe(before);
  });
});
