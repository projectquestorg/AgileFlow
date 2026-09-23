import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import YAML from 'yaml';
import {
  applyChanges,
  assertSafeRelativePath,
  classifyEntry,
  defaultRange,
  editYamlConfig,
  filterHooks,
  hashTree,
  isSelfSource,
  LockfileSchema,
  parseAddTarget,
  parseSidecar,
  parseSkillMarkdown,
  parseSource,
  pickVersion,
  ProjectConfigSchema,
  projectScope,
  readLockfile,
  readProjectConfig,
  readTree,
  renderSkill,
  replaceDirAtomic,
  serializeLockfile,
  splitFrontmatter,
  stripManagedNotice,
  validateSkillMarkdown,
  writeTree,
  type TreeFile,
} from '@agileflow/core';
import { allAdapters } from '@agileflow/providers';

const tmp: string[] = [];
function tmpdir(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'af-core-'));
  tmp.push(d);
  return d;
}
afterEach(() => {
  for (const d of tmp.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

const file = (p: string, content: string, executable = false): TreeFile => ({ path: p, content: Buffer.from(content), executable });
const SKILL = '---\nname: demo\ndescription: Demo skill. Use when testing.\n---\n\n# Demo\n\nBody.\n';

describe('hashing', () => {
  it('is deterministic, order-independent, and sensitive to content, path, and exec bit', () => {
    const a = [file('SKILL.md', 'x'), file('references/r.md', 'y')];
    expect(hashTree(a)).toBe(hashTree([...a].reverse()));
    expect(hashTree(a)).toMatch(/^sha256-[A-Za-z0-9+/]+=*$/);
    expect(hashTree([file('SKILL.md', 'x!'), a[1]!])).not.toBe(hashTree(a));
    expect(hashTree([file('SKILL2.md', 'x'), a[1]!])).not.toBe(hashTree(a));
    expect(hashTree([file('SKILL.md', 'x', true), a[1]!])).not.toBe(hashTree(a));
  });
});

describe('filesystem', () => {
  it('rejects unsafe package paths', () => {
    for (const bad of ['../x', '/etc/passwd', 'a/../../b', 'C:/x', 'a\\b', '']) {
      expect(() => assertSafeRelativePath(bad)).toThrow();
    }
    expect(() => assertSafeRelativePath('references/ok.md')).not.toThrow();
  });

  it('replaces directories atomically and reads trees back identically', async () => {
    const dir = path.join(tmpdir(), 'skill');
    await writeTree(dir, [file('old.md', 'old')]);
    const files = [file('SKILL.md', SKILL), file('scripts/run.sh', '#!/bin/sh\n', true)];
    await replaceDirAtomic(dir, files);
    const back = await readTree(dir);
    expect(back.map((f) => f.path)).toEqual(['SKILL.md', 'scripts/run.sh']);
    expect(hashTree(back)).toBe(hashTree(files));
    expect(fs.readdirSync(path.dirname(dir))).toEqual(['skill']);
  });
});

describe('SKILL.md', () => {
  it('parses and validates frontmatter per Agent Skills rules', () => {
    expect(parseSkillMarkdown(SKILL)).toMatchObject({ name: 'demo', description: 'Demo skill. Use when testing.' });
    expect(validateSkillMarkdown(SKILL, 'demo')).toEqual([]);
    expect(validateSkillMarkdown(SKILL, 'other')[0]!.message).toContain('does not match');
    expect(validateSkillMarkdown('# no frontmatter', 'x')[0]!.message).toContain('missing YAML frontmatter');
    expect(validateSkillMarkdown('---\nname: Bad_Name\ndescription: d\n---\n')[0]!.message).toContain('lowercase');
    expect(validateSkillMarkdown(`---\nname: a\ndescription: ${'x'.repeat(1025)}\n---\n`)[0]!.message).toContain('max 1024');
  });

  it('handles CRLF frontmatter', () => {
    const crlf = SKILL.replace(/\n/g, '\r\n');
    expect(splitFrontmatter(crlf).frontmatter).toContain('name: demo');
    expect(validateSkillMarkdown(crlf, 'demo')).toEqual([]);
  });

  it('validates the agileflow.skill.yaml sidecar', () => {
    expect(parseSidecar('schema: 1\npackage:\n  name: "@agileflow/x"\n  version: "1.0.0"\n').package.version).toBe('1.0.0');
    expect(() => parseSidecar('schema: 1\npackage:\n  name: x\n  version: "1"\nplugin: engineering\n')).toThrow(/plugin/);
  });
});

describe('config and lockfile', () => {
  it('validates agileflow.yaml and rejects unknown keys', () => {
    expect(
      ProjectConfigSchema.safeParse({
        version: 1,
        skills: { 'filing-pr': { source: '@agileflow/filing-pr', version: '^1', activation: 'manual' } },
        providers: { codex: { enabled: 'auto', structuredQuestions: 'inherit' } },
        interaction: { questionPreference: 'prefer' },
      }).success,
    ).toBe(true);
    expect(ProjectConfigSchema.safeParse({ version: 1, skills: { Bad: { source: 'x' } } }).success).toBe(false);
    expect(ProjectConfigSchema.safeParse({ version: 1, auditAll: true }).success).toBe(false);
  });

  it('round-trips the lockfile with stable ordering', async () => {
    const lock = LockfileSchema.parse({
      version: 1,
      resolved: {
        zeta: { source: '@agileflow/zeta', version: '1.0.0', integrity: 'sha256-a', path: '.agents/skills/zeta', baseHash: 'sha256-b' },
        alpha: { source: './x', version: 'local', path: '.agents/skills/alpha', ownership: 'local' },
      },
    });
    const text = serializeLockfile(lock);
    expect(text.indexOf('alpha:')).toBeLessThan(text.indexOf('zeta:'));
    const f = path.join(tmpdir(), 'agileflow.lock');
    fs.writeFileSync(f, text);
    expect(await readLockfile(f)).toEqual(lock);
  });

  it('edits preserve comments', async () => {
    const f = path.join(tmpdir(), 'agileflow.yaml');
    fs.writeFileSync(f, '# top comment\nversion: 1\nskills:\n  a: # keep me\n    source: "@agileflow/a"\n');
    await editYamlConfig(f, ProjectConfigSchema, '', (doc) => doc.setIn(['interaction', 'questionPreference'], 'minimize'));
    const text = fs.readFileSync(f, 'utf8');
    expect(text).toContain('# top comment');
    expect(text).toContain('# keep me');
    expect((await readProjectConfig(f))!.interaction!.questionPreference).toBe('minimize');
  });
});

describe('sources and versions', () => {
  it('parses registry, git, and path sources', () => {
    expect(parseSource('@agileflow/filing-pr')).toEqual({ kind: 'registry', name: '@agileflow/filing-pr' });
    expect(parseSource('filing-pr')).toEqual({ kind: 'registry', name: '@agileflow/filing-pr' });
    expect(parseSource('git+https://github.com/example/skills.git#skills/foo')).toEqual({
      kind: 'git',
      url: 'https://github.com/example/skills.git',
      subpath: 'skills/foo',
    });
    expect(parseSource('./skills/my-custom-skill')).toEqual({ kind: 'path', path: './skills/my-custom-skill' });
    expect(parseSource('.agents/skills/filing-pr')).toEqual({ kind: 'path', path: '.agents/skills/filing-pr' });
    expect(() => parseSource('what is this?')).toThrow();
    expect(() => parseSource('git+-upload-pack=evil')).toThrow(/Invalid git source/);
  });

  it('parses add targets with ranges', () => {
    expect(parseAddTarget('diagnosing-bugs@^1')).toMatchObject({ source: '@agileflow/diagnosing-bugs', range: '^1' });
    expect(parseAddTarget('@agileflow/github')).toMatchObject({ source: '@agileflow/github', range: null });
    expect(parseAddTarget('@acme/tool@1.2.3')).toMatchObject({ source: '@acme/tool', range: '1.2.3' });
    expect(() => parseAddTarget('x@not a range')).toThrow();
  });

  it('picks the highest satisfying version and ignores prereleases unless asked', () => {
    const v = ['1.0.0', '1.1.0', '1.2.0-beta.1', '2.0.0'];
    expect(pickVersion(v, '^1')).toBe('1.1.0');
    expect(pickVersion(v, undefined)).toBe('2.0.0');
    expect(pickVersion(v, '^1.2.0-beta.0')).toBe('1.2.0-beta.1');
    expect(pickVersion(v, '^3')).toBeNull();
    expect(defaultRange('1.4.2')).toBe('^1.4.2');
    expect(defaultRange('0.3.0')).toBe('~0.3.0');
  });

  it('detects self-sourced (forked/local) skills', () => {
    const scope = projectScope('/repo');
    expect(isSelfSource(scope, 'x', { source: '.agents/skills/x' }, '/home')).toBe(true);
    expect(isSelfSource(scope, 'x', { source: './.agents/skills/x' }, '/home')).toBe(true);
    expect(isSelfSource(scope, 'x', { source: './skills/x' }, '/home')).toBe(false);
    expect(isSelfSource(scope, 'x', { source: '@agileflow/x' }, '/home')).toBe(false);
  });
});

describe('rendering', () => {
  const pkg = [file('SKILL.md', SKILL), file('agileflow.skill.yaml', 'schema: 1\npackage:\n  name: "@agileflow/demo"\n  version: "1.0.0"\ncapabilities:\n  userInteraction: optional\n')];
  const render = (over: Partial<Parameters<typeof renderSkill>[1]> = {}) =>
    renderSkill(pkg, { id: 'demo', managed: true, activation: 'auto', questionPreference: 'provider-default', adapters: allAdapters(), ...over });
  const text = (files: TreeFile[], p = 'SKILL.md') => files.find((f) => f.path === p)!.content.toString();

  it('adds the managed notice after the frontmatter without touching frontmatter', () => {
    const out = text(render());
    expect(out.startsWith('---\nname: demo\ndescription: Demo skill. Use when testing.\n---\n\n<!-- Managed by AgileFlow.')).toBe(true);
    expect(out).toContain('agileflow fork demo');
    expect(stripManagedNotice(out)).not.toContain('Managed by AgileFlow');
    expect(stripManagedNotice(out)).toContain('# Demo');
  });

  it('is deterministic', () => {
    expect(hashTree(render({ activation: 'manual' }))).toBe(hashTree(render({ activation: 'manual' })));
  });

  it('translates manual activation for every provider mechanism', () => {
    const files = render({ activation: 'manual' });
    const fm = YAML.parse(splitFrontmatter(text(files)).frontmatter!);
    expect(fm['disable-model-invocation']).toBe(true);
    expect(fm.metadata['opencode/autoinvoke']).toBe(false);
    expect(YAML.parse(text(files, 'agents/openai.yaml'))).toEqual({ policy: { allow_implicit_invocation: false } });
  });

  it('merges into an existing agents/openai.yaml', () => {
    const withCodex = [...pkg, file('agents/openai.yaml', 'interface:\n  display_name: Demo\n')];
    const out = renderSkill(withCodex, { id: 'demo', managed: false, activation: 'manual', questionPreference: 'provider-default', adapters: allAdapters() });
    expect(YAML.parse(text(out, 'agents/openai.yaml'))).toEqual({
      interface: { display_name: 'Demo' },
      policy: { allow_implicit_invocation: false },
    });
  });

  it('renames the frontmatter to match the install id and adds the question preference line', () => {
    const out = text(renderSkill(pkg, { id: 'renamed', managed: false, activation: 'auto', questionPreference: 'minimize', adapters: [] }));
    expect(out).toContain('name: renamed');
    expect(out).toContain('Project question preference: make reasonable assumptions');
  });
});

describe('provider links', () => {
  it('classifies entries and applies links with fallback to marked mirrors', async () => {
    const root = tmpdir();
    const canonical = path.join(root, '.agents/skills/demo');
    await writeTree(canonical, [file('SKILL.md', SKILL)]);
    const entry = path.join(root, '.claude/skills/demo');
    expect((await classifyEntry(entry, canonical)).state).toBe('missing');

    const [linked] = await applyChanges(
      [{ kind: 'link', provider: 'claude', skillId: 'demo', path: entry, target: canonical }],
      { root, env: {}, platform: process.platform },
    );
    expect(linked!.linkType).toBe('symlink');
    expect(fs.readlinkSync(entry)).toBe('../../.agents/skills/demo');
    expect((await classifyEntry(entry, canonical)).state).toBe('linked');

    fs.rmSync(canonical, { recursive: true });
    expect((await classifyEntry(entry, canonical)).state).toBe('dangling-ours');
    await writeTree(canonical, [file('SKILL.md', SKILL)]);
    fs.unlinkSync(entry);

    const [mirrored] = await applyChanges(
      [{ kind: 'link', provider: 'claude', skillId: 'demo', path: entry, target: canonical }],
      { root, env: { AGILEFLOW_LINK_MODE: 'mirror' }, platform: 'win32' },
    );
    expect(mirrored!.linkType).toBe('mirror');
    const state = await classifyEntry(entry, canonical);
    expect(state).toMatchObject({ state: 'mirror', modified: false });
    fs.appendFileSync(path.join(entry, 'SKILL.md'), 'edit');
    expect(await classifyEntry(entry, canonical)).toMatchObject({ state: 'mirror', modified: true });

    const other = path.join(root, '.claude/skills/mine');
    await writeTree(other, [file('SKILL.md', SKILL)]);
    expect((await classifyEntry(other, path.join(root, '.agents/skills/mine'))).state).toBe('user-dir');
  });
});

describe('v4 hook filtering', () => {
  it('removes only AgileFlow hook commands', () => {
    const { hooks, removed } = filterHooks({
      PreToolUse: [
        { matcher: 'Bash', hooks: [{ type: 'command', command: 'npx agileflow hook PreToolUse' }, { type: 'command', command: './mine.sh' }] },
        { matcher: 'Edit', hooks: [{ type: 'command', command: 'npx agileflow hook PreToolUse --matcher Edit' }] },
      ],
      SessionStart: [{ hooks: [{ type: 'command', command: 'node .agileflow/scripts/welcome.js' }] }],
      Stop: [{ hooks: [{ type: 'command', command: 'say done' }] }],
    });
    expect(removed).toBe(3);
    expect(hooks).toEqual({
      PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: './mine.sh' }] }],
      Stop: [{ hooks: [{ type: 'command', command: 'say done' }] }],
    });
  });
});
