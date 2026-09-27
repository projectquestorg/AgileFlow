import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import semver from 'semver';
import type { Cli } from '../runtime';
import { EXIT, UsageError } from '../runtime';
import { cliVersion } from '../version';

export interface SelfUpdateOptions {
  to?: string;
  dryRun?: boolean;
  yes?: boolean;
  json?: boolean;
}

const CHANGELOG = 'https://github.com/projectquestorg/AgileFlow/blob/main/apps/cli/CHANGELOG.md';

async function distTags(): Promise<Record<string, string>> {
  const res = await fetch('https://registry.npmjs.org/agileflow', {
    headers: { accept: 'application/vnd.npm.install-v1+json' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new UsageError(`npm registry request failed (${res.status})`);
  return ((await res.json()) as { 'dist-tags'?: Record<string, string> })['dist-tags'] ?? {};
}

/** How this CLI was installed: a global npm install can be updated in place; npx and local installs cannot. */
function installKind(): 'global' | 'npx' | 'local' {
  const here = fileURLToPath(import.meta.url);
  if (/[\\/]_npx[\\/]/.test(here)) return 'npx';
  const prefix = process.env.npm_config_prefix;
  if (prefix && here.startsWith(path.resolve(prefix))) return 'global';
  if (/[\\/]lib[\\/]node_modules[\\/]agileflow[\\/]/.test(here) || /[\\/]npm[\\/]node_modules[\\/]agileflow[\\/]/.test(here)) return 'global';
  return fs.existsSync(path.join(path.dirname(here), '..', '..', '..', 'package.json')) ? 'local' : 'global';
}

/**
 * `agileflow self-update`: install the newest CLI from the channel this one
 * came from (`next` for prereleases), or `--to <v>` to roll back or pin.
 * Skill updates are separate (`agileflow update`).
 */
export async function runSelfUpdate(cli: Cli, options: SelfUpdateOptions): Promise<number> {
  const { out, prompter } = cli;
  const current = cliVersion();
  const tag = semver.prerelease(current) ? 'next' : 'latest';
  let target = options.to;
  if (target) {
    if (!semver.valid(target)) throw new UsageError(`--to must be an exact version, e.g. 5.0.0 (got ${target})`);
  } else {
    const tags = await distTags();
    target = tags[tag] ?? tags.latest;
    if (!target) throw new UsageError('Could not determine the latest AgileFlow version from npm');
  }
  const kind = installKind();
  const command = ['npm', 'install', '--global', `agileflow@${target}`];
  const upToDate = target === current;
  if (options.json && (options.dryRun || upToDate || kind !== 'global')) {
    out.json({ ok: true, current, target, channel: tag, install: kind, upToDate, command: command.join(' '), changelog: CHANGELOG });
    return EXIT.OK;
  }
  if (upToDate) {
    out.line(`AgileFlow ${current} is already the ${options.to ? 'requested' : `newest ${tag}`} version.`);
    return EXIT.OK;
  }
  out.line(`AgileFlow ${current} -> ${target} (${semver.valid(target) && semver.lt(target, current) ? 'rollback' : tag})`);
  out.line(`Changes: ${CHANGELOG}`);
  if (kind !== 'global') {
    out.line(kind === 'npx' ? `You are running through npx; use \`npx agileflow@${target}\`.` : 'This is a local or development install; update it with your package manager.');
    out.line(`To install globally: ${command.join(' ')}`);
    return EXIT.OK;
  }
  if (options.dryRun) {
    out.line(`Would run: ${command.join(' ')}`);
    return EXIT.OK;
  }
  if (prompter.interactive && !options.yes && !(await prompter.confirm(`Run \`${command.join(' ')}\`?`, true))) {
    out.line('Nothing changed.');
    return EXIT.OK;
  }
  if (!prompter.interactive && !options.yes) throw new UsageError('Pass --yes to install without a prompt');
  const code = await new Promise<number>((resolve) => {
    const child = spawn(command[0]!, command.slice(1), { stdio: options.json ? 'ignore' : 'inherit', shell: process.platform === 'win32' });
    child.on('exit', (c) => resolve(c ?? 1));
    child.on('error', () => resolve(1));
  });
  if (options.json) out.json({ ok: code === 0, current, target, channel: tag, install: kind, command: command.join(' ') });
  else out.line(code === 0 ? `Installed AgileFlow ${target}. Roll back with \`agileflow self-update --to ${current}\`.` : 'npm install failed; see the output above.');
  return code === 0 ? EXIT.OK : EXIT.ERROR;
}
