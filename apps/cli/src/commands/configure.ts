import path from 'node:path';
import {
  editScopeConfig,
  globalScope,
  loadWorkspace,
  setConfigValue,
  setSkillSpecs,
  syncWorkspace,
  type Activation,
  type InteractionPreference,
  type ScopeTarget,
} from '@agileflow/core';
import {
  codexAdapter,
  codexConfigPath,
  readStructuredQuestions,
  STRUCTURED_QUESTIONS_FEATURE,
} from '@agileflow/providers';
import type { Cli } from '../runtime';
import { EXIT, findProject, mutate, requireProjectScope, scopeFor, servicesFor, UsageError } from '../runtime';
import { printSyncReport, syncReportJson } from './shared';
import { readGlobalConfig, readProjectConfig, projectScope, pathExists } from '@agileflow/core';
import { resolveRegistryLocation } from '@agileflow/registry';

export interface ConfigureOptions {
  global?: boolean;
  activation?: string;
  enable?: boolean;
  disable?: boolean;
  yes?: boolean;
  json?: boolean;
}

const PREFERENCES: InteractionPreference[] = ['provider-default', 'prefer', 'minimize'];

async function applyAndSync(cli: Cli, scope: ScopeTarget, result: Record<string, unknown>): Promise<number> {
  const services = await servicesFor(cli.ctx, scope);
  const ws = await loadWorkspace(scope);
  let sync = null;
  if (ws.lockExists) {
    sync = await syncWorkspace(services, ws, { mismatch: 'report' });
    printSyncReport(cli, ws, sync);
  }
  if (cli.out.jsonMode) cli.out.json({ ok: true, ...result, sync: sync ? syncReportJson(sync) : null });
  return sync?.events.some((e) => e.level === 'error') ? EXIT.ERROR : EXIT.OK;
}

/** `agileflow configure show`: the effective configuration, where each value comes from. */
async function showConfig(cli: Cli, options: ConfigureOptions): Promise<number> {
  const { ctx, out } = cli;
  const personalScope = globalScope(ctx);
  const personal = await readGlobalConfig(personalScope.configPath);
  const root = options.global ? null : await findProject(ctx);
  const project = root ? await readProjectConfig(projectScope(root).configPath) : null;
  const registry = resolveRegistryLocation({
    ctx,
    registry: project?.registry ?? personal?.registry,
    registryBase: project?.registry ? root! : path.dirname(personalScope.configPath),
  });
  const registrySource = ctx.env.AGILEFLOW_REGISTRY
    ? 'AGILEFLOW_REGISTRY'
    : project?.registry
      ? 'agileflow.yaml'
      : personal?.registry
        ? 'personal config'
        : 'default';
  const data = {
    ok: true,
    project: root ? { root, config: projectScope(root).configPath, requires: project?.agileflow ?? null } : null,
    personal: { config: personalScope.configPath, exists: await pathExists(personalScope.configPath) },
    registry: { location: registry, from: registrySource },
    questionPreference: project?.interaction?.questionPreference ?? personal?.defaults?.questionPreference ?? 'provider-default',
    providers: { ...(personal?.providers ?? {}), ...(project?.providers ?? {}) },
    skills: Object.keys(project?.skills ?? personal?.globalSkills ?? {}).length,
    work: project?.work ?? null,
    directories: { config: ctx.configDir, cache: ctx.cacheDir },
    environment: Object.fromEntries(
      Object.entries(ctx.env).filter(([k, v]) => k.startsWith('AGILEFLOW_') && v !== undefined),
    ),
  };
  if (options.json || out.jsonMode) {
    out.json(data);
    return EXIT.OK;
  }
  out.heading('Effective configuration');
  out.line(`  project:             ${data.project ? data.project.config : '(none here)'}`);
  if (data.project?.requires) out.line(`  requires AgileFlow:  ${data.project.requires}`);
  out.line(`  personal config:     ${data.personal.config}${data.personal.exists ? '' : ' (not created)'}`);
  out.line(`  registry:            ${data.registry.location} (${data.registry.from})`);
  out.line(`  question preference: ${data.questionPreference}`);
  for (const [id, settings] of Object.entries(data.providers)) out.line(`  provider ${id}: ${JSON.stringify(settings)}`);
  out.line(`  config directory:    ${data.directories.config}`);
  out.line(`  cache directory:     ${data.directories.cache}`);
  for (const [k, v] of Object.entries(data.environment)) out.line(`  env ${k}=${v}`);
  return EXIT.OK;
}

