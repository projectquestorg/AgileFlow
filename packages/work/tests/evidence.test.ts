import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  contentHash,
  evaluateEvidence,
  evidenceProblems,
  frontmatter,
  getStory,
  parseEvidence,
  recordEvidence,
  scanWorkspace,
  validateWorkspace,
} from '@agileflow/work';
import { project, put, story } from './helpers';

const BODY = '# Rename\n\n## Acceptance Criteria\n\n- [x] Owners can rename\n- [ ] Members get an error\n\n## Constraints\n\nNone.\n';

async function setup(body = BODY) {
  const { root, paths } = project();
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.mkdirSync(path.join(root, 'test'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src/rename.ts'), 'export const rename = 1;\n');
  fs.writeFileSync(path.join(root, 'test/rename.test.ts'), 'it("renames", () => {});\n');
  const file = put(paths, '03-stories/STORY-AAAAAAA1.md', story({ id: 'STORY-AAAAAAA1', status: 'in-progress' }, body));
  return { root, paths, file };
}

describe('acceptance-criteria evidence', () => {
  it('a checked box alone is not verified; recorded evidence is, until a hashed file changes', async () => {
    const { root, paths, file } = await setup();
    let scan = await scanWorkspace(paths);
    let e = await evaluateEvidence(root, getStory(scan, 'AAAAAAA1').body);
    expect(e.criteria.map((c) => [c.index, c.checked, c.status])).toEqual([
      [1, true, 'not-verified'],
      [2, false, 'not-verified'],
    ]);

    const recorded = await recordEvidence(scan, getStory(scan, 'AAAAAAA1'), {
      criterion: '1',
      kind: 'test',
      ref: 'test/rename.test.ts:1',
      note: 'happy path',
      files: ['src/rename.ts'],
      now: new Date('2026-09-29T12:00:00.000Z'),
    });
    expect(recorded).toMatchObject({ id: 'STORY-AAAAAAA1', criterion: { index: 1, text: 'Owners can rename' }, replaced: false });
    expect(recorded.record.files).toEqual({
      'test/rename.test.ts': contentHash(fs.readFileSync(path.join(root, 'test/rename.test.ts'))),
      'src/rename.ts': contentHash(fs.readFileSync(path.join(root, 'src/rename.ts'))),
    });
    const text = fs.readFileSync(file, 'utf8');
    // Frontmatter and the rest of the body are unchanged; the block is appended under ## Evidence.
    expect(frontmatter.parse(text).data).toEqual(frontmatter.parse(story({ id: 'STORY-AAAAAAA1', status: 'in-progress' }, BODY)).data);
    expect(text.startsWith(story({ id: 'STORY-AAAAAAA1', status: 'in-progress' }, BODY).trimEnd())).toBe(true);
    expect(text).toContain(
      [
        '## Evidence',
        '',
        '```yaml agileflow-evidence',
        '- criterion: Owners can rename',
        '  kind: test',
        '  ref: test/rename.test.ts:1',
        '  note: happy path',
      ].join('\n'),
    );
    expect(text).toContain('  recorded: 2026-09-29T12:00:00.000Z\n```\n');

    scan = await scanWorkspace(paths);
    e = await evaluateEvidence(root, getStory(scan, 'AAAAAAA1').body);
    expect(e.criteria.map((c) => c.status)).toEqual(['verified', 'not-verified']);
    expect(e.counts).toEqual({ verified: 1, stale: 0, 'not-verified': 1 });
    // Evidence checkboxes are fenced: the criteria count is unchanged.
    expect(e.criteria).toHaveLength(2);

    fs.writeFileSync(path.join(root, 'src/rename.ts'), 'export const rename = 2;\n');
    e = await evaluateEvidence(root, getStory(scan, 'AAAAAAA1').body);
    expect(e.criteria[0]).toMatchObject({ status: 'stale', records: [{ stale: true, changed: ['src/rename.ts'] }] });

    // Recording the same criterion, kind, and ref again refreshes it.
    const again = await recordEvidence(scan, getStory(scan, 'AAAAAAA1'), { criterion: 'owners can', kind: 'test', ref: 'test/rename.test.ts:1', files: ['src/rename.ts'] });
    expect(again.replaced).toBe(true);
    scan = await scanWorkspace(paths);
    e = await evaluateEvidence(root, getStory(scan, 'AAAAAAA1').body);
    expect(e.criteria[0]!.status).toBe('verified');
    expect(e.criteria[0]!.records).toHaveLength(1);
    expect(validateWorkspace(scan).issues).toEqual(expect.not.arrayContaining([expect.objectContaining({ message: expect.stringContaining('evidence') })]));
  });

  it('adds to an existing Evidence heading, keeps CRLF line endings, and refuses a changed file', async () => {
    const body = '# R\r\n\r\n## Acceptance Criteria\r\n\r\n- [ ] One\r\n\r\n## Evidence\r\n\r\nNotes by hand.\r\n';
    const { root, paths, file } = await setup(body);
    const scan = await scanWorkspace(paths);
    await recordEvidence(scan, getStory(scan, 'AAAAAAA1'), { criterion: 'One', kind: 'pr', ref: 'https://github.com/o/r/pull/1' });
    const text = fs.readFileSync(file, 'utf8');
    expect(text).toContain('## Evidence\r\n\r\n```yaml agileflow-evidence\r\n- criterion: One\r\n  kind: pr\r\n  ref: https://github.com/o/r/pull/1\r\n');
    expect(text).toContain('```\r\n\r\nNotes by hand.\r\n');
    const parsed = parseEvidence(frontmatter.parse(text).body);
    expect(parsed.problems).toEqual([]);
    expect(parsed.block!.records[0]).not.toHaveProperty('files');
    const e = await evaluateEvidence(root, frontmatter.parse(text).body);
    expect(e.criteria[0]!.status).toBe('verified');

    // The scan is now out of date: nothing is written.
    await expect(recordEvidence(scan, getStory(scan, 'AAAAAAA1'), { criterion: '1', kind: 'manual', ref: 'clicked through' })).rejects.toThrow('changed on disk');
    expect(fs.readFileSync(file, 'utf8')).toBe(text);
  });

  it('rejects bad input and reports broken or orphaned evidence', async () => {
    const { paths } = await setup();
    const scan = await scanWorkspace(paths);
    const s = getStory(scan, 'AAAAAAA1');
    await expect(recordEvidence(scan, s, { criterion: '3', kind: 'test', ref: 'x' })).rejects.toThrow('there is no criterion 3');
    await expect(recordEvidence(scan, s, { criterion: 'nope', kind: 'test', ref: 'x' })).rejects.toThrow('No acceptance criterion of STORY-AAAAAAA1 matches "nope"');
    await expect(recordEvidence(scan, s, { criterion: '1', kind: 'vibes', ref: 'x' })).rejects.toThrow('"vibes" is not an evidence kind');
    await expect(recordEvidence(scan, s, { criterion: '1', kind: 'test', ref: 'a\u001b[31m' })).rejects.toThrow('--ref must be');
    await expect(recordEvidence(scan, s, { criterion: '1', kind: 'test', ref: 'x', files: ['../outside.ts'] })).rejects.toThrow('outside the project');
    await expect(recordEvidence(scan, s, { criterion: '1', kind: 'test', ref: 'x', files: ['src/missing.ts'] })).rejects.toThrow('not a readable file');

    const orphan = `${BODY}\n## Evidence\n\n\`\`\`yaml agileflow-evidence\n- criterion: Owners can rename things\n  kind: manual\n  ref: checked\n\`\`\`\n`;
    expect(evidenceProblems(orphan)).toEqual(['1 evidence record is for a criterion that no longer exists (edited or removed): "Owners can rename things"']);
    expect(evidenceProblems(`${BODY}\n\`\`\`yaml agileflow-evidence\n- criterion: [\n\`\`\`\n`)[0]).toMatch(/^the agileflow-evidence block does not parse/);
    expect(evidenceProblems(`${BODY}\n\`\`\`yaml agileflow-evidence\n- criterion: Owners can rename\n  kind: vibes\n  ref: x\n\`\`\`\n`)).toEqual([
      expect.stringMatching(/^evidence record 1: kind: /),
    ]);
    put(paths, '03-stories/STORY-AAAAAAA2.md', story({ id: 'STORY-AAAAAAA2' }, orphan));
    const issues = validateWorkspace(await scanWorkspace(paths)).issues;
    expect(issues).toContainEqual(expect.objectContaining({ level: 'warn', message: expect.stringContaining('STORY-AAAAAAA2: 1 evidence record is for a criterion that no longer exists') }));
  });
});
