import {
  editScopeConfig,
  globalScope,
  loadWorkspace,
  setConfigValue,
  setSkillSpecs,
  syncWorkspace,
  type Activation,
  type QuestionPreference,
  type ScopeTarget,
} from '@agileflow/core';
import {
  codexAdapter,
  codexConfigPath,
  readStructuredQuestions,
  STRUCTURED_QUESTIONS_FEATURE,
} from '@agileflow/providers';
import type { Cli } from '../runtime';
import { EXIT, requireProjectScope, scopeFor, servicesFor, UsageError } from '../runtime';
import { printSyncReport } from './shared';

export interface ConfigureOptions {
  global?: boolean;
  activation?: string;
  enable?: boolean;
  disable?: boolean;
  yes?: boolean;
}

const PREFERENCES: QuestionPreference[] = ['provider-default', 'prefer', 'minimize'];

async function applyAndSync(cli: Cli, scope: ScopeTarget): Promise<void> {
  const services = await servicesFor(cli.ctx, scope);
  const ws = await loadWorkspace(scope);
  if (!ws.lockExists) return;
  printSyncReport(cli, ws, await syncWorkspace(services, ws));
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
  if (!PREFERENCES.includes(value as QuestionPreference)) {
    throw new UsageError(`question preference must be one of: ${PREFERENCES.join(', ')}`);
  }
  if (scope.kind === 'global') {
    await setConfigValue(scope, ['defaults', 'questionPreference'], value);
    cli.out.line(`Personal default question preference: ${value} (used for new projects and personal skills)`);
  } else {
    await setConfigValue(scope, ['interaction', 'questionPreference'], value);
    cli.out.line(`Project question preference: ${value}`);
  }
  await applyAndSync(cli, scope);
  return EXIT.OK;
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
  await applyAndSync(cli, scope);
  return EXIT.OK;
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
  if (!(value in map)) throw new UsageError('Provider setting must be auto, on, or off');
  await setConfigValue(scope, ['providers', id, 'enabled'], map[value]);
  cli.out.line(`${id}: ${value}`);
  await applyAndSync(cli, scope);
  return EXIT.OK;
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
      ]);
    }
    topic = await cli.prompter.select('What would you like to configure?', [
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
        'Topics: skill, provider, codex-questions, question-preference',
      ]);
  }
}
