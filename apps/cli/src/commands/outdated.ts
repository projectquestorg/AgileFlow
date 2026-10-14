import semver from 'semver';
import {
  isExternalSource,
  loadWorkspace,
  parseSource,
  pickVersion,
  type LockEntry,
  type SkillSpec,
} from '@agileflow/core';
import type { RegistryClient } from '@agileflow/registry';
import type { Cli } from '../runtime';
import { EXIT, scopeFor, servicesFor } from '../runtime';
import { JSON_SCHEMA } from '../ui/output';
import { table } from '../ui/tables';

export interface OutdatedOptions {
  global?: boolean;
  json?: boolean;
}

export interface OutdatedRow {
  id: string;
  source: string;
  kind: 'registry' | 'git' | 'path' | 'local';
  /** Locked version (`local` for locally owned skills, null when not locked yet). */
  current: string | null;
  /** Range from agileflow.yaml (registry sources). */
  range: string | null;
  /** Newest version the range allows. */
  wanted: string | null;
  /** Newest version in the registry. */
  latest: string | null;
  /** `update` would change the lock (wanted differs from current). */
  updateAvailable: boolean;
  /** A newer version exists outside the configured range (edit the range to get it). */
  outsideRange: boolean;
  /** That newer version is a new major (breaking by semver) compared with what the range allows. */
  newMajor: boolean;
  /** An update would bring in third-party content (reviewed before it is applied). */
  thirdParty: boolean;
  /** Versions were read from the registry (or its cached catalog). */
  verified: boolean;
  /** Forks: the upstream they came from. */
  forkedFrom?: string;
  note?: string;
}

/** True when `latest` is a higher major than `base` (for 0.x, a higher minor: semver treats that as breaking). */
function isNewMajor(latest: string, base: string | null): boolean {
  const a = semver.parse(latest);
  const b = base ? semver.parse(base) : null;
  if (!a || !b) return true;
  if (a.major !== b.major) return a.major > b.major;
  return a.major === 0 && a.minor > b.minor;
}

function packageName(forkedFrom: string): { name: string; version: string | null } {
  const at = forkedFrom.lastIndexOf('@');
  return at > 0 ? { name: forkedFrom.slice(0, at), version: forkedFrom.slice(at + 1) } : { name: forkedFrom, version: null };
}

/**
 * `agileflow outdated`: per skill, the locked version, the newest version
 * the config range allows, and the newest published version. Read-only; the
 * registry catalog is cached, so it works offline from the last successful
 * lookup, and says so when versions could not be checked at all.
 */
