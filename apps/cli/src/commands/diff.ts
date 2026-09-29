import { diffSkill, loadWorkspace } from '@agileflow/core';
import type { Cli } from '../runtime';
import { EXIT, interruptedSkills, scopeFor, servicesFor } from '../runtime';

export interface DiffOptions {
  global?: boolean;
  upstream?: boolean;
  json?: boolean;
}

export async function runDiff(cli: Cli, id: string, options: DiffOptions): Promise<number> {
  const scope = await scopeFor(cli.ctx, options);
  const services = await servicesFor(cli.ctx, scope);
  const ws = await loadWorkspace(scope);
  if ((await interruptedSkills(cli, scope)).has(id)) {
    cli.out.warn(`${id} is part of the interrupted operation; this diff compares against the lock from before it`);
  }
  const result = await diffSkill(services, ws, id, { upstream: options.upstream });
  if (options.json) {
    cli.out.json({ ok: true, skill: id, upstream: !!options.upstream, ...result });
    return EXIT.OK;
  }
  cli.out.heading(result.title);
  cli.out.line(result.identical ? 'No differences.' : result.patch.trimEnd());
  return EXIT.OK;
}
