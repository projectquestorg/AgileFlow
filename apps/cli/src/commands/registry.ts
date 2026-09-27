import path from 'node:path';
import { buildRegistry } from '@agileflow/registry';
import type { Cli } from '../runtime';
import { EXIT, UsageError } from '../runtime';

export interface RegistryOptions {
  skills?: string;
  packs?: string;
  out?: string;
  scope?: string;
  json?: boolean;
}

/**
 * `agileflow registry build|check`: publish a directory of skills as a
 * static registry (the same format and append-only rules as the official
 * one). Host the output on any HTTPS static host or share it as a directory,
 * then point teams at it with `registry:` in agileflow.yaml.
 */
export async function runRegistry(cli: Cli, action: string, options: RegistryOptions): Promise<number> {
  if (action !== 'build' && action !== 'check') throw new UsageError('Use: agileflow registry <build|check>');
  const { ctx, out } = cli;
  const skillsDir = path.resolve(ctx.cwd, options.skills ?? 'skills');
  const packsDir = path.resolve(ctx.cwd, options.packs ?? 'packs');
  const outDir = path.resolve(ctx.cwd, options.out ?? 'registry');
  const scope = options.scope ? (options.scope.startsWith('@') ? options.scope : `@${options.scope}`) : undefined;
  if (!scope) {
    throw new UsageError('Pass --scope <name>: the package scope for your skills (for example --scope myorg for @myorg/<skill>)', [
      'Each skill directory needs agileflow.skill.yaml with package.name @<scope>/<directory name> and a semver version.',
    ]);
  }
  if (scope === '@agileflow') throw new UsageError('@agileflow is reserved for the official catalog; use your own scope');
  const result = await buildRegistry({ skillsDir, packsDir, outDir, scope, check: action === 'check' });
  const ok = !result.errors.length && (action === 'build' || !result.outOfDate.length);
  if (options.json) {
    out.json({ ok, action, scope, outDir, ...result });
    return ok ? EXIT.OK : EXIT.ERROR;
  }
  for (const w of result.warnings) out.warn(w);
  for (const e of result.errors) out.error(e);
  if (result.errors.length) return EXIT.ERROR;
  if (action === 'check') {
    if (result.outOfDate.length) {
      out.error(`${path.relative(ctx.cwd, outDir) || outDir} is out of date`, [...result.outOfDate, 'Run `agileflow registry build`.']);
      return EXIT.ERROR;
    }
    out.line(`Registry up to date (${result.skills.length} skills).`);
    return EXIT.OK;
  }
  out.line(`Built ${path.relative(ctx.cwd, outDir) || outDir}: ${result.skills.length} skills, ${result.written.length} file(s) written.`);
  out.line('Serve it over HTTPS (or share the directory) and set `registry:` in agileflow.yaml to use it.');
  return EXIT.OK;
}