export async function runOutdated(cli: Cli, options: OutdatedOptions): Promise<number> {
  const { out, ctx } = cli;
  const scope = await scopeFor(ctx, options);
  const services = await servicesFor(ctx, scope);
  const ws = await loadWorkspace(scope);
  const registry = (services.fetcher as { registry?: RegistryClient }).registry;
  const official = services.fetcher.officialRegistry !== false;
  const problems = new Set<string>();

  const versionsOf = async (name: string): Promise<{ versions: string[]; latest: string } | null | 'unreachable'> => {
    if (!registry) return 'unreachable';
    try {
      const doc = await registry.getSkill(name);
      if (doc) return { versions: Object.keys(doc.versions), latest: doc.latest };
      // A missing document means "not published" only when the catalog itself is readable.
      if (!(await registry.listSkills())) {
        problems.add(`the registry at ${registry.base} has no catalog (unreachable or not a registry)`);
        return 'unreachable';
      }
      return null;
    } catch (err) {
      problems.add((err as Error).message);
      return 'unreachable';
    }
  };

  const ids = [...new Set([...Object.keys(ws.specs), ...Object.keys(ws.lock.resolved)])].sort();
  out.progress(`Checking ${ids.length} skill(s)...`);
  const rows: OutdatedRow[] = [];
  for (const id of ids) {
    const spec: SkillSpec | undefined = ws.specs[id];
    const entry: LockEntry | undefined = ws.lock.resolved[id];
    const source = spec?.source ?? entry?.source ?? '';
    const base = {
      id,
      source,
      current: entry?.version ?? null,
      range: null,
      wanted: null,
      latest: null,
      updateAvailable: false,
      outsideRange: false,
      newMajor: false,
      thirdParty: false,
      verified: false,
    };
    let ref;
    try {
      ref = parseSource(source);
    } catch {
      rows.push({ ...base, kind: 'path', note: 'unrecognized source' });
      continue;
    }
    if (entry?.ownership === 'local') {
      const row: OutdatedRow = { ...base, kind: 'local', note: 'locally owned; never updated' };
      const forkedFrom = spec?.provenance?.forkedFrom;
      if (forkedFrom) {
        row.forkedFrom = forkedFrom;
        const origin = packageName(forkedFrom);
        const found = await versionsOf(origin.name);
        if (found && found !== 'unreachable') {
          row.latest = found.latest;
          row.verified = true;
          if (origin.version && semver.valid(origin.version) && semver.gt(found.latest, origin.version)) {
            row.note = `fork of ${forkedFrom}; upstream is now ${found.latest} (agileflow diff ${id} --upstream)`;
          } else row.note = `fork of ${forkedFrom}`;
        } else if (found === 'unreachable') {
          row.note = `fork of ${forkedFrom}; upstream not verified (registry unreachable)`;
        } else {
          row.verified = true;
          row.note = `fork of ${forkedFrom}; no longer in the registry`;
        }
      }
      rows.push(row);
      continue;
    }
    if (ref.kind === 'git') {
      rows.push({
        ...base,
        kind: 'git',
        current: entry?.resolved ? entry.resolved.slice(0, 12) : base.current,
        thirdParty: true,
        note: 'git source; `agileflow update --dry-run` checks the branch',
      });
      continue;
    }
    if (ref.kind === 'path') {
      rows.push({ ...base, kind: 'path', thirdParty: true, note: 'local path; `agileflow update` picks up edits' });
      continue;
    }
    const range = spec?.version ?? null;
    const found = await versionsOf(ref.name);
    const thirdParty = isExternalSource(source, official);
    if (found === 'unreachable') {
      rows.push({ ...base, kind: 'registry', range, thirdParty, note: 'not verified (registry unreachable and not cached)' });
      continue;
    }
    if (!found) {
      rows.push({ ...base, kind: 'registry', range, thirdParty, verified: true, note: 'no longer in the registry' });
      continue;
    }
    const wanted = pickVersion(found.versions, range);
    const current = entry?.version ?? null;
    const newer = (a: string | null, b: string | null) => !!a && (!b || !semver.valid(b) || semver.gt(a, b));
    rows.push({
      ...base,
      kind: 'registry',
      range,
      wanted,
      latest: found.latest,
      updateAvailable: !!wanted && wanted !== current,
      outsideRange: newer(found.latest, wanted),
      newMajor: newer(found.latest, wanted) && isNewMajor(found.latest, wanted ?? current),
      thirdParty,
      verified: true,
      ...(entry ? {} : { note: 'not installed yet (run `agileflow update`)' }),
    });
  }

  const verified = rows.every((r) => r.verified || r.kind === 'git' || r.kind === 'path' || (r.kind === 'local' && !r.forkedFrom));
  const warnings = [...problems];
  if (options.json) {
    out.json({ schema: JSON_SCHEMA, ok: true, command: 'outdated', scope: scope.kind, verified, skills: rows, warnings });
    return EXIT.OK;
  }
  if (!rows.length) {
    out.line('No skills installed in this scope.');
    return EXIT.OK;
  }
  const dash = (v: string | null) => v ?? '-';
  out.lines(
    table(
      ['SKILL', 'CURRENT', 'WANTED', 'LATEST', 'SOURCE', 'NOTE'],
      rows.map((r) => [
        r.id,
        dash(r.current),
        dash(r.wanted),
        dash(r.latest),
        `${r.source}${r.thirdParty ? ' (third-party)' : ''}`,
        [
          r.updateAvailable ? 'update available' : '',
          r.outsideRange ? (r.newMajor ? `new major ${r.latest} outside range` : `${r.latest} is outside range ${r.range ?? ''}`.trim()) : '',
          r.note ?? '',
        ]
          .filter(Boolean)
          .join('; '),
      ]),
    ),
  );
  out.line();
  if (!verified) {
    out.line('Some versions were not verified: the registry was unreachable and nothing was cached (offline).');
    for (const p of warnings) out.warn(p);
  }
  const updatable = rows.filter((r) => r.updateAvailable);
  if (updatable.length) {
    out.line(`Apply: agileflow update${scope.kind === 'global' ? ' -g' : ''} (review first with --dry-run)`);
    if (updatable.some((r) => r.thirdParty)) out.line('Third-party updates are shown for review and need approval (--yes when not interactive).');
  } else if (verified) {
    out.line('Everything is at the newest version its range allows.');
  }
  for (const r of rows.filter((x) => x.outsideRange && x.latest)) {
    const range = semver.parse(r.latest)!.major > 0 ? `^${r.latest}` : `~${r.latest}`;
    out.line(
      `${r.id}: ${r.latest} is not allowed by ${r.range ? `version: ${r.range}` : 'the configured range'}${r.newMajor ? ' (a new major version; read its changes first)' : ''}. To take it, set version: ${range} in agileflow.yaml, then agileflow update.`,
    );
  }
  return EXIT.OK;
}
