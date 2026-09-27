import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import toml from '@iarna/toml';
import YAML from 'yaml';
import { applyMigration, planMigration } from '@agileflow/core';
import { scriptedPrompter } from '../../src/ui/prompts';
import { createSandbox, exists, isSymlink, read, tree, type Sandbox } from '../helpers';

let sb: Sandbox;
afterEach(() => {
  if (sb) {
    for (const dir of [sb.project, sb.home]) fs.chmodSync(dir, 0o755);
    sb.cleanup();
  }
});

const sha = (text: string | Buffer) => crypto.createHash('sha256').update(text).digest('hex');
const backups = (dir: string) => fs.readdirSync(dir).filter((n) => n.startsWith('.agileflow-v4-backup-'));

describe('migrate v4', () => {
  it('--preview reports without changing anything', async () => {
    sb = await createSandbox({ fixture: 'v4-project' });
    const before = tree(sb.project);
    const res = await sb.af(['migrate', 'v4', '--preview']);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('AgileFlow v4 detected:');
    expect(res.stdout).toContain('Preview only; nothing was changed.');
    expect(res.stdout).toContain('Codex security settings');
    expect(tree(sb.project)).toEqual(before);
  });

  it('refuses to change files non-interactively without --yes', async () => {
    sb = await createSandbox({ fixture: 'v4-project' });
    const res = await sb.af(['migrate']);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain('Refusing to change files without confirmation');
    expect(exists(path.join(sb.project, '.agileflow/hook-manifest.yaml'))).toBe(true);
  });

  it('migrates a representative v4 project without deleting user data or keeping AgileFlow hooks', async () => {
    sb = await createSandbox({ fixture: 'v4-project' });
    sb.installProvider('claude');
    const res = await sb.af(['migrate', 'v4', '--yes']);
    expect(res.code).toBe(0);
    const p = (rel: string) => path.join(sb.project, rel);

    // Hooks: AgileFlow entries gone, the user's own hook kept.
    const settings = JSON.parse(read(p('.claude/settings.json')));
    expect(JSON.stringify(settings)).not.toContain('agileflow hook');
    expect(settings.hooks.PreToolUse).toEqual([{ matcher: 'Bash', hooks: [{ type: 'command', command: './scripts/my-guard.sh' }] }]);
    expect(settings.permissions).toEqual({ allow: ['Bash(npm test:*)'] });

    // Codex: hooks and v4's permission values removed by line edits; comments,
    // other keys, and the profile value stay.
    const codexText = read(p('.codex/config.toml'));
    expect(codexText).toContain('# Team Codex settings. Comments like this one must survive the migration.\nmodel = "gpt-5-codex" # pinned for CI parity\n');
    expect(codexText).toContain('# Desktop notification when Codex waits for input.\n[[hooks.Notification]]');
    const codex = toml.parse(codexText) as Record<string, any>;
    expect(JSON.stringify(codex)).not.toContain('agileflow hook');
    expect(codex.hooks.Notification).toBeDefined();
    expect(codex.approval_policy).toBeUndefined();
    expect(codex.sandbox_mode).toBeUndefined();
    expect(codex.profiles.review.approval_policy).toBe('on-request');
    expect(codex.features).toEqual({ hooks: true, collaboration_modes: true });
    expect(res.stderr).toContain('SECURITY: .codex/config.toml lets Codex run every command without asking');

    // Generated v4 artifacts removed.
    for (const rel of ['agileflow.config.json', '.agileflow/hook-manifest.yaml', '.agileflow/_cfg', '.agileflow/logs', '.claude/agents/agileflow', '.claude/skills/agileflow-adr', '.codex/skills', 'CLAUDE.md']) {
      expect(exists(p(rel)), rel).toBe(false);
    }
    // User data kept.
    expect(read(p('AGENTS.md'))).toBe('# Team notes\n\nRun `npm test` before pushing.\n');
    expect(read(p('.claude/skills/agileflow-debug/_learnings/debug.yaml'))).toContain('--runInBand');
    expect(exists(p('.claude/skills/agileflow-debug/SKILL.md'))).toBe(false);
    expect(exists(p('.claude/skills/agileflow-babysit-mentor'))).toBe(false);
    expect(exists(p('.claude/skills/agileflow-team-custom/SKILL.md'))).toBe(true);
    expect(exists(p('.claude/skills/my-claude-only-skill/SKILL.md'))).toBe(true);
    expect(read(p('.agileflow/templates/custom-note.md'))).toBe('Our own template notes.\n');
    expect(read(p('.agileflow/plugins/core/agents/mentor.md'))).toContain('Edited by the team.');
    expect(read(p('docs/06-stories/US-0001-login.md'))).toContain('As a user I can log in.');
    expect(exists(p('docs/09-agents/status.json'))).toBe(true);

    // Backup holds everything that changed, as it was.
    const [backup] = backups(sb.project);
    expect(backup).toBeDefined();
    expect(exists(p(`${backup}/agileflow.config.json`))).toBe(true);
    expect(read(p(`${backup}/.claude/settings.json`))).toContain('agileflow hook');
    expect(read(p(`${backup}/.codex/config.toml`))).toContain('approval_policy = "never"');
    expect(exists(p(`${backup}/.claude/skills/agileflow-adr/SKILL.md`))).toBe(true);
    expect(exists(p(`${backup}/.agileflow/_cfg/files.json`))).toBe(true);

    // v5 is set up with skills that cover what the project used.
    const cfg = YAML.parse(read(p('agileflow.yaml')));
    expect(Object.keys(cfg.skills).sort()).toEqual(
      ['babysitting-pr', 'checking-blast-radius', 'diagnosing-bugs', 'filing-pr', 'interviewing-requirements', 'verifying-changes'],
    );
    expect(isSymlink(p('.claude/skills/diagnosing-bugs'))).toBe(true);
    expect((await sb.af(['check'])).code).toBe(0);
    expect(res.stdout).toContain('Migration complete.');

    // Idempotent: nothing left that looks like v4 except user-owned content.
    const again = await sb.af(['migrate', 'v4', '--preview']);
    expect(again.stdout).toContain('legacy docs structure');
    expect(again.stdout).not.toContain('hook entries');

    // A re-run reports no backup it did not create.
    const rerun = await sb.af(['migrate', 'v4', '--yes']);
    expect(rerun.code).toBe(0);
    expect(rerun.stdout).toContain('Nothing left to migrate automatically');
    expect(rerun.stdout).not.toContain('Backup:');
    expect(backups(sb.project)).toHaveLength(1);
  });

  it('asks separately before removing the Codex permission values, and keeps them when declined', async () => {
    sb = await createSandbox({ fixture: 'v4-project' });
    const prompter = scriptedPrompter([true, false, true]);
    const res = await sb.af(['migrate', 'v4', '--skills', ''], { prompter });
    expect(res.code).toBe(0);
    expect(prompter.asked).toEqual([
      'Apply these changes?',
      'Remove the no-approval / full-access Codex settings AgileFlow v4 wrote?',
      'Back up everything that changes to .agileflow-v4-backup-<timestamp>/?',
    ]);
    const codex = toml.parse(read(path.join(sb.project, '.codex/config.toml'))) as Record<string, any>;
    expect(JSON.stringify(codex.hooks)).not.toContain('agileflow hook');
    expect(codex.approval_policy).toBe('never');
    expect(codex.sandbox_mode).toBe('danger-full-access');
    expect(res.stdout).toContain('Left in place (not confirmed): 1 change');
  });

  it('warns about risky Codex values without changing them when nothing shows v4 set them', async () => {
    sb = await createSandbox({ fixture: 'v4-project' });
    const file = path.join(sb.project, '.codex/config.toml');
    fs.writeFileSync(file, '# mine\napproval_policy = "never"\nsandbox_mode = "danger-full-access"\n');
    const res = await sb.af(['migrate', 'v4', '--yes', '--skills', '']);
    expect(res.code).toBe(0);
    expect(res.stderr).toContain('SECURITY: .codex/config.toml');
    expect(res.stdout).toContain('Nothing shows that AgileFlow set these values');
    expect(res.stdout).toContain('approval_policy = "on-request" and sandbox_mode = "workspace-write"');
    expect(read(file)).toBe('# mine\napproval_policy = "never"\nsandbox_mode = "danger-full-access"\n');
  });

  it('--report-docs lists legacy docs and never deletes them', async () => {
    sb = await createSandbox({ fixture: 'v4-project' });
    const res = await sb.af(['migrate', 'v4', '--report-docs']);
    expect(res.stdout).toContain('docs/06-stories');
    expect(res.stdout).toContain('review before deleting');
    expect(res.stdout).toMatch(/docs\/09-agents\s+empty or unchanged v4 seed; safe to delete manually/);
    expect(exists(path.join(sb.project, 'docs/06-stories/US-0001-login.md'))).toBe(true);
  });

  it('--no-backup skips the backup directory', async () => {
    sb = await createSandbox({ fixture: 'v4-project' });
    const res = await sb.af(['migrate', '--yes', '--no-backup', '--skills', '']);
    expect(res.code).toBe(0);
    expect(backups(sb.project)).toHaveLength(0);
    expect(res.stdout).not.toContain('Backup:');
    expect(YAML.parse(read(path.join(sb.project, 'agileflow.yaml'))).skills).toEqual({});
    expect(exists(path.join(sb.project, 'agileflow.lock'))).toBe(true);
  });

  it('check and init point v4 projects at migrate', async () => {
    sb = await createSandbox({ fixture: 'v4-project' });
    const check = await sb.af(['check']);
    expect(check.code).toBe(1);
    expect(check.stdout).toContain('agileflow migrate v4 --preview');
    const init = await sb.af(['init', '--yes']);
    expect(init.stderr).toContain('AgileFlow v4 files detected');
    expect((await sb.af(['check'])).stdout).toContain('AgileFlow v4 files detected');
  });

  it('--skills with an unknown skill fails before anything is changed; a re-run honors --skills', async () => {
    sb = await createSandbox({ fixture: 'v4-project' });
    const before = tree(sb.project);
    const bad = await sb.af(['migrate', 'v4', '--yes', '--skills', 'diagnosing-bugs,typo-skill']);
    expect(bad.code).toBe(1);
    expect(bad.stderr).toContain('typo-skill');
    expect(tree(sb.project)).toEqual(before);
    expect(exists(path.join(sb.project, 'agileflow.yaml'))).toBe(false);

    const good = await sb.af(['migrate', 'v4', '--yes', '--skills', 'diagnosing-bugs']);
    expect(good.code).toBe(0);
    expect(Object.keys(YAML.parse(read(path.join(sb.project, 'agileflow.yaml'))).skills)).toEqual(['diagnosing-bugs']);
    expect(exists(path.join(sb.project, 'agileflow.lock'))).toBe(true);
    expect(exists(path.join(sb.project, '.agents/skills/diagnosing-bugs/SKILL.md'))).toBe(true);
  });

  it('finishes the v5 setup when an earlier run left agileflow.yaml without a lock', async () => {
    sb = await createSandbox({ fixture: 'v4-project' });
    expect((await sb.af(['migrate', 'v4', '--yes', '--skills', ''])).code).toBe(0);
    fs.rmSync(path.join(sb.project, 'agileflow.lock'));
    const res = await sb.af(['migrate', 'v4', '--yes', '--skills', 'verifying-changes']);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('Updated agileflow.yaml and agileflow.lock.');
    expect(exists(path.join(sb.project, 'agileflow.lock'))).toBe(true);
    expect(exists(path.join(sb.project, '.agents/skills/verifying-changes/SKILL.md'))).toBe(true);
    expect((await sb.af(['check'])).code).toBe(0);
  });

  it('reports hooks in a settings.json it cannot parse as an error and never claims success', async () => {
    sb = await createSandbox({ fixture: 'v4-project' });
    const file = path.join(sb.project, '.claude/settings.json');
    const jsonc = [
      '{',
      '  // my comment',
      '  "hooks": { "Stop": [ { "hooks": [ { "type": "command", "command": "npx agileflow hook Stop" } ] } ] }',
      '}',
      '',
    ].join('\n');
    fs.writeFileSync(file, jsonc);
    const preview = await sb.af(['migrate', 'v4', '--preview']);
    expect(preview.stderr).toContain('.claude/settings.json is not valid JSON');
    const res = await sb.af(['migrate', 'v4', '--yes', '--skills', '']);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain('.claude/settings.json is not valid JSON (comments or a syntax error)');
    expect(res.stderr).toContain(file);
    expect(res.stderr).toContain('Migration incomplete');
    expect(res.stdout).not.toContain('Migration complete');
    expect(read(file)).toBe(jsonc);
    // Everything else was still migrated.
    expect(exists(path.join(sb.project, '.agileflow/hook-manifest.yaml'))).toBe(false);
  });

  it('never trusts a hostile files.json beyond hash-matching files inside .agileflow/', async () => {
    sb = await createSandbox({ fixture: 'clean-node' });
    const p = (rel: string) => path.join(sb.project, rel);
    const outside = path.join(sb.root, 'outside');
    fs.mkdirSync(path.join(outside, 'logs'), { recursive: true });
    fs.writeFileSync(path.join(outside, 'secret.txt'), 'secret\n');
    fs.writeFileSync(path.join(outside, 'logs', 'keep.log'), 'log\n');
    fs.mkdirSync(path.join(outside, 'agileflow-adr'), { recursive: true });
    const adrSkill = '---\nname: agileflow-adr\ndescription: x\n---\nbody\n';
    fs.writeFileSync(path.join(outside, 'agileflow-adr', 'SKILL.md'), adrSkill);
    const pkg = read(p('package.json'));

    fs.mkdirSync(p('.agileflow/_cfg'), { recursive: true });
    fs.writeFileSync(p('.agileflow/generated.md'), 'v4 generated\n');
    fs.symlinkSync(p('package.json'), p('.agileflow/pkg-link.json'));
    fs.symlinkSync(outside, p('.agileflow/escape'));
    fs.symlinkSync(path.join(outside, 'logs'), p('.agileflow/logs'));
    fs.mkdirSync(p('.claude/skills'), { recursive: true });
    fs.symlinkSync(path.join(outside, 'agileflow-adr'), p('.claude/skills/agileflow-adr'));
    const files: Record<string, { sha256: string }> = {
      '../package.json': { sha256: sha(pkg) },
      '../../outside/secret.txt': { sha256: sha('secret\n') },
      [path.join(outside, 'secret.txt')]: { sha256: sha('secret\n') },
      'escape/secret.txt': { sha256: sha('secret\n') },
      'pkg-link.json': { sha256: sha(pkg) },
      'generated.md': { sha256: sha('v4 generated\n') },
      'plugins/core/skills/agileflow-adr/SKILL.md': { sha256: sha(adrSkill) },
      __proto__: { sha256: sha('x') },
    };
    fs.writeFileSync(p('.agileflow/_cfg/files.json'), JSON.stringify({ schema: 1, files }));

    const res = await sb.af(['migrate', 'v4', '--yes', '--skills', '', '--include-unverified']);
    expect(res.code).toBe(0);
    // Only the real, hash-matching file inside .agileflow/ (and v4's index) went away.
    expect(exists(p('.agileflow/generated.md'))).toBe(false);
    expect(exists(p('.agileflow/_cfg/files.json'))).toBe(false);
    expect(read(p('package.json'))).toBe(pkg);
    expect(read(path.join(outside, 'secret.txt'))).toBe('secret\n');
    expect(read(path.join(outside, 'logs', 'keep.log'))).toBe('log\n');
    expect(read(path.join(outside, 'agileflow-adr', 'SKILL.md'))).toBe(adrSkill);
    // Symlinks are reported and left alone.
    expect(isSymlink(p('.agileflow/pkg-link.json'))).toBe(true);
    expect(isSymlink(p('.agileflow/escape'))).toBe(true);
    expect(isSymlink(p('.agileflow/logs'))).toBe(true);
    expect(isSymlink(p('.claude/skills/agileflow-adr'))).toBe(true);
    expect(res.stdout).toContain('.agileflow/pkg-link.json (symbolic link, not followed)');
    expect(res.stdout).toContain('.claude/skills/agileflow-adr (link or file, not followed)');
  });

  it('does not follow a .agileflow directory that is a symlink', async () => {
    sb = await createSandbox({ fixture: 'clean-node' });
    const outside = path.join(sb.root, 'elsewhere');
    fs.mkdirSync(path.join(outside, 'logs'), { recursive: true });
    fs.writeFileSync(path.join(outside, 'hook-manifest.yaml'), 'x\n');
    fs.writeFileSync(path.join(outside, 'logs', 'a.log'), 'x\n');
    fs.symlinkSync(outside, path.join(sb.project, '.agileflow'));
    const res = await sb.af(['migrate', 'v4', '--yes', '--skills', '']);
    expect(res.code).toBe(0);
    expect(res.stderr).toContain('.agileflow is a symbolic link or not a directory');
    expect(exists(path.join(outside, 'hook-manifest.yaml'))).toBe(true);
    expect(exists(path.join(outside, 'logs', 'a.log'))).toBe(true);
  });

  it('treats a changed skill mirror as unverified and keeps it unless the user opts in', async () => {
    sb = await createSandbox({ fixture: 'v4-project' });
    const guide = path.join(sb.project, '.claude/skills/agileflow-adr/references/madr-format-guide.md');
    fs.appendFileSync(guide, '\nOur own ADR rule.\n');
    const res = await sb.af(['migrate', 'v4', '--yes', '--skills', '']);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('Unverified v4 skill mirrors');
    expect(res.stderr).toContain('could not be verified against v4\'s file index');
    expect(read(guide)).toContain('Our own ADR rule.');
    expect(exists(path.join(sb.project, '.claude/skills/agileflow-debug/SKILL.md'))).toBe(false);

    const optIn = await sb.af(['migrate', 'v4', '--yes', '--include-unverified']);
    expect(optIn.code).toBe(0);
    expect(exists(guide)).toBe(false);
    const [first, second] = backups(sb.project).sort();
    expect(second).toBeDefined();
    expect(read(path.join(sb.project, second!, '.claude/skills/agileflow-adr/references/madr-format-guide.md'))).toContain('Our own ADR rule.');
    expect(first).not.toBe(second);
  });

  it('an interrupted migration leaves a state that a re-run finishes', async () => {
    sb = await createSandbox({ fixture: 'v4-project' });
    // Simulate a crash after hooks, mirrors, and config were handled but
    // before any .agileflow/ file (including v4's index) was removed.
    const plan = await planMigration(sb.project, sb.home);
    const runtime = path.join(sb.project, '.agileflow') + path.sep;
    const partial = { ...plan, actions: plan.actions.filter((a) => !(a.kind === 'remove' && a.path.startsWith(runtime))) };
    const first = await applyMigration(partial, { backup: true, consent: ['codex-permissions'] });
    expect(first.failed).toEqual([]);
    expect(exists(path.join(sb.project, '.agileflow/_cfg/files.json'))).toBe(true);
    expect(exists(path.join(sb.project, '.claude/skills/agileflow-adr'))).toBe(false);

    const res = await sb.af(['migrate', 'v4', '--yes', '--skills', '']);
    expect(res.code).toBe(0);
    for (const rel of ['.agileflow/hook-manifest.yaml', '.agileflow/_cfg', '.agileflow/plugins/core/agents/adr-writer.md']) {
      expect(exists(path.join(sb.project, rel)), rel).toBe(false);
    }
    expect(read(path.join(sb.project, '.agileflow/plugins/core/agents/mentor.md'))).toContain('Edited by the team.');
  });

  it('changes nothing when the backup cannot be written', async () => {
    sb = await createSandbox({ fixture: 'v4-project' });
    const before = tree(sb.project);
    fs.chmodSync(sb.project, 0o555);
    const res = await sb.af(['migrate', 'v4', '--yes', '--skills', '']);
    fs.chmodSync(sb.project, 0o755);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain('Could not create the migration backup, so nothing was changed');
    expect(tree(sb.project)).toEqual(before);
  });
});

