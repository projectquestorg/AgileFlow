import path from 'node:path';
import {
  globalScope,
  packMembers,
  parseAddTarget,
  parseSkillMarkdown,
  pathExists,
  projectScope,
  riskCounts,
  scanSkill,
  skillIdFromPackageName,
  SKILL_FILE,
  summarizeTree,
  type FetchedPackage,
  type SkillSpec,
} from '@agileflow/core';
import type { RegistryClient } from '@agileflow/registry';
import type { Cli } from '../runtime';
import { EXIT, findProject, servicesFor, UsageError } from '../runtime';
import { safeText } from '../ui/tables';
import { riskLine } from './shared';

export interface InfoOptions {
  skill?: string;
  ref?: string;
  content?: boolean;
  json?: boolean;
}

/** Frontmatter fields from the Agent Skills spec worth showing before install. */
const SPEC_FIELDS = ['license', 'compatibility', 'allowed-tools', 'metadata'];

/**
 * `agileflow info <target>`: everything worth knowing before installing a
 * skill or pack (versions, license, compatibility, files, requirements, risk
 * scan, and optionally SKILL.md itself). Nothing is written.
 */
export async function runInfo(cli: Cli, target: string, options: InfoOptions): Promise<number> {
  const { out, ctx } = cli;
  const root = await findProject(ctx);
  const scope = root ? projectScope(root) : globalScope(ctx);
  const services = await servicesFor(ctx, scope);
  const registry = (services.fetcher as { registry?: RegistryClient }).registry;
  const parsed = parseAddTarget(target, { localPathExists: await pathExists(path.resolve(ctx.cwd, target)) });

  let spec: SkillSpec;
  let id: string;
  let versions: string[] | null = null;
  if (parsed.ref.kind === 'registry') {
    const name = parsed.ref.name;
    const doc = registry ? await registry.getSkill(name) : null;
    if (!doc) {
      const pack = await services.fetcher.getPack(name);
      if (!pack) throw new UsageError(`No skill or pack named ${target}`, [`Search: agileflow search ${target}`]);
      const members = packMembers(pack);
      if (options.json) {
        out.json({ ok: true, kind: 'pack', name: pack.name, description: pack.description ?? '', skills: members });
        return EXIT.OK;
      }
      out.heading(`Pack ${pack.name}`);
      if (pack.description) out.line(safeText(pack.description));
      out.line('Skills:');
      for (const m of members) out.line(`  ${m.id}${m.range ? ` (${m.range})` : ''}`);
      out.line(`Install: agileflow add ${target}`);
      return EXIT.OK;
    }
    id = skillIdFromPackageName(name);
    versions = Object.keys(doc.versions);
    spec = { source: name, ...(parsed.range ? { version: parsed.range } : {}) };
  } else {
    const gitRef = options.ref ?? parsed.gitRef ?? undefined;
    const found = await services.fetcher.discover(parsed.source, scope.root, gitRef);
    const wanted = options.skill ?? parsed.skill ?? null;
    const pick = wanted ? found.find((f) => f.id === wanted) : found.length === 1 ? found[0] : null;
    if (!pick) {
      if (!found.length) throw new UsageError(`No SKILL.md found at ${target}`);
      if (options.json && !wanted) {
        out.json({ ok: true, kind: 'collection', source: parsed.source, skills: found });
        return EXIT.OK;
      }
      throw new UsageError(
        wanted ? `${wanted} not found at ${target}` : `${target} contains ${found.length} skills; pick one with --skill <name>`,
        [`Available: ${found.map((f) => f.id).join(', ')}`],
      );
    }
    id = pick.id;
    let source = parsed.source;
    if (pick.subpath) {
      source = parsed.ref.kind === 'git'
        ? `git+${parsed.ref.url}#${parsed.ref.subpath ? `${parsed.ref.subpath}/` : ''}${pick.subpath}`
        : `./${path.posix.join(parsed.source.replace(/^\.\//, ''), pick.subpath)}`;
    }
    spec = { source, ...(gitRef ? { ref: gitRef } : {}) };
  }

  const pkg: FetchedPackage = await services.fetcher.resolve(id, spec, scope.root);
  const summary = summarizeTree(pkg.files);
  const risks = scanSkill(pkg.files);
  const skillText = pkg.files.find((f) => f.path === SKILL_FILE)?.content.toString('utf8') ?? '';
  const frontmatter = parseSkillMarkdown(skillText).frontmatter;
  const specFields = Object.fromEntries(SPEC_FIELDS.filter((k) => k in frontmatter).map((k) => [k, frontmatter[k]]));
  const pinned = parsed.ref.kind === 'registry' && registry ? registry.isPinned(parsed.ref.name, pkg.version) : false;

  if (options.json) {
    out.json({
      ok: true,
      kind: 'skill',
      id,
      source: spec.source,
      ...(spec.ref ? { ref: spec.ref } : {}),
      version: pkg.version,
      ...(versions ? { versions } : {}),
      ...(pkg.resolved ? { resolved: pkg.resolved } : {}),
      integrity: pkg.integrity,
      pinnedByThisRelease: pinned,
      description: summary.description,
      frontmatter: specFields,
      activation: summary.activation,
      requirements: summary.sidecar?.requirements ?? null,
      capabilities: summary.sidecar?.capabilities ?? null,
      files: pkg.files.filter((f) => !f.path.startsWith('evals/')).map((f) => f.path),
      evals: pkg.files.filter((f) => f.path.startsWith('evals/')).length,
      risks,
      ...(options.content ? { skillMd: skillText } : {}),
    });
    return EXIT.OK;
  }
  out.heading(`${id} ${pkg.version}`);
  out.line(safeText(summary.description ?? '(no description)'));
  out.line();
  out.line(`Source:      ${spec.source}${spec.ref ? ` (ref ${spec.ref})` : ''}`);
  if (versions) out.line(`Versions:    ${versions.join(', ')}`);
  if (pkg.resolved) out.line(`Commit:      ${pkg.resolved}`);
  out.line(`Integrity:   ${pkg.integrity}${pinned ? ' (pinned by this AgileFlow release)' : ''}`);
  out.line(`Activation:  ${summary.activation}`);
  for (const [k, v] of Object.entries(specFields)) out.line(`${`${k}:`.padEnd(13)}${safeText(typeof v === 'string' ? v : JSON.stringify(v))}`);
  const req = summary.sidecar?.requirements;
  if (req && (req.commands.length || req.network !== 'none')) {
    out.line(`Requires:    ${[...req.commands.map((c) => `${c} on PATH`), ...(req.network !== 'none' ? [`network (${req.network})`] : [])].join(', ')}`);
  }
  out.line(`Files:       ${pkg.files.filter((f) => !f.path.startsWith('evals/')).map((f) => f.path).join(', ')}`);
  const counts = riskCounts(risks);
  out.line(`Review:      ${counts.high} high, ${counts.medium} medium, ${counts.low} low findings`);
  for (const r of risks.filter((x) => x.severity !== 'low')) out.line(`  ${safeText(riskLine(r))}`);
  if (options.content) {
    out.line();
    out.line('--- SKILL.md ---');
    out.lines(skillText.split(/\r?\n/).map((l) => safeText(l)));
  }
  out.line();
  out.line(`Install: agileflow add ${target}`);
  return EXIT.OK;
}
