// Install the CLI the way users do and exercise it in a clean environment.
//
//   node scripts/smoke-pack.mjs                      build + pack this checkout, use registry/ from this checkout
//   node scripts/smoke-pack.mjs --registry published use the public registry (what `npx agileflow` users get)
//   node scripts/smoke-pack.mjs --from-npm 5.0.0     install agileflow@5.0.0 from npm instead of packing
//
// The install gets its own HOME, cache, and npm prefix, and PATH holds only
// node and git, so nothing from the developer's machine (personal skills,
// config, a globally installed agileflow) can make a broken package pass.
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const cliDir = fileURLToPath(new URL('..', import.meta.url));
const repo = path.resolve(cliDir, '../..');
const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};
const registry = opt('--registry') ?? path.join(repo, 'registry');
const fromNpm = opt('--from-npm');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agileflow-smoke-'));
const home = path.join(tmp, 'home');
const project = path.join(tmp, 'project');
const prefix = path.join(tmp, 'install');
for (const d of [home, project, prefix]) fs.mkdirSync(d, { recursive: true });

const which = (cmd) => execFileSync(process.platform === 'win32' ? 'where' : 'which', [cmd], { encoding: 'utf8' }).split(/\r?\n/)[0].trim();
const toolDirs = [...new Set([path.dirname(process.execPath), path.dirname(which('git')), path.dirname(which('npm'))])];
const env = {
  PATH: toolDirs.join(path.delimiter),
  HOME: home,
  USERPROFILE: home,
  XDG_CONFIG_HOME: path.join(home, '.config'),
  XDG_CACHE_HOME: path.join(home, '.cache'),
  npm_config_cache: path.join(tmp, 'npm-cache'),
  npm_config_update_notifier: 'false',
  GIT_CONFIG_GLOBAL: path.join(home, '.gitconfig'),
  GIT_CONFIG_NOSYSTEM: '1',
  AGILEFLOW_NO_UPDATE_NOTIFIER: '1',
  AGILEFLOW_NON_INTERACTIVE: '1',
  ...(registry === 'published' ? {} : { AGILEFLOW_REGISTRY: registry }),
  ...(process.platform === 'win32' ? { SystemRoot: process.env.SystemRoot, PATHEXT: process.env.PATHEXT } : {}),
};
fs.writeFileSync(env.GIT_CONFIG_GLOBAL, '[user]\n\tname = Smoke\n\temail = smoke@example.com\n[init]\n\tdefaultBranch = main\n');

function step(label, cmd, cmdArgs, options = {}) {
  process.stdout.write(`- ${label}\n`);
  const res = spawnSync(cmd, cmdArgs, { cwd: options.cwd ?? project, env, encoding: 'utf8', shell: process.platform === 'win32' });
  if (res.status !== 0) throw new Error(`${cmd} ${cmdArgs.join(' ')} (exit ${res.status})\n${res.stdout}\n${res.stderr}`);
  return res.stdout;
}

let failed = false;
try {
  let spec;
  if (fromNpm) {
    spec = `agileflow@${fromNpm}`;
  } else {
    step('build', 'npm', ['run', 'build'], { cwd: cliDir });
    const packed = step('pack', 'npm', ['pack', '--silent', '--pack-destination', tmp], { cwd: cliDir }).trim().split(/\r?\n/).pop();
    spec = path.join(tmp, packed);
  }
  step(`install ${fromNpm ? spec : path.basename(spec)} into a clean prefix`, 'npm', ['install', '--prefix', prefix, '--no-fund', '--no-audit', spec], { cwd: tmp });
  const bin = path.join(prefix, 'node_modules', '.bin', process.platform === 'win32' ? 'agileflow.cmd' : 'agileflow');

  const version = step('agileflow --version', bin, ['--version']).trim();
  if (fromNpm && version !== fromNpm) throw new Error(`installed ${version}, expected ${fromNpm}`);
  step('git init', 'git', ['init', '-q']);
  fs.writeFileSync(path.join(project, 'README.md'), '# smoke\n');
  step('git commit', 'git', ['commit', '-qm', 'init', '--allow-empty']);
  step(`agileflow init --yes (registry: ${registry === 'published' ? 'published' : 'this checkout'})`, bin, ['init', '--yes']);
  step('agileflow check', bin, ['check']);
  const list = JSON.parse(step('agileflow list --json', bin, ['list', '--json']));
  const skills = list.project?.rows;
  if (!Array.isArray(skills) || !skills.length) throw new Error(`list --json returned no skills: ${JSON.stringify(list).slice(0, 200)}`);
  const lock = fs.readFileSync(path.join(project, 'agileflow.lock'), 'utf8');
  step('agileflow sync is a no-op on a fresh install', bin, ['sync']);
  if (fs.readFileSync(path.join(project, 'agileflow.lock'), 'utf8') !== lock) throw new Error('sync changed agileflow.lock right after init');
  console.log(`smoke ok: agileflow ${version}, ${skills.length} skill(s) installed`);
} catch (err) {
  failed = true;
  console.error(`FAILED: ${err.message}`);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
