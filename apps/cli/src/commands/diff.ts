import { diffSkill, loadWorkspace } from '@agileflow/core';
import type { Cli } from '../runtime';
import { EXIT, scopeFor, servicesFor } from '../runtime';

export interface DiffOptions {
  global?: boolean;
  upstream?: boolean;
}

export async function runDiff(cli: Cli, id: string, options: DiffOptions): Promise<number> {
  const scope = await scopeFor(cli.ctx, options);
  const services = await servicesFor(cli.ctx, scope);
  const ws = await loadWorkspace(scope);
  const result = await diffSkill(services, ws, id, { upstream: options.upstream });
  cli.out.heading(result.title);
  cli.out.line(result.identical ? 'No differences.' : result.patch.trimEnd());
  return EXIT.OK;
}
