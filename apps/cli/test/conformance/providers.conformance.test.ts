/**
 * Provider conformance: real provider binaries must see what AgileFlow installs.
 *
 * Opt-in (they need locally installed provider CLIs):
 *   AGILEFLOW_CONFORMANCE=1 npm test -- conformance
 *
 * Each check reads the provider's own view of available skills without a
 * model call where the provider offers one:
 *   Codex     `codex debug prompt-input`  (skills section of the model prompt)
 *   OpenCode  `opencode debug skill`
 *   Claude    `claude -p --output-format stream-json` init event (killed before any turn)
 *   Gemini    `gemini skills list` (in a trusted folder)
 * T3 Code launches these same CLIs in the project directory, so these checks
 * are the T3 path as well; see ARCHITECTURE.md ("Conformance") for the manual T3 UI check.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { findExecutable } from '@agileflow/providers';
import { createSandbox, type Sandbox } from '../helpers';

const enabled = process.env.AGILEFLOW_CONFORMANCE === '1';
const has = async (bin: string) => enabled && (await findExecutable(bin, process.env, process.platform)) !== null;
const [hasCodex, hasOpenCode, hasClaude, hasGemini] = await Promise.all(['codex', 'opencode', 'claude', 'gemini'].map(has));
// Cursor has no headless skill-listing command yet; it is verified manually (see ARCHITECTURE.md).

let sb: Sandbox;
afterEach(() => sb?.cleanup());

async function project(options: { mirror?: boolean } = {}): Promise<Sandbox> {
  const s = await createSandbox({ fixture: 'clean-node' });
  s.env.PATH = process.env.PATH;
  if (options.mirror) s.env.AGILEFLOW_LINK_MODE = 'mirror';
  const res = await s.af(['init', '--skills', 'diagnosing-bugs,filing-pr,interviewing-requirements']);
  expect(res.code).toBe(0);
  return s;
}

function isolatedEnv(s: Sandbox, extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return { ...process.env, HOME: s.home, ...extra };
}

function codexSkills(s: Sandbox): string {
  const codexHome = path.join(s.home, '.codex');
  fs.mkdirSync(codexHome, { recursive: true });
  const out = execFileSync('codex', ['debug', 'prompt-input'], {
    cwd: s.project,
    env: isolatedEnv(s, { CODEX_HOME: codexHome }),
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: 60000,
  }).toString();
  return JSON.stringify(JSON.parse(out));
}

function opencodeSkills(s: Sandbox): Array<{ name: string; location: string; description: string }> {
  const file = path.join(s.root, 'opencode-skills.json');
  const fd = fs.openSync(file, 'w');
  execFileSync('opencode', ['debug', 'skill'], { cwd: s.project, env: isolatedEnv(s), stdio: ['ignore', fd, 'ignore'], timeout: 120000 });
  fs.closeSync(fd);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function claudeInit(cwd: string): Promise<{ skills: string[]; slash: string[] }> {
  return new Promise((resolve, reject) => {
    const child = spawn('claude', ['-p', 'Reply with OK.', '--output-format', 'stream-json', '--verbose', '--max-turns', '1'], {
      cwd,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    let buf = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('claude did not report init in time'));
    }, 90000);
    child.stdout.on('data', (d) => {
      buf += d;
      for (const line of buf.split('\n')) {
        if (!line.includes('"subtype":"init"')) continue;
        try {
          const e = JSON.parse(line);
          clearTimeout(timer);
          child.kill('SIGTERM');
          resolve({ skills: e.skills ?? [], slash: e.slash_commands ?? [] });
          return;
        } catch {
          // partial line
        }
      }
    });
  });
}

describe.skipIf(!hasCodex)('Codex (native .agents/skills)', () => {
  it('sees auto skills, keeps manual skills out of implicit invocation, and follows update/remove', async () => {
    sb = await project();
    const seen = codexSkills(sb);
    expect(seen).toContain(`${sb.project}/.agents/skills/diagnosing-bugs/SKILL.md`);
    expect(seen).toContain(`${sb.project}/.agents/skills/filing-pr/SKILL.md`);
    expect(seen).not.toContain('.agents/skills/interviewing-requirements/SKILL.md');

    await sb.publish('filing-pr', '1.1.0', (t) => t.replace('Open a pull request', 'Open a pull request (conformance-v2)'));
    expect((await sb.af(['update', '--yes'])).code).toBe(0);
    expect(codexSkills(sb)).toContain('conformance-v2');

    expect((await sb.af(['remove', 'filing-pr'])).code).toBe(0);
    expect(codexSkills(sb)).not.toContain('.agents/skills/filing-pr/SKILL.md');
  });

  it('Codex reads the structured-questions flag AgileFlow sets only on request', async () => {
    sb = await project();
    const codexHome = path.join(sb.home, '.codex');
    fs.mkdirSync(codexHome, { recursive: true });
    const flag = () =>
      execFileSync('codex', ['features', 'list'], { env: isolatedEnv(sb, { CODEX_HOME: codexHome }), timeout: 30000 })
        .toString()
        .split('\n')
        .find((l) => l.startsWith('default_mode_request_user_input'))!;
    expect(flag()).toMatch(/false$/);
    expect((await sb.af(['configure', 'codex-questions', 'enable', '--yes'])).code).toBe(0);
    expect(flag()).toMatch(/true$/);
    expect((await sb.af(['configure', 'codex-questions', 'disable', '--yes'])).code).toBe(0);
    expect(flag()).toMatch(/false$/);
  });
});

describe.skipIf(!hasOpenCode)('OpenCode (native .agents/skills)', () => {
  it('sees installed skills from .agents/skills and follows remove', async () => {
    sb = await project();
    const skills = opencodeSkills(sb);
    for (const id of ['diagnosing-bugs', 'filing-pr', 'interviewing-requirements']) {
      const s = skills.find((x) => x.name === id);
      expect(s, id).toBeDefined();
      expect(s!.location).toContain(path.join(sb.project, '.agents/skills', id));
    }
    await sb.af(['remove', 'filing-pr']);
    expect(opencodeSkills(sb).some((s) => s.name === 'filing-pr')).toBe(false);
  });
});

describe.skipIf(!hasClaude)('Claude Code (adapted via links)', () => {
  it('sees the canonical skills through per-skill links, and through mirrors', async () => {
    sb = await project();
    const init = await claudeInit(sb.project);
    for (const id of ['diagnosing-bugs', 'filing-pr', 'interviewing-requirements']) expect(init.skills).toContain(id);
    // References resolve through the provider-visible path.
    await sb.af(['add', 'checking-blast-radius', '--yes']);
    expect(fs.readFileSync(path.join(sb.project, '.claude/skills/checking-blast-radius/references/impact-surfaces.md'), 'utf8')).toContain('#');
    await sb.af(['remove', 'filing-pr']);
    expect((await claudeInit(sb.project)).skills).not.toContain('filing-pr');
    sb.cleanup();

    sb = await project({ mirror: true });
    const mirrored = await claudeInit(sb.project);
    expect(mirrored.skills).toContain('diagnosing-bugs');
  }, 240000);
});

describe.skipIf(!hasGemini)('Gemini CLI (native .agents/skills alias)', () => {
  it('lists installed skills from .agents/skills once the folder is trusted, and follows remove', async () => {
    sb = await project();
    const list = () =>
      execFileSync('gemini', ['skills', 'list'], { cwd: sb.project, env: isolatedEnv(sb), timeout: 120000 }).toString();
    // Gemini ignores project skills in untrusted folders; `check` explains that.
    expect((await sb.af(['check'], { env: { PATH: process.env.PATH } })).stdout).toContain('trusted folders');
    fs.mkdirSync(path.join(sb.home, '.gemini'), { recursive: true });
    fs.writeFileSync(path.join(sb.home, '.gemini', 'trustedFolders.json'), JSON.stringify({ [sb.project]: 'TRUST_FOLDER' }));
    const out = list();
    for (const id of ['diagnosing-bugs', 'filing-pr', 'interviewing-requirements']) {
      expect(out).toContain(`${sb.project}/.agents/skills/${id}/SKILL.md`);
    }
    await sb.af(['remove', 'filing-pr']);
    expect(list()).not.toContain('.agents/skills/filing-pr/SKILL.md');
  }, 300000);
});

describe.skipIf(enabled)('conformance', () => {
  it('is opt-in (set AGILEFLOW_CONFORMANCE=1)', () => {
    expect(enabled).toBe(false);
  });
});