// ---------------------------------------------------------------------------
// Codex structured questions
// ---------------------------------------------------------------------------

async function codexQuestions(cli: Cli, action: string | undefined, options: ConfigureOptions): Promise<number> {
  const { ctx, out, prompter } = cli;
  const current = await readStructuredQuestions(ctx);
  const file = codexConfigPath(ctx);
  const pctx = { ctx, scope: globalScope(ctx), settings: undefined };
  if (!action || action === 'status') {
    out.line('Structured questions in Codex');
    out.line('Codex can expose request_user_input during normal (Default mode) work through an experimental feature.');
    out.line(`Current: ${current === null ? 'unknown (config unreadable)' : current ? 'enabled' : 'disabled'}`);
    out.line('AgileFlow does not need this feature to function.');
    out.line('Note: Codex shows an "under-development features" warning at startup while it is enabled.');
    if (action === 'status' || !prompter.interactive) return EXIT.OK;
    const choice = await prompter.select(
      'Enable it?',
      [
        { value: 'keep', label: 'Keep Codex default', hint: 'restore anything AgileFlow changed' },
        { value: 'enable', label: 'Enable' },
      ],
      current ? 'enable' : 'keep',
    );
    action = choice === 'enable' ? 'enable' : 'disable';
  }
  if (action !== 'enable' && action !== 'disable') {
    throw new UsageError('Use: agileflow configure codex-questions <enable|disable|status>');
  }
  const enable = action === 'enable';
  const preview = await codexAdapter.configureOptionalFeature!(pctx, STRUCTURED_QUESTIONS_FEATURE, enable, { dryRun: true });
  if (!preview.changed) {
    out.line(
      enable
        ? 'Codex structured questions are already enabled. Nothing changed.'
        : 'AgileFlow has not changed this Codex setting, so there is nothing to restore. Your Codex configuration was left as is.',
    );
  } else {
    if (enable) out.line('Codex will show an "under-development features" warning at startup while this is enabled.');
    out.line('Only this setting will change:');
    out.line(file);
    out.line('[features]');
    out.line(
      preview.after === undefined
        ? '(remove) default_mode_request_user_input'
        : `default_mode_request_user_input = ${String(preview.after)}`,
    );
    if (prompter.interactive && !options.yes && !(await prompter.confirm('Apply this change?', true))) {
      out.line('No changes made.');
      return EXIT.OK;
    }
    await codexAdapter.configureOptionalFeature!(pctx, STRUCTURED_QUESTIONS_FEATURE, enable);
    out.line(enable ? 'Enabled. The previous value was recorded so it can be restored.' : 'Restored the previous Codex setting.');
  }
  const g = globalScope(ctx);
  await editScopeConfig(g, (doc) => doc.setIn(['providers', 'codex', 'structuredQuestions'], enable ? 'enabled' : 'inherit'));
  return EXIT.OK;
}

// ---------------------------------------------------------------------------
// Question preference, skills, providers
// ---------------------------------------------------------------------------

