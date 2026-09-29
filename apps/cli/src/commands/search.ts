import type { Cli } from '../runtime';
import { EXIT, findProject, servicesFor, UsageError } from '../runtime';
import { globalScope, packMembers, projectScope, SKILL_NAME_RE, type Services } from '@agileflow/core';
import type { RegistryClient } from '@agileflow/registry';
import { table } from '../ui/tables';

export interface SearchOptions {
  source?: string;
  limit?: string;
  json?: boolean;
}

export interface SearchResult {
  name: string;
  description: string;
  /** Where it comes from: `official` catalog or `skills.sh`. */
  from: 'official' | 'skills.sh';
  /** GitHub repository for skills.sh results. */
  repository?: string;
  version?: string;
  installs?: number;
  /** Exact argument for `agileflow add`. */
  add: string;
  /** False when the skill name cannot be used as an Agent Skills directory name. */
  installable: boolean;
  /** Official results: how the latest version activates (`manual` only when invoked by name). */
  activation?: 'auto' | 'manual';
  /** Official results: what the latest version needs (commands on PATH, network). */
  requirements?: { commands: string[]; network: 'none' | 'optional' | 'required' };
  /** Official results: packs that include this skill (e.g. `core`). */
  packs?: string[];
}

/** Public skills.sh search endpoint (the one the `skills` CLI uses); overridable for mirrors and tests. */
export const SKILLS_SH_URL = 'https://skills.sh';

function score(query: string, name: string, description: string): number {
  const q = query.toLowerCase();
  const n = name.toLowerCase();
  const d = description.toLowerCase();
  let s = 0;
  if (n === q) s += 100;
  if (n.includes(q)) s += 40;
  for (const word of q.split(/\s+/).filter(Boolean)) {
    if (n.includes(word)) s += 10;
    if (d.includes(word)) s += 3;
  }
  return s;
}

/** Package name -> short names of the packs that list it. Empty when packs cannot be read. */
async function packIndex(registry: RegistryClient): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  try {
    const index = await registry.listPacks();
    for (const entry of index?.packs ?? []) {
      const pack = await registry.getPack(entry.name).catch(() => null);
      if (!pack) continue;
      const short = entry.name.split('/').pop()!;
      for (const m of packMembers(pack)) out.set(m.source, [...(out.get(m.source) ?? []), short]);
    }
  } catch {
    // Pack membership is a hint; search works without it.
  }
  return out;
}

/** Activation, requirements, and packs for official results (from the cached catalog documents). */
async function addDetails(services: Services, results: SearchResult[], names: Map<SearchResult, string>): Promise<void> {
  const registry = (services.fetcher as { registry?: RegistryClient }).registry;
  if (!registry || !results.length) return;
  const packs = await packIndex(registry);
  await Promise.all(
    results.map(async (r) => {
      const name = names.get(r)!;
      const inPacks = packs.get(name);
      if (inPacks?.length) r.packs = inPacks.sort();
      try {
        const doc = await registry.getSkill(name);
        const meta = doc?.versions[doc.latest]?.metadata;
        if (!meta) return;
        r.activation = meta.activation;
        r.requirements = { commands: meta.requirements.commands, network: meta.requirements.network };
      } catch {
        // Details are optional; the index entry is enough to list the skill.
      }
    }),
  );
}

async function searchOfficial(cli: Cli, query: string, limit: number): Promise<SearchResult[]> {
  const root = await findProject(cli.ctx);
  const services = await servicesFor(cli.ctx, root ? projectScope(root) : globalScope(cli.ctx));
  const skills = await services.fetcher.listSkills();
  const names = new Map<SearchResult, string>();
  const results = skills
    .map((s) => ({ s, rank: score(query, s.name.split('/')[1]!, s.description) }))
    .filter((r) => r.rank > 0)
    .sort((a, b) => b.rank - a.rank || (a.s.name < b.s.name ? -1 : 1))
    .slice(0, limit)
    .map(({ s }) => {
      const id = s.name.split('/')[1]!;
      const result: SearchResult = {
        name: id,
        description: s.description,
        from: 'official' as const,
        version: s.latest,
        add: s.name.startsWith('@agileflow/') ? id : s.name,
        installable: true,
      };
      names.set(result, s.name);
      return result;
    });
  await addDetails(services, results, names);
  return results;
}

