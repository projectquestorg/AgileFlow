import { loadWorkspace, pathExists, type Activation } from '@agileflow/core';
import type { Cli } from '../runtime';
import { EXIT, mutate, scopeFor, servicesFor, UsageError } from '../runtime';
import { mutationEnvelope } from '../ui/output';
import { installRequests, preparedJson, resolveAddTargets, syncReportJson } from './shared';

export interface AddOptions {
  global?: boolean;
  yes?: boolean;
  activation?: string;
  skill?: string[];
  ref?: string;
  dryRun?: boolean;
  json?: boolean;
  /** Adopt skills already present in this scope instead of installing new ones. */
  adopt?: boolean;
}

export async function runAdd(cli: Cli, targets: string[], options: AddOptions): Promise<number> {
  const { out, prompter } = cli;
  if (options.adopt) {
    if (options.activation || options.skill?.length || options.ref) {
      throw new UsageError('--adopt takes skill ids only (no --activation, --skill, or --ref)');
    }
    return (await import('./adopt')).runAdopt(cli, targets, options);
  }
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
      const plan = result.prepared.map(preparedJson);
      out.json(
        mutationEnvelope('add', {
          dryRun: true,
          applied: plan,
          skipped: already.map((id) => ({ id, reason: 'already installed' })),
          extra: { scope: scope.kind, alreadyInstalled: already, plan },
        }),
      );
    } else {
      out.line(result.prepared.length ? 'Dry run: nothing was installed.' : 'Nothing to install.');
    }
    return EXIT.OK;
  }

  return mutate(cli, scope, async () => {
    const { ws, fresh, already } = await plan();
    if (!fresh.length) {
      if (options.json) {
        out.json(
          mutationEnvelope('add', {
            skipped: already.map((id) => ({ id, reason: 'already installed' })),
            extra: { scope: scope.kind, installed: [], alreadyInstalled: already },
          }),
        );
      }
      return EXIT.OK;
    }
    const createdConfig = !(await pathExists(scope.configPath));
    const result = await installRequests(cli, services, ws, fresh, { activation, yes: options.yes });
    if (result.declined) {
      out.line('Nothing installed.');
      if (options.json) {
        out.json(
          mutationEnvelope('add', {
            skipped: result.prepared.map((p) => ({ id: p.id, reason: 'declined' })),
            extra: { scope: scope.kind, installed: [], declined: true },
          }),
        );
      }
      return EXIT.OK;
    }
    if (createdConfig) {
      out.line(`Created ${scope.kind === 'project' ? 'agileflow.yaml' : scope.configPath}`);
    }
    const errors = result.report?.events.filter((e) => e.level === 'error') ?? [];
    if (options.json) {
      const installed = result.prepared.map(preparedJson);
      out.json(
        mutationEnvelope('add', {
          applied: installed,
          skipped: already.map((id) => ({ id, reason: 'already installed' })),
          events: result.report?.events ?? [],
          extra: {
            scope: scope.kind,
            installed,
            alreadyInstalled: already,
            sync: result.report ? syncReportJson(result.report) : null,
          },
        }),
      );
    }
    return errors.length ? EXIT.ERROR : EXIT.OK;
  });
}