async function questionPreference(cli: Cli, value: string | undefined, options: ConfigureOptions): Promise<number> {
  const scope = options.global ? globalScope(cli.ctx) : await requireProjectScope(cli.ctx);
  if (!value) {
    if (!cli.prompter.interactive) throw new UsageError(`Use: agileflow configure question-preference <${PREFERENCES.join('|')}>`);
    value = await cli.prompter.select(
      options.global ? 'Personal default question preference' : 'Question preference for this project',
      [
        { value: 'provider-default', label: 'Provider default', hint: 'do nothing special' },
        { value: 'prefer', label: 'Prefer questions', hint: 'ask when input materially improves the result' },
        { value: 'minimize', label: 'Minimize questions', hint: 'assume reasonably; ask only when blocked' },
      ],
      'provider-default',
    );
  }
  if (!PREFERENCES.includes(value as InteractionPreference)) {
    throw new UsageError(`question preference must be one of: ${PREFERENCES.join(', ')}`);
  }
  if (scope.kind === 'global') {
    await setConfigValue(scope, ['defaults', 'questionPreference'], value);
    cli.out.line(`Personal default question preference: ${value} (used for new projects and personal skills)`);
  } else {
    await setConfigValue(scope, ['interaction', 'questionPreference'], value);
    cli.out.line(`Project question preference: ${value}`);
  }
  return applyAndSync(cli, scope, { topic: 'question-preference', scope: scope.kind, value });
}

async function configureSkill(cli: Cli, id: string | undefined, options: ConfigureOptions): Promise<number> {
  const scope = await scopeFor(cli.ctx, options);
  const ws = await loadWorkspace(scope);
  const ids = Object.keys(ws.specs).sort();
  if (!ids.length) throw new UsageError('No skills are installed in this scope');
  if (!id) {
    if (!cli.prompter.interactive) throw new UsageError('Use: agileflow configure skill <id> [--activation auto|manual] [--enable|--disable]');
    id = await cli.prompter.select(
      'Which skill?',
      ids.map((s) => ({
        value: s,
        label: s,
        hint: `${ws.specs[s]!.enabled === false ? 'disabled' : 'enabled'}, ${ws.specs[s]!.activation ?? ws.lock.resolved[s]?.activation ?? 'auto'}`,
      })),
    );
  }
  const spec = ws.specs[id];
  if (!spec) throw new UsageError(`${id} is not installed in this scope`);
  let activation: Activation | undefined = options.activation as Activation | undefined;
  let enabled: boolean | undefined = options.enable ? true : options.disable ? false : undefined;
  if (activation && activation !== 'auto' && activation !== 'manual') throw new UsageError('--activation must be auto or manual');
  if (activation === undefined && enabled === undefined) {
    if (!cli.prompter.interactive) throw new UsageError('Pass --activation, --enable, or --disable');
    const current: Activation = spec.activation ?? ws.lock.resolved[id]?.activation ?? 'auto';
    activation = await cli.prompter.select<Activation>(
      `How should ${id} activate?`,
      [
        { value: 'auto', label: 'Automatic', hint: 'the agent loads it when relevant' },
        { value: 'manual', label: 'Manual', hint: 'only when you invoke it explicitly' },
      ],
      current,
    );
    enabled = await cli.prompter.confirm(`Keep ${id} enabled?`, spec.enabled !== false);
  }
  const next = { ...spec };
  if (activation) next.activation = activation;
  if (enabled === false) next.enabled = false;
  else if (enabled === true) delete next.enabled;
  await setSkillSpecs(scope, { [id]: next });
  if (ws.lock.resolved[id]?.ownership === 'local' && activation) {
    cli.out.warn(`${id} is locally owned; AgileFlow does not rewrite it. Add or remove the manual-invocation flags in its SKILL.md yourself.`);
  }
  cli.out.line(`${id}: ${next.enabled === false ? 'disabled' : 'enabled'}, activation ${next.activation ?? ws.lock.resolved[id]?.activation ?? 'auto'}`);
  return applyAndSync(cli, scope, {
    topic: 'skill',
    skill: id,
    enabled: next.enabled !== false,
    activation: next.activation ?? ws.lock.resolved[id]?.activation ?? 'auto',
  });
}

