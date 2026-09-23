import path from 'node:path';
import {
  editScopeConfig,
  globalScope,
  loadWorkspace,
  packMembers,
  pathExists,
  planMigration,
  prepareAdd,
  readGlobalConfig,
  readTextIfExists,
  saveLock,
  syncWorkspace,
  type AddRequest,
  type ScopeTarget,
  type Services,
} from '@agileflow/core';
import type { Cli } from '../runtime';
import { EXIT, projectScopeForCreate, relSkillsDir, servicesFor, splitList, UsageError } from '../runtime';
import { installRequests, printSyncReport } from './shared';

export interface InitOptions {
  yes?: boolean;
  global?: boolean;
  skills?: string;
}

/** Skills preselected in interactive init, and used by `init --yes` when the core pack is unavailable. */
export const CORE_SKILLS = ['diagnosing-bugs', 'checking-blast-radius', 'verifying-changes', 'reviewing-changes'];
const RECOMMENDED = ['diagnosing-bugs', 'checking-blast-radius', 'verifying-changes'];
const GITHUB_RECOMMENDED = ['filing-pr', 'babysitting-pr'];

export interface RepoFacts {
  git: boolean;
  github: boolean;
  languages: string[];
  packageManager: string | null;
  instructionFiles: Array<{ name: string; present: boolean }>;
}

export async function detectRepoFacts(root: string): Promise<RepoFacts> {
  const has = (rel: string) => pathExists(path.join(root, rel));
  const git = await has('.git');
  const gitConfig = git ? await readTextIfExists(path.join(root, '.git', 'config')) : null;
  const github = !!gitConfig?.includes('github.com') || (await has('.github'));
  const languages: string[] = [];
  if (await has('tsconfig.json')) languages.push('TypeScript');
  else if (await has('package.json')) languages.push('JavaScript');
  if ((await has('pyproject.toml')) || (await has('requirements.txt'))) languages.push('Python');
  if (await has('go.mod')) languages.push('Go');
  if (await has('Cargo.toml')) languages.push('Rust');
  if ((await has('pom.xml')) || (await has('build.gradle')) || (await has('build.gradle.kts'))) languages.push('Java/Kotlin');
  if (await has('Gemfile')) languages.push('Ruby');
  let packageManager: string | null = null;
  if (await has('pnpm-workspace.yaml')) packageManager = 'pnpm workspace';
  else if (await has('pnpm-lock.yaml')) packageManager = 'pnpm';
  else if (await has('yarn.lock')) packageManager = 'yarn';
  else if (await has('bun.lockb')) packageManager = 'bun';
  else if (await has('package-lock.json')) packageManager = 'npm';
  const instructionFiles = [];
  for (const name of ['AGENTS.md', 'CLAUDE.md', 'GEMINI.md']) instructionFiles.push({ name, present: await has(name) });
  return { git, github, languages, packageManager, instructionFiles };
}

async function coreRequests(services: Services): Promise<AddRequest[]> {
  try {
    const pack = await services.fetcher.getPack('core');
    if (pack) return packMembers(pack).map((m) => ({ id: m.id, spec: { source: m.source, ...(m.range ? { version: m.range } : {}) } }));
  } catch {
    // fall back to the built-in list below
  }
  return CORE_SKILLS.map((id) => ({ id, spec: { source: `@agileflow/${id}` } }));
}