describe('migrate --detach', () => {
  it('stops using AgileFlow but leaves standalone skills', async () => {
    sb = await createSandbox({ fixture: 'clean-node' });
    await sb.af(['init', '--yes']);
    const res = await sb.af(['migrate', '--detach', '--yes']);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('Stop using AgileFlow in this project:');
    expect(exists(path.join(sb.project, 'agileflow.yaml'))).toBe(false);
    expect(exists(path.join(sb.project, '.agents/skills/diagnosing-bugs/SKILL.md'))).toBe(true);
  });

  it('shows what would be removed and refuses without --yes when non-interactive', async () => {
    sb = await createSandbox({ fixture: 'clean-node' });
    await sb.af(['init', '--yes']);
    const res = await sb.af(['migrate', '--detach', '--delete-skills']);
    expect(res.code).toBe(1);
    expect(res.stdout).toMatch(/DELETE \d+ unmodified skill\(s\) from \.agents\/skills: .*diagnosing-bugs/);
    expect(res.stdout).toContain('remove agileflow.yaml');
    expect(res.stderr).toContain('Refusing to detach without confirmation');
    expect(exists(path.join(sb.project, 'agileflow.yaml'))).toBe(true);
    expect(exists(path.join(sb.project, '.agents/skills/diagnosing-bugs/SKILL.md'))).toBe(true);
  });

  it('asks before deleting skills interactively and changes nothing when declined', async () => {
    sb = await createSandbox({ fixture: 'clean-node' });
    await sb.af(['init', '--yes']);
    const prompter = scriptedPrompter([false]);
    const res = await sb.af(['migrate', '--detach', '--delete-skills'], { prompter });
    expect(res.code).toBe(0);
    expect(prompter.asked[0]).toMatch(/^Stop using AgileFlow here and delete \d+ skill\(s\)\?$/);
    expect(res.stdout).toContain('No changes made.');
    expect(exists(path.join(sb.project, 'agileflow.yaml'))).toBe(true);
  });

  it('rejects --keep-skills together with --delete-skills', async () => {
    sb = await createSandbox({ fixture: 'clean-node' });
    const res = await sb.af(['migrate', '--detach', '--keep-skills', '--delete-skills', '--yes']);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain('either --keep-skills or --delete-skills');
  });
});