async function configureProvider(cli: Cli, id: string | undefined, value: string | undefined, options: ConfigureOptions): Promise<number> {
  const scope = await scopeFor(cli.ctx, options);
  const services = await servicesFor(cli.ctx, scope);
  const known = services.adapters.map((a) => a.id);
  if (!id) {
    if (!cli.prompter.interactive) throw new UsageError(`Use: agileflow configure provider <${known.join('|')}> <auto|on|off>`);
    id = await cli.prompter.select('Which provider?', services.adapters.map((a) => ({ value: a.id, label: a.displayName, hint: a.support })));
  }
  if (!known.includes(id as never)) throw new UsageError(`Unknown provider "${id}" (known: ${known.join(', ')})`);
  if (!value) {
    if (!cli.prompter.interactive) throw new UsageError('Pass auto, on, or off');
    value = await cli.prompter.select(
      `${id} compatibility`,
      [
        { value: 'auto', label: 'Automatic', hint: 'when the provider is detected' },
        { value: 'on', label: 'Always' },
        { value: 'off', label: 'Off', hint: 'remove AgileFlow-created provider links' },
      ],
      'auto',
    );
  }
  const map: Record<string, 'auto' | boolean> = { auto: 'auto', on: true, true: true, off: false, false: false };
  if (!Object.hasOwn(map, value)) throw new UsageError('Provider setting must be auto, on, or off');
  await setConfigValue(scope, ['providers', id, 'enabled'], map[value]);
  cli.out.line(`${id}: ${value}`);
  return applyAndSync(cli, scope, { topic: 'provider', provider: id, enabled: map[value] });
}

export async function runConfigure(cli: Cli, args: string[], options: ConfigureOptions): Promise<number> {
  let [topic, a, b] = args;
  if (!topic) {
    if (!cli.prompter.interactive) {
      throw new UsageError('Nothing to configure', [
        'agileflow configure skill <id> --activation manual|auto | --enable | --disable',
        'agileflow configure provider <claude|codex|cursor|opencode|gemini> <auto|on|off>',
        'agileflow configure codex-questions <enable|disable|status>',
        'agileflow configure question-preference <provider-default|prefer|minimize> [--global]',
        'agileflow configure show [--json]',
      ]);
    }
    topic = await cli.prompter.select('What would you like to configure?', [
      { value: 'show', label: 'Show', hint: 'effective configuration and where it comes from' },
      { value: 'skill', label: 'Skills', hint: 'enable, disable, automatic or manual invocation' },
      { value: 'provider', label: 'Providers', hint: 'provider compatibility links' },
      { value: 'codex-questions', label: 'Structured questions', hint: 'optional Codex feature' },
      { value: 'personal-defaults', label: 'Personal defaults', hint: 'question preference for new projects' },
      { value: 'question-preference', label: 'Project defaults', hint: 'question preference for this project' },
    ]);
    if (topic === 'personal-defaults') {
      options = { ...options, global: true };
      topic = 'question-preference';
    }
  }
  if (topic === 'show' || topic === 'get') return showConfig(cli, options);
  const scopeToLock = topic === 'codex-questions' || topic === 'structured-questions' || options.global
    ? globalScope(cli.ctx)
    : ((await findProject(cli.ctx)) ? await requireProjectScope(cli.ctx) : globalScope(cli.ctx));
  return mutate(cli, scopeToLock, () => dispatch(cli, topic!, a, b, options));
}

async function dispatch(cli: Cli, topic: string, a: string | undefined, b: string | undefined, options: ConfigureOptions): Promise<number> {
  switch (topic) {
    case 'codex-questions':
    case 'structured-questions':
      return codexQuestions(cli, a, options);
    case 'question-preference':
      return questionPreference(cli, a, options);
    case 'skill':
    case 'skills':
      return configureSkill(cli, a, options);
    case 'provider':
    case 'providers':
      return configureProvider(cli, a, b, options);
    default:
      throw new UsageError(`Unknown configure topic "${topic}"`, [
        'Topics: show, skill, provider, codex-questions, question-preference',
      ]);
  }
}
