import {
  describeSource,
  findProjectRoot,
  globalScope,
  inspectSkill,
  listUnmanagedSkills,
  loadWorkspace,
  pathExists,
  projectScope,
  type ScopeTarget,
  type Services,
} from '@agileflow/core';
import type { Cli } from '../runtime';
import { EXIT, relSkillsDir, servicesFor } from '../runtime';
import { table } from '../ui/tables';

export interface ListOptions {
  global?: boolean;
  json?: boolean;
}

interface Row {
  name: string;
  version: string;
  mode: string;
  source: string;
  status: string;
}

async function rowsFor(scope: ScopeTarget): Promise<{ rows: Row[]; unmanaged: string[] } | null> {
  const ws = await loadWorkspace(scope);
  if (!ws.configExists) return null;
  const rows: Row[] = [];
  const ids = [...new Set([...Object.keys(ws.specs), ...Object.keys(ws.lock.resolved)])].sort();
  for (const id of ids) {
    const spec = ws.specs[id];
    const entry = ws.lock.resolved[id];
    let status = 'not locked';
    if (entry) status = (await inspectSkill(scope, id, entry)).status;
    if (spec?.enabled === false) status = 'disabled';
    const source = spec?.provenance?.forkedFrom
      ? `fork of ${spec.provenance.forkedFrom}`
      : describeSource(spec?.source ?? entry!.source);
    rows.push({
      name: id,
      version: entry?.version ?? '-',
      mode: spec?.activation ?? entry?.activation ?? 'auto',
      source,
      status,
    });
  }
  return { rows, unmanaged: await listUnmanagedSkills(scope, ids) };
}

async function providerRows(cli: Cli, services: Services, scope: ScopeTarget): Promise<string[][]> {
  const ws = await loadWorkspace(scope).catch(() => null);
  const rows: string[][] = [];
  for (const adapter of services.adapters) {
    const pctx = { ctx: cli.ctx, scope, settings: ws?.providerSettings[adapter.id] };
    if (pctx.settings?.enabled === false) {
      rows.push([adapter.displayName, 'disabled in config']);
      continue;
    }
    const detected = (await adapter.detect(pctx)).detected || pctx.settings?.enabled === true;
    const caps = await adapter.inspect(pctx);
    const how = caps.exposure === 'native' ? `native ${caps.skillLocations[0]}` : `linked ${caps.skillLocations[0]}`;
    rows.push([adapter.displayName, detected ? how : `${how} (not detected)`]);
  }
  return rows;
}

export async function runList(cli: Cli, options: ListOptions): Promise<number> {
  const { ctx, out } = cli;
  const scopes: Array<{ label: string; scope: ScopeTarget }> = [];
  if (!options.global) {
    const root = await findProjectRoot(ctx.cwd);
    if (root) scopes.push({ label: 'Project skills', scope: projectScope(root) });
  }
  const personal = globalScope(ctx);
  if (options.global || (await pathExists(personal.configPath))) {
    scopes.push({ label: 'Personal skills', scope: personal });
  }

  const json: Record<string, unknown> = {};
  let printed = false;
  for (const { label, scope } of scopes) {
    const data = await rowsFor(scope);
    if (!data) continue;
    json[scope.kind] = data;
    if (options.json) continue;
    printed = true;
    out.heading(label);
    if (data.rows.length) {
      out.lines(
        table(
          ['NAME', 'VERSION', 'MODE', 'SOURCE', 'STATUS'],
          data.rows.map((r) => [r.name, r.version, r.mode, r.source, r.status]),
          '  ',
        ),
      );
    } else {
      out.line('  (none)');
    }
    if (data.unmanaged.length) {
      out.line(`  Not managed by AgileFlow (left untouched): ${data.unmanaged.join(', ')}`);
    }
    out.line();
  }

  const scopeForProviders = scopes[0]?.scope ?? personal;
  const services = await servicesFor(ctx, scopeForProviders);
  const providers = await providerRows(cli, services, scopeForProviders);
  if (options.json) {
    json.providers = providers.map(([name, how]) => ({ name, how }));
    out.json(json);
    return EXIT.OK;
  }
  if (!printed) {
    out.line(`No AgileFlow skills here. Run \`agileflow init\` (project) or \`agileflow add --global <skill>\` (personal).`);
    out.line();
  }
  out.heading('Providers');
  out.lines(table(['PROVIDER', 'SKILLS'], providers, '  ').slice(1));
  if (scopes.length) out.line(`\nCanonical skills live in ${relSkillsDir(scopeForProviders)}.`);
  return EXIT.OK;
}
