import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import YAML from 'yaml';
import { scriptedPrompter } from '../../src/ui/prompts';
import { exists, read, REPO } from '../helpers';
import { sandbox } from './helpers';

// The members of packs/agile.yaml (what `work init` installs), sorted.
const AGILE = (YAML.parse(fs.readFileSync(path.join(REPO, 'packs/agile.yaml'), 'utf8')).skills as string[])
  .map((s) => s.replace(/^@agileflow\//, '').replace(/@.*$/, ''))
  .sort();
const files = (dir: string) => fs.readdirSync(dir, { recursive: true }).map(String).sort();

describe('agileflow work init', () => {
  it('creates a clean workspace, configures Work, and adds the Agile pack', async () => {
    const sb = await sandbox();
    const res = await sb.af(['work', 'init', '--yes']);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('AgileFlow Work organizes durable product work using:');
    expect(res.stdout).toContain('Workspace:\n  docs/agile');
    // README, product, roadmap. No 02-04 yet, no .gitkeep, no state files.
    expect(files(path.join(sb.project, 'docs/agile'))).toEqual([
      '00-product',
      '00-product/product.md',
      '01-roadmap',
      '01-roadmap/roadmap.md',
      'README.md',
    ]);
    expect(read(path.join(sb.project, 'docs/agile/README.md'))).toContain('Do not store temporary plans, agent scratch notes');
    const config = YAML.parse(read(path.join(sb.project, 'agileflow.yaml')));
    expect(config.work).toEqual({ enabled: true, root: 'docs/agile' });
    expect(fs.readdirSync(path.join(sb.project, '.agents/skills')).sort()).toEqual(AGILE);
    expect(Object.keys(config.skills).sort()).toEqual(AGILE);
    expect(exists(path.join(sb.project, 'agileflow.lock'))).toBe(true);
    const check = await sb.af(['check']);
    expect(check.code).toBe(0);
    expect(check.stdout).toContain('Agile Work\n  [ok] workspace structure valid');
    expect(check.stdout).toMatch(/Result: healthy/);
  });

  it('regular init does not create an Agile workspace', async () => {
    const sb = await sandbox();
    await sb.af(['init', '--yes']);
    expect(exists(path.join(sb.project, 'docs'))).toBe(false);
    expect(YAML.parse(read(path.join(sb.project, 'agileflow.yaml'))).work).toBeUndefined();
    const res = await sb.af(['work', 'list']);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain('AgileFlow Work is not enabled in this project');
    expect(res.stderr).toContain('agileflow work init');
  });

  it('works in an existing project, keeps its skills and comments, and can skip the skills', async () => {
    const sb = await sandbox();
    await sb.af(['init', '--yes']);
    const before = read(path.join(sb.project, 'agileflow.yaml'));
    const res = await sb.af(['work', 'init', '--yes', '--no-skills']);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('Agile skills not installed');
    const after = read(path.join(sb.project, 'agileflow.yaml'));
    // Everything that was there (skills, comments, order) is unchanged; only `work` is added.
    expect(after).toBe(`${before}work:\n  enabled: true\n  root: docs/agile\n`);
    expect(YAML.parse(after).work).toEqual({ enabled: true, root: 'docs/agile' });
    expect(fs.readdirSync(path.join(sb.project, '.agents/skills'))).not.toContain('working-story');
  });

  it('--root chooses another workspace directory; subdirectories are not configurable', async () => {
    const sb = await sandbox();
    const res = await sb.af(['work', 'init', '--yes', '--no-skills', '--root', 'planning']);
    expect(res.code).toBe(0);
    expect(exists(path.join(sb.project, 'planning/00-product/product.md'))).toBe(true);
    expect(YAML.parse(read(path.join(sb.project, 'agileflow.yaml'))).work).toEqual({ enabled: true, root: 'planning' });
    expect((await sb.af(['work', 'new', 'story', '--title', 'X'])).stdout).toMatch(/planning\/03-stories\/STORY-[0-9A-Z]{8}-x\.md/);
    const moved = await sb.af(['work', 'init', '--yes', '--root', 'docs/agile']);
    expect(moved.code).toBe(1);
    expect(moved.stderr).toContain('Work is already enabled with root planning');
    expect((await sb.af(['work', 'init', '--yes', '--root', '../elsewhere'])).code).toBe(1);
  });

  it('is idempotent: running again keeps every existing file', async () => {
    const sb = await sandbox();
    await sb.af(['work', 'init', '--yes', '--no-skills']);
    fs.writeFileSync(path.join(sb.project, 'docs/agile/00-product/product.md'), '# Our product\n');
    fs.rmSync(path.join(sb.project, 'docs/agile/README.md'));
    const again = JSON.parse((await sb.af(['work', 'init', '--yes', '--no-skills', '--json'])).stdout);
    expect(again).toMatchObject({ root: 'docs/agile', adopted: false, created: ['docs/agile/README.md'] });
    expect(again.kept).toContain('docs/agile/00-product/product.md');
    expect(read(path.join(sb.project, 'docs/agile/00-product/product.md'))).toBe('# Our product\n');
  });

  it('--json output is only JSON, including when skills are installed', async () => {
    const sb = await sandbox();
    const res = await sb.af(['work', 'init', '--yes', '--json']);
    expect(res.code).toBe(0);
    const data = JSON.parse(res.stdout);
    expect(data).toMatchObject({ root: 'docs/agile', adopted: false, kept: [] });
    expect(data.skills.map((s: string) => s.split('@')[0]).sort()).toEqual(AGILE);
  });

  it('rerunning on an enabled workspace restores missing starter files and leaves everything else alone', async () => {
    const sb = await sandbox();
    await sb.af(['work', 'init', '--yes', '--no-skills']);
    fs.rmSync(path.join(sb.project, 'docs/agile/README.md'));
    fs.writeFileSync(path.join(sb.project, 'docs/agile/notes.md'), 'mine\n');
    const res = await sb.af(['work', 'init', '--yes', '--no-skills']);
    expect(res.code).toBe(0);
    expect(exists(path.join(sb.project, 'docs/agile/README.md'))).toBe(true);
    expect(read(path.join(sb.project, 'docs/agile/notes.md'))).toBe('mine\n');
    expect((await sb.af(['check'])).stdout).toContain('[!] notes.md is not part of the Work workspace');
  });

  it('adopts a compatible existing docs/agile only after confirmation, never overwriting it', async () => {
    const sb = await sandbox('agile-app');
    fs.rmSync(path.join(sb.project, 'agileflow.yaml'));
    const product = read(path.join(sb.project, 'docs/agile/00-product/product.md'));

    const refused = await sb.af(['work', 'init', '--no-skills']);
    expect(refused.code).toBe(1);
    expect(refused.stderr).toContain('docs/agile/ already exists (2 epics, 2 stories, 1 decision) and is compatible');
    expect(exists(path.join(sb.project, 'agileflow.yaml'))).toBe(false);

    const declined = await sb.af(['work', 'init', '--no-skills'], { prompter: scriptedPrompter([false]) });
    expect(declined.stdout).toContain('Nothing was changed.');
    expect(exists(path.join(sb.project, 'agileflow.yaml'))).toBe(false);

    const adopted = await sb.af(['work', 'init', '--no-skills'], { prompter: scriptedPrompter([true, true]) });
    expect(adopted.code).toBe(0);
    expect(adopted.stdout).toContain('Kept (unchanged):');
    expect(read(path.join(sb.project, 'docs/agile/00-product/product.md'))).toBe(product);
    expect((await sb.af(['work', 'list', '--type', 'story'])).stdout).toContain('STORY-R3N7M2QA');
  });

  it('explains an incompatible existing workspace and changes nothing', async () => {
    const sb = await sandbox();
    fs.mkdirSync(path.join(sb.project, 'docs/agile/09-agents'), { recursive: true });
    fs.writeFileSync(path.join(sb.project, 'docs/agile/09-agents/status.json'), '{}');
    fs.mkdirSync(path.join(sb.project, 'docs/agile/03-stories/done'), { recursive: true });
    const res = await sb.af(['work', 'init', '--yes']);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain('docs/agile/ already exists and does not match the AgileFlow Work layout');
    expect(res.stderr).toContain('09-agents/ is not part of the Work workspace');
    expect(res.stderr).toContain('Nothing was changed.');
    expect(exists(path.join(sb.project, 'agileflow.yaml'))).toBe(false);
    expect(files(path.join(sb.project, 'docs/agile'))).toEqual(['03-stories', '03-stories/done', '09-agents', '09-agents/status.json']);
  });

  it('interactive: pick which Agile skills to install, then confirm', async () => {
    const sb = await sandbox();
    const prompter = scriptedPrompter([['working-story', 'reviewing-story'], true]);
    const res = await sb.af(['work', 'init'], { prompter });
    expect(res.code).toBe(0);
    expect(prompter.asked).toEqual(['Install Agile workflow skills?', 'Continue?']);
    expect(fs.readdirSync(path.join(sb.project, '.agents/skills')).sort()).toEqual(['reviewing-story', 'working-story']);

    const other = await sandbox();
    const cancelled = await other.af(['work', 'init'], { prompter: scriptedPrompter([[], false]) });
    expect(cancelled.stdout).toContain('Nothing was changed.');
    expect(exists(path.join(other.project, 'docs'))).toBe(false);
  });

  it('agileflow init offers Work and sets it up when accepted', async () => {
    const sb = await sandbox();
    const prompter = scriptedPrompter(['project', ['diagnosing-bugs'], 'yes', AGILE, true]);
    const res = await sb.af(['init'], { prompter });
    expect(res.code).toBe(0);
    expect(prompter.asked).toEqual([
      'Where should AgileFlow install skills?',
      'Which workflows should this repository use?',
      'Enable AgileFlow Work?',
      'Install Agile workflow skills?',
      'Continue?',
    ]);
    expect(YAML.parse(read(path.join(sb.project, 'agileflow.yaml'))).work).toEqual({ enabled: true, root: 'docs/agile' });
    expect(fs.readdirSync(path.join(sb.project, '.agents/skills')).sort()).toEqual(['diagnosing-bugs', ...AGILE].sort());
    expect(exists(path.join(sb.project, 'docs/agile/01-roadmap/roadmap.md'))).toBe(true);
  });
});
