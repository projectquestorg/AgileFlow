import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import toml from '@iarna/toml';
import YAML from 'yaml';
import { createSandbox, exists, isSymlink, read, tree, type Sandbox } from '../helpers';

let sb: Sandbox;
afterEach(() => sb?.cleanup());

describe('migrate v4', () => {
  it('--preview reports without changing anything', async () => {
    sb = await createSandbox({ fixture: 'v4-project' });
    const before = tree(sb.project);
    const res = await sb.af(['migrate', 'v4', '--preview']);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('AgileFlow v4 detected:');
    expect(res.stdout).toContain('Preview only; nothing was changed.');
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
    const codex = toml.parse(read(p('.codex/config.toml'))) as Record<string, any>;
    expect(JSON.stringify(codex)).not.toContain('agileflow hook');
    expect(codex.hooks.Notification).toBeDefined();
    // Security settings are reported, never "restored" to guessed values.
    expect(codex.approval_policy).toBe('never');
    expect(codex.sandbox_mode).toBe('danger-full-access');
    expect(res.stderr).toContain('Legacy AgileFlow Codex configuration detected');
    expect(res.stdout).toContain('Because the previous user values are unknown, they have not been changed.');

    // Generated v4 artifacts removed.
    for (const rel of ['agileflow.config.json', '.agileflow/hook-manifest.yaml', '.agileflow/_cfg', '.agileflow/logs', '.claude/agents/agileflow', '.claude/skills/agileflow-adr', '.codex/skills', 'CLAUDE.md']) {
      expect(exists(p(rel)), rel).toBe(false);
    }
    // User data kept.
    expect(read(p('AGENTS.md'))).toBe('# Team notes\n\nRun `npm test` before pushing.\n');
    expect(read(p('.claude/skills/agileflow-debug/_learnings/debug.yaml'))).toContain('--runInBand');
    expect(exists(p('.claude/skills/agileflow-debug/SKILL.md'))).toBe(false);
    expect(exists(p('.claude/skills/agileflow-team-custom/SKILL.md'))).toBe(true);
    expect(exists(p('.claude/skills/my-claude-only-skill/SKILL.md'))).toBe(true);
    expect(read(p('.agileflow/templates/custom-note.md'))).toBe('Our own template notes.\n');
    expect(read(p('.agileflow/plugins/core/agents/mentor.md'))).toContain('Edited by the team.');
    expect(read(p('docs/06-stories/US-0001-login.md'))).toContain('As a user I can log in.');
    expect(exists(p('docs/09-agents/status.json'))).toBe(true);

    // Backup holds everything that changed.
    const backup = fs.readdirSync(sb.project).find((n) => n.startsWith('.agileflow-v4-backup-'))!;
    expect(backup).toBeDefined();
    expect(exists(p(`${backup}/agileflow.config.json`))).toBe(true);
    expect(read(p(`${backup}/.claude/settings.json`))).toContain('agileflow hook');
    expect(exists(p(`${backup}/.claude/skills/agileflow-adr/SKILL.md`))).toBe(true);

    // v5 is set up with skills that cover what the project used.
    const cfg = YAML.parse(read(p('agileflow.yaml')));
    expect(Object.keys(cfg.skills).sort()).toEqual(
      ['babysitting-pr', 'checking-blast-radius', 'diagnosing-bugs', 'filing-pr', 'interviewing-requirements', 'verifying-changes'],
    );
    expect(isSymlink(p('.claude/skills/diagnosing-bugs'))).toBe(true);
    expect((await sb.af(['check'])).code).toBe(0);

    // Idempotent: nothing left that looks like v4 except user-owned content.
    const again = await sb.af(['migrate', 'v4', '--preview']);
    expect(again.stdout).toContain('legacy docs structure');
    expect(again.stdout).not.toContain('hook entries');
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
    await sb.af(['migrate', '--yes', '--no-backup', '--skills', '']);
    expect(fs.readdirSync(sb.project).some((n) => n.startsWith('.agileflow-v4-backup-'))).toBe(false);
    expect(YAML.parse(read(path.join(sb.project, 'agileflow.yaml'))).skills).toEqual({});
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

  it('migrate --detach stops using AgileFlow but leaves standalone skills', async () => {
    sb = await createSandbox({ fixture: 'clean-node' });
    await sb.af(['init', '--yes']);
    expect((await sb.af(['migrate', '--detach', '--yes'])).code).toBe(0);
    expect(exists(path.join(sb.project, 'agileflow.yaml'))).toBe(false);
    expect(exists(path.join(sb.project, '.agents/skills/diagnosing-bugs/SKILL.md'))).toBe(true);
  });
});