export async function runInit(cli: Cli, options: InitOptions): Promise<number> {
  const { ctx, out, prompter } = cli;
  let scope: ScopeTarget = options.global ? globalScope(ctx) : await projectScopeForCreate(ctx);

  if (await pathExists(scope.configPath)) {
    out.line(`AgileFlow is already set up (${path.relative(ctx.cwd, scope.configPath) || scope.configPath}).`);
    out.line('Add skills with `agileflow add <skill>`, restore files with `agileflow sync`, or get new versions with `agileflow update`.');
    return EXIT.OK;
  }

  const facts = scope.kind === 'project' ? await detectRepoFacts(scope.root) : null;
  const probeServices = await servicesFor(ctx, scope);
  const detected: string[] = [];
  if (facts?.git) detected.push('Git repository');
  if (facts?.github) detected.push('GitHub');
  for (const l of facts?.languages ?? []) detected.push(l);
  if (facts?.packageManager) detected.push(facts.packageManager);
  for (const adapter of probeServices.adapters) {
    const d = await adapter.detect({ ctx, scope, settings: undefined });
    if (d.detected) detected.push(adapter.displayName);
  }
  out.heading('Detected:');
  out.lines(detected.length ? detected.map((d) => `  ${d}`) : ['  (nothing notable)']);
  out.line();

  if (scope.kind === 'project') {
    const legacy = await planMigration(scope.root, ctx.homeDir);
    if (legacy.detected) {
      out.warn('AgileFlow v4 files detected. Run `agileflow migrate v4 --preview` to review a cleanup. Nothing was changed.');
    }
  }

  if (prompter.interactive && !options.yes && !options.global) {
    const where = await prompter.select(
      'Where should AgileFlow install skills?',
      [
        { value: 'project', label: 'Project', hint: '.agents/skills, shared with the repository' },
        { value: 'personal', label: 'Personal', hint: '~/.agents/skills, only for you' },
      ],
      'project',
    );
    if (where === 'personal') scope = globalScope(ctx);
  }

  const services = await servicesFor(ctx, scope);
  let requests: AddRequest[];
  if (options.skills !== undefined) {
    requests = splitList(options.skills).map((id) => ({ id, spec: { source: `@agileflow/${id}` } }));
  } else if (options.yes || !prompter.interactive) {
    requests = await coreRequests(services);
  } else {
    const catalog = await services.fetcher.listSkills();
    if (!catalog.length) throw new UsageError('The skill registry returned no skills');
    const recommended = [...RECOMMENDED, ...(facts?.github ? GITHUB_RECOMMENDED : [])];
    const ordered = [
      ...catalog.filter((s) => recommended.includes(s.name.split('/')[1]!)),
      ...catalog.filter((s) => !recommended.includes(s.name.split('/')[1]!)),
    ];
    const picked = await prompter.multiselect(
      'Which workflows should this repository use?',
      ordered.map((s) => {
        const id = s.name.split('/')[1]!;
        return { value: id, label: id, hint: recommended.includes(id) ? 'recommended' : 'optional' };
      }),
      recommended.filter((id) => catalog.some((s) => s.name === `@agileflow/${id}`)),
    );
    requests = picked.map((id) => ({ id, spec: { source: `@agileflow/${id}` } }));
  }

  // Resolve everything before writing anything, so an unreachable registry or a
  // typo never leaves a half-initialized project behind.
  if (requests.length) await prepareAdd(services, await loadWorkspace(scope), requests);

  // New projects start from the user's personal default question preference.
  const personal = await readGlobalConfig(globalScope(ctx).configPath).catch(() => null);
  await editScopeConfig(scope, () => undefined, {
    questionPreference: personal?.defaults?.questionPreference ?? 'provider-default',
  });
  const ws = await loadWorkspace(scope);
  requests = requests.filter((r) => !ws.specs[r.id]);
  if (requests.length) {
    await installRequests(cli, services, ws, requests, { yes: true, quiet: true });
  } else {
    await saveLock(ws);
    printSyncReport(cli, ws, await syncWorkspace(services, ws));
  }

  out.line();
  const configLabel = scope.kind === 'project' ? 'agileflow.yaml, agileflow.lock' : scope.configPath;
  out.line(`Wrote ${configLabel}${requests.length ? ` and ${relSkillsDir(scope)}/` : ''}.`);
  if (facts) {
    out.line();
    out.line('Existing project instruction files:');
    for (const f of facts.instructionFiles) out.line(`  ${f.present ? '[found]  ' : '[absent] '}${f.name}`);
    out.line('AgileFlow will leave them unchanged.');
  }
  out.line();
  out.line('Next: open Codex, Claude, Cursor, OpenCode, or Gemini as usual. The skills load when relevant.');
  if (scope.kind === 'project') {
    out.line('Commit agileflow.yaml, agileflow.lock, and .agents/skills to share these workflows with your team.');
  }
  return EXIT.OK;
}