/** `manual, needs gh + network, pack core` */
function details(r: SearchResult): string {
  if (r.from !== 'official') return '-';
  const needs = [
    ...(r.requirements?.commands ?? []),
    ...(r.requirements?.network === 'required' ? ['network'] : r.requirements?.network === 'optional' ? ['network (optional)'] : []),
  ];
  return [
    r.activation ?? '',
    needs.length ? `needs ${needs.join(' + ')}` : '',
    r.packs?.length ? `pack ${r.packs.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('; ') || '-';
}

interface SkillsShResponse {
  skills?: Array<{ source?: string; skillId?: string; name?: string; installs?: number; description?: string }>;
}

async function searchSkillsSh(cli: Cli, query: string, limit: number): Promise<SearchResult[]> {
  const env = cli.ctx.env;
  if (env.AGILEFLOW_OFFLINE === '1' || env.AGILEFLOW_OFFLINE === 'true') {
    throw new UsageError('skills.sh search needs the network (AGILEFLOW_OFFLINE is set)', ['Use --source official to search the cached catalog.']);
  }
  const base = (env.AGILEFLOW_SKILLS_SH_URL || SKILLS_SH_URL).replace(/\/+$/, '');
  const url = `${base}/api/search?q=${encodeURIComponent(query)}&limit=${limit}`;
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(10_000), headers: { accept: 'application/json' } });
  } catch (err) {
    throw new UsageError(`Could not reach skills.sh (${url}): ${(err as Error).message}`);
  }
  if (!res.ok) throw new UsageError(`skills.sh search failed (${res.status})`);
  let body: SkillsShResponse;
  try {
    body = (await res.json()) as SkillsShResponse;
  } catch {
    throw new UsageError('skills.sh returned an unreadable response');
  }
  const out: SearchResult[] = [];
  for (const s of body.skills ?? []) {
    const repo = typeof s.source === 'string' ? s.source : '';
    const id = typeof s.skillId === 'string' ? s.skillId : typeof s.name === 'string' ? s.name : '';
    if (!/^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9._-]+$/.test(repo) || !id) continue;
    const installable = SKILL_NAME_RE.test(id) && id.length <= 64;
    out.push({
      name: id,
      description: typeof s.description === 'string' ? s.description : '',
      from: 'skills.sh',
      repository: repo,
      ...(typeof s.installs === 'number' ? { installs: s.installs } : {}),
      add: installable ? `${repo}/${id}` : `${repo} --skill ${id}`,
      installable,
    });
  }
  return out;
}

/**
 * `agileflow search <query>`: the official catalog (works offline from the
 * cached index) and the public skills.sh directory of GitHub-hosted skills.
 */
export async function runSearch(cli: Cli, words: string[], options: SearchOptions): Promise<number> {
  const query = words.join(' ').trim();
  if (query.length < 2) throw new UsageError('Search for at least 2 characters, e.g. `agileflow search pdf`');
  const source = options.source ?? 'all';
  if (!['all', 'official', 'skills.sh'].includes(source)) throw new UsageError('--source must be all, official, or skills.sh');
  const limit = options.limit === undefined ? 20 : Number(options.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new UsageError('--limit must be a whole number from 1 to 200');

  const results: SearchResult[] = [];
  const problems: string[] = [];
  if (source !== 'skills.sh') {
    try {
      results.push(...(await searchOfficial(cli, query, limit)));
    } catch (err) {
      if (source === 'official') throw err;
      problems.push(`official catalog: ${(err as Error).message}`);
    }
  }
  if (source !== 'official') {
    try {
      results.push(...(await searchSkillsSh(cli, query, limit)));
    } catch (err) {
      if (source === 'skills.sh') throw err;
      problems.push(`skills.sh: ${(err as Error).message}`);
    }
  }
  for (const p of problems) cli.out.warn(`search skipped ${p}`);

  if (options.json) {
    cli.out.json({ ok: true, query, results, warnings: problems });
    return EXIT.OK;
  }
  if (!results.length) {
    cli.out.line(`No skills match "${query}".`);
    return EXIT.OK;
  }
  const rows = results.map((r) => [
    r.name,
    r.from === 'official' ? `official ${r.version}` : `${r.repository}${r.installs !== undefined ? ` (${r.installs} installs)` : ''}`,
    details(r),
    r.description.length > 60 ? `${r.description.slice(0, 57)}...` : r.description,
  ]);
  cli.out.lines(table(['NAME', 'SOURCE', 'USE', 'DESCRIPTION'], rows));
  cli.out.line();
  cli.out.line('Preview: agileflow info <name or owner/repo/skill>');
  cli.out.line('Install: agileflow add <name or owner/repo/skill>');
  if (results.some((r) => r.from === 'skills.sh')) {
    cli.out.line('skills.sh results are third-party GitHub content: review them before installing (add shows a risk scan).');
  }
  return EXIT.OK;
}
