import {
  detachWorkspace,
  inspectSkill,
  loadWorkspace,
  removeSkills,
  type ScopeTarget,
  type Services,
} from '@agileflow/core';
import type { Cli } from '../runtime';
import { EXIT, mutate, relSkillsDir, scopeFor, servicesFor, UsageError } from '../runtime';

export interface RemoveOptions {
  global?: boolean;
  force?: boolean;
  all?: boolean;
  keepSkills?: boolean;
  yes?: boolean;
  dryRun?: boolean;
  json?: boolean;
}

/**
 * Confirmation policy for removals: interactive runs ask. Non-interactive
 * runs never discard local edits without --force, and `--all` needs --yes.
 */
export async function runRemove(cli: Cli, ids: string[], options: RemoveOptions): Promise<number> {
  const scope = await scopeFor(cli.ctx, options);
  const services = await servicesFor(cli.ctx, scope);
  if (options.all) return runDetach(cli, services, scope, options);
  if (!ids.length) throw new UsageError('Name the skills to remove, or use --all to stop using AgileFlow here');

  const describe = async () => {
    const ws = await loadWorkspace(scope);
    const plan: Array<{ id: string; files: 'deleted' | 'kept'; modified: boolean }> = [];
    for (const id of ids) {
      const entry = ws.lock.resolved[id];
      if (!entry && !ws.specs[id]) throw new UsageError(`${id} is not managed by AgileFlow in this scope`);
      const modified = entry?.ownership === 'managed' && (await inspectSkill(scope, id, { ...entry, enabled: undefined })).status === 'modified';
      plan.push({ id, files: entry?.ownership === 'managed' ? 'deleted' : 'kept', modified });
    }
    return plan;
  };

  if (options.dryRun) {
    const plan = await describe();
    if (options.json) cli.out.json({ ok: true, dryRun: true, plan });
    else for (const p of plan) cli.out.line(`Would remove ${p.id} (files ${p.files}${p.modified ? ', has local modifications' : ''})`);
    return EXIT.OK;
  }

  return mutate(cli, scope, async () => {
    const plan = await describe();
    const discarding = plan.filter((p) => p.modified && p.files === 'deleted');
    if (cli.prompter.interactive && !options.yes) {
      const detail = discarding.length ? ` (discarding local edits in ${discarding.map((p) => p.id).join(', ')})` : '';
      if (!(await cli.prompter.confirm(`Remove ${plan.map((p) => p.id).join(', ')}${detail}?`, !discarding.length))) {
        cli.out.line('Nothing removed.');
        if (options.json) cli.out.json({ ok: true, removed: [], declined: true });
        return EXIT.OK;
      }
    }
    const ws = await loadWorkspace(scope);
    const report = await removeSkills(services, ws, ids, { force: options.force });
    cli.record = { ...(cli.record ?? {}), changed: report.removed };
    for (const id of report.removed) {
      if (report.keptLocal.includes(id)) {
        cli.out.line(`Removed ${id} from AgileFlow; its files in ${relSkillsDir(scope)}/${id} are yours and were kept.`);
      } else {
        cli.out.line(`Removed ${id} (${relSkillsDir(scope)}/${id} and its provider links)`);
      }
    }
    for (const r of report.artifacts) {
      if (r.change.kind === 'warn') cli.out.warn(r.change.message);
      else if (r.outcome === 'failed') cli.out.warn(`could not remove ${r.change.path}: ${r.message}`);
    }
    if (options.json) cli.out.json({ ok: true, removed: report.removed, keptLocal: report.keptLocal });
    return EXIT.OK;
  });
}

/** `remove --all` / `migrate --detach`: stop using AgileFlow without breaking skills. */
export async function runDetach(
  cli: Cli,
  services: Services,
  scope: ScopeTarget,
  options: { keepSkills?: boolean; yes?: boolean; json?: boolean },
): Promise<number> {
  return mutate(cli, scope, async () => {
    const ws = await loadWorkspace(scope);
    if (!ws.configExists && !ws.lockExists) {
      cli.out.line('AgileFlow is not set up here; nothing to remove.');
      if (options.json) cli.out.json({ ok: true, detached: false });
      return EXIT.OK;
    }
    let keepSkills = options.keepSkills ?? true;
    const interactive = cli.prompter.interactive && !options.yes;
    if (options.keepSkills === undefined && interactive) {
      keepSkills =
        (await cli.prompter.select(
          'Keep installed skills as standalone Agent Skills?',
          [
            { value: 'yes', label: 'Yes', hint: 'skills keep working without AgileFlow' },
            { value: 'no', label: 'No', hint: 'delete unmodified AgileFlow skills' },
          ],
          'yes',
        )) === 'yes';
    }
    const ids = Object.keys(ws.lock.resolved);
    cli.out.line(
      keepSkills
        ? `This removes ${scope.kind === 'project' ? 'agileflow.yaml and agileflow.lock' : 'your personal AgileFlow config and lock'}; ${ids.length} skill(s) stay as standalone Agent Skills.`
        : `This removes the AgileFlow config and lock and deletes unmodified AgileFlow skills: ${ids.join(', ') || '(none)'}.`,
    );
    if (interactive) {
      if (!(await cli.prompter.confirm('Stop using AgileFlow here?', keepSkills))) {
        cli.out.line('Nothing changed.');
        if (options.json) cli.out.json({ ok: true, detached: false, declined: true });
        return EXIT.OK;
      }
    } else if (!options.yes) {
      throw new UsageError('Stopping AgileFlow here removes its config and lock; pass --yes to confirm', [
        keepSkills ? 'Skills are kept (--keep-skills).' : 'Unmodified skills would be deleted (--delete-skills).',
      ]);
    }
    const report = await detachWorkspace(services, ws, { keepSkills });
    cli.record = { ...(cli.record ?? {}), changed: [...report.removedSkills, ...report.removedFiles] };
    if (keepSkills) {
      cli.out.line(`Kept ${report.keptSkills.length} skill(s) in ${relSkillsDir(scope)} as standalone Agent Skills.`);
      if (report.keptSkills.length) cli.out.line('Provider links were kept so every provider still sees them.');
    } else {
      if (report.removedSkills.length) cli.out.line(`Deleted: ${report.removedSkills.join(', ')}`);
      if (report.keptModified.length) cli.out.line(`Kept (modified or locally owned): ${report.keptModified.join(', ')}`);
    }
    for (const f of report.removedFiles) cli.out.line(`Removed ${f}`);
    if (scope.kind === 'global') {
      // Personal detach also undoes provider settings AgileFlow changed on request
      // (only values nobody edited since, see configureOptionalFeature).
      const { codexAdapter, STRUCTURED_QUESTIONS_FEATURE } = await import('@agileflow/providers');
      const pctx = { ctx: cli.ctx, scope, settings: undefined };
      try {
        const change = await codexAdapter.configureOptionalFeature!(pctx, STRUCTURED_QUESTIONS_FEATURE, false);
        if (change.changed) cli.out.line(`Restored the Codex setting AgileFlow changed (${change.file}).`);
      } catch (err) {
        // The skills are already detached; a Codex config problem must not undo that.
        cli.out.warn(`could not restore the Codex setting AgileFlow changed: ${(err as Error).message}`);
        cli.out.warn('Run `agileflow configure codex-questions disable` after fixing it.');
      }
    }
    cli.out.line('AgileFlow no longer manages this scope. Nothing depends on the AgileFlow CLI.');
    if (options.json) cli.out.json({ ok: true, detached: true, ...report });
    return EXIT.OK;
  });
}
