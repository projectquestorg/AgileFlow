import { editScopeConfig, loadWorkspace, pathExists, type Activation } from '@agileflow/core';
import type { Cli } from '../runtime';
import { EXIT, scopeFor, servicesFor, UsageError } from '../runtime';
import { installRequests, resolveAddTargets } from './shared';

export interface AddOptions {
  global?: boolean;
  yes?: boolean;
  activation?: string;
  skill?: string[];
}

export async function runAdd(cli: Cli, targets: string[], options: AddOptions): Promise<number> {
  const { out, prompter } = cli;
  let activation: Activation | undefined;
  if (options.activation) {
    if (options.activation !== 'auto' && options.activation !== 'manual') {
      throw new UsageError('--activation must be "auto" or "manual"');
    }
    activation = options.activation;
  }
  const scope = await scopeFor(cli.ctx, options, true);
  const services = await servicesFor(cli.ctx, scope);

  if (!targets.length) {
    if (!prompter.interactive) throw new UsageError('Name at least one skill, pack, git+ URL, or path to add');
    const ws = await loadWorkspace(scope);
    const catalog = (await services.fetcher.listSkills()).filter((s) => !ws.specs[s.name.split('/')[1]!]);
    if (!catalog.length) {
      out.line('Every skill in the registry is already installed.');
      return EXIT.OK;
    }
    targets = await prompter.multiselect(
      'Which skills should be added?',
      catalog.map((s) => ({ value: s.name, label: s.name.split('/')[1]!, hint: s.description.slice(0, 80) })),
      [],
      true,
    );
  }

  if (!(await pathExists(scope.configPath))) {
    await editScopeConfig(scope, () => undefined);
    out.line(`Created ${scope.kind === 'project' ? 'agileflow.yaml' : scope.configPath}`);
  }
  const ws = await loadWorkspace(scope);
  const requests = await resolveAddTargets(cli, services, ws, targets, { skill: options.skill });
  const fresh = requests.filter((r) => !ws.specs[r.id]);
  for (const r of requests) if (ws.specs[r.id]) out.line(`${r.id} is already installed (use \`agileflow update ${r.id}\`).`);
  if (!fresh.length) return EXIT.OK;
  const report = await installRequests(cli, services, ws, fresh, { activation, yes: options.yes });
  if (!report) {
    out.line('Nothing installed.');
    return EXIT.OK;
  }
  return EXIT.OK;
}
