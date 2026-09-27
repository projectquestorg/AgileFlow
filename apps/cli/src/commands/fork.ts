import { forkSkill, loadWorkspace, syncWorkspace } from '@agileflow/core';
import type { Cli } from '../runtime';
import { EXIT, mutate, scopeFor, servicesFor } from '../runtime';

export interface ForkOptions {
  global?: boolean;
  json?: boolean;
}

export async function runFork(cli: Cli, id: string, options: ForkOptions): Promise<number> {
  const scope = await scopeFor(cli.ctx, options);
  return mutate(cli, scope, async () => {
    const services = await servicesFor(cli.ctx, scope);
    const ws = await loadWorkspace(scope);
    const result = await forkSkill(services, ws, id);
    await syncWorkspace(services, ws, { mismatch: 'report' });
    cli.record = { ...(cli.record ?? {}), changed: [id] };
    const { out } = cli;
    if (options.json) {
      out.json({ ok: true, ...result });
      return EXIT.OK;
    }
    out.line(`${id} is now locally owned.`);
    out.line('Upstream:');
    out.line(`  ${result.forkedFrom}`);
    out.line('Local source:');
    out.line(`  ${scope.kind === 'project' ? '' : '~/'}${result.path}`);
    out.line('AgileFlow will no longer overwrite this skill during updates.');
    if (result.keepsOverlay) {
      out.line('Note: the fork keeps the question-preference text rendered into it; later preference changes do not apply to it.');
    }
    return EXIT.OK;
  });
}
