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
 * Manual-only skills (`interviewing-requirements` in the fixture) are checked
 * from both sides where the provider allows it headlessly: hidden from
 * implicit (model-chosen) invocation, and still explicitly invocable, so a
 * skill that did not load at all fails too:
 *   Codex     implicit: absent from `codex debug prompt-input`
 *             explicit: listed and enabled by the app-server `skills/list`
 *   Claude    both from the request Claude sends to a local stub API server
 *             (no model call, no key): absent from the Skill tool listing,
 *             expanded into the prompt by `/interviewing-requirements`
 *   OpenCode, Gemini  explicit only (listed); they have no manual-only switch
 * Each provider's version is printed once so a report says what was tested.
 * T3 Code launches these same CLIs in the project directory, so these checks
 * are the T3 path as well; see ARCHITECTURE.md ("Conformance") for the manual T3 UI check.
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { execFileSync, spawn } from 'node:child_process';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import YAML from 'yaml';
import { findExecutable } from '@agileflow/providers';
import { createSandbox, SKILLS_DIR, type Sandbox } from '../helpers';

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
  expect(res.code, res.stderr || res.stdout).toBe(0);
  return s;
}

function isolatedEnv(s: Sandbox, extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return { ...process.env, HOME: s.home, ...extra };
}

const MANUAL = 'interviewing-requirements';

/** A version above the catalog's current one, so a publish is a real update. */
function nextMinor(skill: string): string {
  const version = YAML.parse(fs.readFileSync(path.join(SKILLS_DIR, skill, 'agileflow.skill.yaml'), 'utf8')).package.version as string;
  const [major, minor] = version.split('.').map(Number);
  return `${major}.${minor! + 1}.0`;
}

