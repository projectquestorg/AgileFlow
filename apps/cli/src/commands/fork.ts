import { forkSkill, loadWorkspace, syncWorkspace } from '@agileflow/core';
import type { Cli } from '../runtime';
import { EXIT, scopeFor, servicesFor } from '../runtime';

export interface ForkOptions {
  global?: boolean;
}

export async function runFork(cli: Cli, id: string, options: ForkOptions): Promise<number> {
  const scope = await scopeFor(cli.ctx, options);
  const services = await servicesFor(cli.ctx, scope);
  const ws = await loadWorkspace(scope);
  const result = await forkSkill(services, ws, id);
  await syncWorkspace(services, ws);
  const { out } = cli;
  out.line(`${id} is now locally owned.`);
  out.line('Upstream:');
  out.line(`  ${result.forkedFrom}`);
  out.line('Local source:');
  out.line(`  ${scope.kind === 'project' ? '' : '~/'}${result.path}`);
  out.line('AgileFlow will no longer overwrite this skill during updates.');
  return EXIT.OK;
}
