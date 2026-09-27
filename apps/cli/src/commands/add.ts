import { loadWorkspace, pathExists, type Activation } from '@agileflow/core';
import type { Cli } from '../runtime';
import { EXIT, mutate, scopeFor, servicesFor, UsageError } from '../runtime';
import { installRequests, preparedJson, resolveAddTargets, syncReportJson } from './shared';

export interface AddOptions {
  global?: boolean;
  yes?: boolean;
  activation?: string;
  skill?: string[];
  ref?: string;
  dryRun?: boolean;
  json?: boolean;
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
    if (!prompter.interactive) throw new UsageError('Name at least one skill, pack, owner/repo, git+ URL, or path to add');
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

  // Resolve and review before anything is written: a typo, an unreachable
  // source, or a declined prompt never leaves a half-configured project.
  const plan = async () => {
    const ws = await loadWorkspace(scope);
    const requests = await resolveAddTargets(cli, services, ws, targets, { skill: options.skill, ref: options.ref });
    const already = requests.filter((r) => ws.specs[r.id]).map((r) => r.id);
    for (const id of already) out.line(`${id} is already installed (use \`agileflow update ${id}\`).`);
    return { ws, fresh: requests.filter((r) => !ws.specs[r.id]), already };
  };

  if (options.dryRun) {
    const { ws, fresh, already } = await plan();
    const result = await installRequests(cli, services, ws, fresh, { activation, dryRun: true });
    if (options.json) {
      out.json({ ok: true, dryRun: true, scope: scope.kind, alreadyInstalled: already, plan: result.prepared.map(preparedJson) });
    } else {
      out.line(result.prepared.length ? 'Dry run: nothing was installed.' : 'Nothing to install.');
    }
    return EXIT.OK;
  }

  return mutate(cli, scope, async () => {
    const { ws, fresh, already } = await plan();
    if (!fresh.length) {
      if (options.json) out.json({ ok: true, scope: scope.kind, installed: [], alreadyInstalled: already });
      return EXIT.OK;
    }
    const createdConfig = !(await pathExists(scope.configPath));
    const result = await installRequests(cli, services, ws, fresh, { activation, yes: options.yes });
    if (result.declined) {
      out.line('Nothing installed.');
      if (options.json) out.json({ ok: true, scope: scope.kind, installed: [], declined: true });
      return EXIT.OK;
    }
    if (createdConfig) {
      out.line(`Created ${scope.kind === 'project' ? 'agileflow.yaml' : scope.configPath}`);
    }
    const errors = result.report?.events.filter((e) => e.level === 'error') ?? [];
    if (options.json) {
      out.json({
        ok: errors.length === 0,
        scope: scope.kind,
        installed: result.prepared.map(preparedJson),
        alreadyInstalled: already,
        sync: result.report ? syncReportJson(result.report) : null,
      });
    }
    return errors.length ? EXIT.ERROR : EXIT.OK;
  });
}