/** Print `<bin> --version` once per provider so the report records what was tested. */
function logVersion(bin: string): void {
  let version: string;
  try {
    version = execFileSync(bin, ['--version'], { stdio: ['ignore', 'pipe', 'ignore'], timeout: 30000 }).toString().trim();
  } catch (err) {
    version = `unknown (${(err as Error).message.split('\n')[0]})`;
  }
  console.info(`[conformance] ${bin} --version: ${version}`);
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

interface CodexSkill {
  name: string;
  path: string;
  scope: string;
  enabled: boolean;
}

/**
 * The skills Codex offers for explicit `$name` mentions, from the app-server
 * `skills/list` request (what the TUI mention picker uses). It lists skills
 * regardless of `allow_implicit_invocation`, which only filters the implicit
 * list in the model prompt. `codex debug prompt-input "$name"` cannot prove
 * this: it does not resolve mentions (checked with codex-cli 0.128.0). The
 * app-server protocol is marked experimental, so a failure here may be
 * protocol drift rather than a skill problem.
 */
function codexSkillsList(s: Sandbox): Promise<CodexSkill[]> {
  const codexHome = path.join(s.home, '.codex');
  fs.mkdirSync(codexHome, { recursive: true });
  return new Promise((resolve, reject) => {
    const child = spawn('codex', ['app-server'], {
      cwd: s.project,
      env: isolatedEnv(s, { CODEX_HOME: codexHome }),
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    const send = (msg: object) => child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...msg })}\n`);
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('codex app-server did not answer skills/list in time'));
    }, 60000);
    const finish = (err: Error | null, skills?: CodexSkill[]) => {
      clearTimeout(timer);
      child.kill('SIGTERM');
      if (err) reject(err);
      else resolve(skills!);
    };
    child.on('error', (err) => finish(err));
    let buf = '';
    child.stdout.on('data', (d) => {
      buf += d;
      let nl: number;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        let msg: { id?: number; result?: { data?: Array<{ skills: CodexSkill[] }> }; error?: { message: string } };
        try {
          msg = JSON.parse(line);
        } catch {
          continue;
        }
        if (msg.id === 1) {
          if (msg.error) return finish(new Error(`codex app-server initialize: ${msg.error.message}`));
          send({ method: 'initialized' });
          send({ id: 2, method: 'skills/list', params: { cwds: [s.project], forceReload: true } });
        } else if (msg.id === 2) {
          if (msg.error) return finish(new Error(`codex app-server skills/list: ${msg.error.message}`));
          return finish(null, (msg.result?.data ?? []).flatMap((e) => e.skills));
        }
      }
    });
    send({ id: 1, method: 'initialize', params: { clientInfo: { name: 'agileflow-conformance', title: null, version: '0' }, capabilities: null } });
  });
}

function opencodeSkills(s: Sandbox): Array<{ name: string; location: string; description: string }> {
  const file = path.join(s.root, 'opencode-skills.json');
  const fd = fs.openSync(file, 'w');
  execFileSync('opencode', ['debug', 'skill'], { cwd: s.project, env: isolatedEnv(s), stdio: ['ignore', fd, 'ignore'], timeout: 120000 });
  fs.closeSync(fd);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/**
 * Every string in the first Messages API request Claude sends, captured by a
 * local stub server that answers with an error. No model call and no API key
 * are needed, and an isolated HOME keeps personal skills out.
 */
async function claudeRequest(s: Sandbox, prompt: string): Promise<string> {
  const bodies: string[] = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (d) => (body += d));
    req.on('end', () => {
      if (req.method === 'POST' && req.url?.startsWith('/v1/messages')) bodies.push(body);
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'conformance stub' } }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const env = isolatedEnv(s, {
    ANTHROPIC_BASE_URL: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    ANTHROPIC_API_KEY: 'conformance-stub',
  });
  for (const key of ['ANTHROPIC_AUTH_TOKEN', 'CLAUDE_CODE_OAUTH_TOKEN', 'CLAUDE_CONFIG_DIR', 'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX']) {
    delete env[key];
  }
  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn('claude', ['-p', prompt, '--output-format', 'stream-json', '--verbose', '--max-turns', '1'], {
        cwd: s.project,
        env,
        stdio: ['ignore', 'ignore', 'ignore'],
      });
      // Settle only once the process has exited, so it is not still writing
      // into the sandbox HOME when the test removes it.
      const timer = setTimeout(() => child.kill('SIGKILL'), 120000);
      const poll = setInterval(() => {
        if (bodies.length) child.kill('SIGTERM');
      }, 100);
      child.on('error', reject);
      child.on('exit', () => {
        clearInterval(poll);
        clearTimeout(timer);
        if (bodies.length) resolve();
        else reject(new Error('claude exited without sending a Messages API request'));
      });
    });
  } finally {
    server.close();
  }
  const strings: string[] = [];
  const walk = (x: unknown): void => {
    if (typeof x === 'string') strings.push(x);
    else if (x && typeof x === 'object') for (const v of Object.values(x)) walk(v);
  };
  walk(JSON.parse(bodies[0]!));
  return strings.join('\n');
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
  beforeAll(() => logVersion('codex'));

  it('manual-only: hidden from implicit invocation, still offered for explicit $mentions', async () => {
    sb = await project();
    const skillFile = path.join(sb.project, '.agents/skills', MANUAL, 'SKILL.md');
    // Implicit half: not in the model-visible skills list (auto skills are, as a control).
    const implicit = codexSkills(sb);
    expect(implicit).toContain(`${sb.project}/.agents/skills/diagnosing-bugs/SKILL.md`);
    expect(implicit).not.toContain(`.agents/skills/${MANUAL}/SKILL.md`);
    // Explicit half: Codex still loads it and offers it for `$interviewing-requirements`.
    const listed = (await codexSkillsList(sb)).find((x) => x.name === MANUAL);
    expect(listed, `${MANUAL} in skills/list`).toBeDefined();
    expect(listed).toMatchObject({ enabled: true, path: skillFile });
  }, 120000);

  it('sees auto skills, keeps manual skills out of implicit invocation, and follows update/remove', async () => {
    sb = await project();
    const seen = codexSkills(sb);
    expect(seen).toContain(`${sb.project}/.agents/skills/diagnosing-bugs/SKILL.md`);
    expect(seen).toContain(`${sb.project}/.agents/skills/filing-pr/SKILL.md`);
    expect(seen).not.toContain('.agents/skills/interviewing-requirements/SKILL.md');

    await sb.publish('filing-pr', nextMinor('filing-pr'), (t) => t.replace('Open a pull request', 'Open a pull request (conformance-v2)'));
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
  beforeAll(() => logVersion('opencode'));

  it('manual-only: still listed, so it stays explicitly invocable', async () => {
    // OpenCode has no manual-only switch; keeping a manual skill out of
    // automatic use depends on its description, which no headless command can
    // show. What can be proven is that it is loaded and invocable by name.
    sb = await project();
    const listed = opencodeSkills(sb).find((x) => x.name === MANUAL);
    expect(listed, MANUAL).toBeDefined();
    expect(listed!.location).toContain(path.join(sb.project, '.agents/skills', MANUAL));
  }, 180000);

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
  beforeAll(() => logVersion('claude'));

  it('manual-only: not offered to the model, still expanded by /interviewing-requirements', async () => {
    sb = await project();
    // The init event lists a manual skill under both `skills` and
    // `slash_commands` (checked with Claude Code 2.1.280), so it cannot tell
    // the halves apart; the request Claude builds can.
    const body = await claudeRequest(sb, `/${MANUAL} scope a login page`);
    // Implicit half: the Skill tool listing names auto skills (control) but not the manual one.
    expect(body).toContain('- diagnosing-bugs:');
    expect(body).not.toContain(`- ${MANUAL}:`);
    // Explicit half: the slash command loaded the skill body from the linked directory.
    expect(body).toContain(`<command-name>/${MANUAL}</command-name>`);
    expect(body).toContain(path.join(sb.project, '.claude/skills', MANUAL));
    expect(body).toContain('# Interviewing requirements');
  }, 240000);

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
  beforeAll(() => logVersion('gemini'));

  it('manual-only: still listed, so it stays explicitly invocable', async () => {
    // Gemini has no manual-only switch; keeping a manual skill out of automatic
    // activation depends on its description, which `gemini skills list` cannot
    // show. What can be proven is that it is loaded and invocable by name.
    sb = await project();
    fs.mkdirSync(path.join(sb.home, '.gemini'), { recursive: true });
    fs.writeFileSync(path.join(sb.home, '.gemini', 'trustedFolders.json'), JSON.stringify({ [sb.project]: 'TRUST_FOLDER' }));
    const out = execFileSync('gemini', ['skills', 'list'], { cwd: sb.project, env: isolatedEnv(sb), timeout: 120000 }).toString();
    expect(out).toContain(`${sb.project}/.agents/skills/${MANUAL}/SKILL.md`);
  }, 180000);

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
