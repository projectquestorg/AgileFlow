import fs from 'node:fs';
import path from 'node:path';
import { InteractionPreferenceSchema, type Activation, type InteractionPreference, type SkillSpec } from './config';
import { isNotFound, listUnhashedEntries, readTree, removePath, renameWithRetry, toPosix, type TreeFile } from './fs';
import { executablePaths, hashTree, renderedHashOf } from './hash';
import { tracksExecBits } from './platform';
import { lockEntryFor, localLockEntry, syncWorkspace, type SyncReport } from './installer';
import { classifyEntry } from './links';
import { listUnmanagedSkills, snapshotSkill, type SkillSnapshot } from './ownership';
import { EVALS_DIR, packageActivation, renderSkill, stripManagedNotice } from './render';
import { skillDir, skillRelPath } from './scope';
import { MAX_NAME_LENGTH, parseSkillMarkdown, SKILL_FILE, SKILL_NAME_RE, validateSkillMarkdown } from './skill';
import { defaultRange } from './source';
import { commitSkillWrites, type SkillWrite } from './transaction';
import type { FetchedPackage } from './types';
import type { Services, Workspace } from './workspace';

/**
 * Adopting skills that already sit in a scope without AgileFlow: in
 * `.agents/skills` but not in the lockfile, or only in a provider directory
 * such as `.claude/skills`.
 *
 * Ownership is proven, never guessed from a name: a skill becomes *managed*
 * at a registry version only when its files are byte-identical (after
 * line-ending normalization) to what that version renders or ships.
 * Everything else is recorded as *locally owned*, so AgileFlow never
 * rewrites it; the closest upstream version is kept as provenance only.
 */

/** How an unmanaged skill relates to the registry package of the same id. */
export type AdoptMatch =
  /** Byte-identical (after normalization) to a published version. */
  | 'exact'
  /** Clearly derived from a published version, with local edits. */
  | 'modified'
  /** No published package, or nothing close enough to call it a copy. */
  | 'unknown';

/** A provider directory that holds skills (`.claude/skills`, a custom provider's `skillsDir`). */
export interface ProviderSkillDir {
  provider: string;
  /** Absolute directory. */
  dir: string;
  /** How it is shown, e.g. `.claude/skills`. */
  label: string;
  /**
   * The provider is enabled (or detected) in this scope, so `sync` links
   * adopted skills into this directory. Copies in other directories are never
   * moved or replaced: nothing would link them back.
   */
  linked: boolean;
}

/** Registry package to compare an id against (versions newest first). */
export interface UpstreamCandidate {
  source: string;
  versions: string[];
}

export interface AdoptCopy {
  provider: string;
  /** Absolute path of the copy. */
  path: string;
  /** Display path, e.g. `.claude/skills/foo`. */
  label: string;
  /** See `ProviderSkillDir.linked`. */
  linked: boolean;
  /** @internal content at planning time (re-checked before the copy is moved aside). */
  fingerprint?: string;
}

export interface AdoptCandidate {
  id: string;
  /** Where the copy being adopted lives. */
  location: 'canonical' | 'provider';
  /** Absolute path of that copy. */
  path: string;
  /** Display path of that copy. */
  label: string;
  /** Provider id when `location` is `provider`. */
  provider?: string;
  match: AdoptMatch;
  /** Registry package compared against, when there is one. */
  source?: string;
  /** Exact version (`exact`) or the closest published version (`modified`). */
  version?: string;
  /** Share of SKILL.md lines in common with `version` (0-1), for `modified`/`unknown`. */
  similarity?: number;
  /** False when the registry could not be consulted (offline, unreachable). */
  upstreamChecked: boolean;
  /** Recorded ownership after adoption. */
  ownership: 'managed' | 'local';
  activation: Activation;
  /** Move the copy from the provider directory into `.agents/skills` (a link replaces it). */
  move: boolean;
  /** Rewrite the files to AgileFlow's rendered form (managed notice); content stays the published version. */
  rewrite: boolean;
  /** Identical provider copies that will be replaced by links (after a backup). */
  replaceCopies: AdoptCopy[];
  /** Different provider copies, left untouched (the provider keeps using its own copy). */
  otherCopies: AdoptCopy[];
  /** Identical copies in providers that get no link (disabled or not detected), left untouched. */
  keptCopies: AdoptCopy[];
  /** Why this skill cannot be adopted automatically. */
  blocked?: string;
  notes: string[];
  /** @internal content fingerprint at planning time (re-checked before writing). */
  fingerprint: string;
  /** @internal what was at `.agents/skills/<id>` at planning time (the write only replaces exactly that). */
  snapshot: SkillSnapshot;
  /** @internal files of the copy being adopted. */
  files: TreeFile[];
  /** @internal package and render for managed adoption. */
  pkg?: FetchedPackage;
  rendered?: TreeFile[];
}

export interface AdoptPlanOptions {
  /** Provider skill directories to look in (besides `.agents/skills`). */
  providerDirs?: ProviderSkillDir[];
  /** Only these ids (default: every unmanaged skill found). */
  ids?: string[];
  /** Registry package for an id, or null when there is none. Throws when the registry is unreachable. */
  upstream?: (id: string) => Promise<UpstreamCandidate | null>;
  /** Published versions compared per skill, newest first (default 10). */
  maxVersions?: number;
}

export interface AdoptPlan {
  candidates: AdoptCandidate[];
  /** Ids asked for that are not unmanaged skills in this scope. */
  notFound: string[];
}

/** Multiset line overlap of two texts (trimmed, non-empty lines), 0-1. */
export function lineSimilarity(a: string, b: string): number {
  const lines = (t: string) => t.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const x = lines(a);
  const y = lines(b);
  if (!x.length && !y.length) return 1;
  const counts = new Map<string, number>();
  for (const l of y) counts.set(l, (counts.get(l) ?? 0) + 1);
  let common = 0;
  for (const l of x) {
    const n = counts.get(l) ?? 0;
    if (n > 0) {
      common++;
      counts.set(l, n - 1);
    }
  }
  return common / Math.max(x.length, y.length);
}

/** Below this SKILL.md overlap a same-named package is unrelated, not an edited copy. */
export const MODIFIED_SIMILARITY = 0.5;

/** One way a published version can appear on disk. */
interface Variant {
  files: TreeFile[];
  activation: Activation;
  /** Exactly what AgileFlow writes for a managed skill in this workspace today. */
  current: boolean;
}

/**
 * Every form a published package takes when copied into a project: AgileFlow's
 * managed render (each activation and question preference), the render
 * without the managed notice (what `remove --all --keep-skills` leaves), and
 * the package as published (what other installers copy), with and without
 * `evals/`.
 */
export function upstreamVariants(services: Services, ws: Workspace, id: string, pkg: FetchedPackage): Variant[] {
  const out: Variant[] = [];
  const own = packageActivation(pkg.files);
  const render = (managed: boolean, activation: Activation, interactionPreference: InteractionPreference) => {
    try {
      return renderSkill(pkg.files, { id, managed, activation, interactionPreference, adapters: services.adapters });
    } catch {
      return null;
    }
  };
  for (const activation of ['auto', 'manual'] as const) {
    for (const preference of InteractionPreferenceSchema.options) {
      for (const managed of [true, false]) {
        const files = render(managed, activation, preference);
        if (files) out.push({ files, activation, current: managed && preference === ws.questionPreference });
      }
    }
  }
  out.push({ files: pkg.files.filter((f) => !f.path.startsWith(`${EVALS_DIR}/`)), activation: own, current: false });
  out.push({ files: pkg.files, activation: own, current: false });
  return out;
}

export interface UpstreamMatch {
  match: AdoptMatch;
  version?: string;
  similarity?: number;
  pkg?: FetchedPackage;
  activation?: Activation;
  /** The exact match is AgileFlow's current managed render (nothing to rewrite). */
  current?: boolean;
}

/**
 * Compare installed files with published packages (newest first). Exact
 * means identical after line-ending normalization to one of the package's
 * forms (see `upstreamVariants`); otherwise the most similar version is
 * reported when its SKILL.md shares at least `MODIFIED_SIMILARITY` of lines.
 */
export function matchUpstream(
  files: TreeFile[],
  packages: FetchedPackage[],
  variantsOf: (pkg: FetchedPackage) => Variant[],
  options: { execBits?: boolean } = {},
): UpstreamMatch {
  const same = (v: Variant) => sameContent(v.files, files, options.execBits);
  for (const pkg of packages) {
    const variants = variantsOf(pkg);
    // Prefer AgileFlow's current render, then any other form of the same version.
    const hit = variants.find((v) => v.current && same(v)) ?? variants.find(same);
    if (hit) return { match: 'exact', version: pkg.version, pkg, activation: hit.activation, current: hit.current };
  }
  const text = stripManagedNotice(files.find((f) => f.path === SKILL_FILE)?.content.toString('utf8') ?? '');
  let best: { version: string; similarity: number; pkg: FetchedPackage } | null = null;
  for (const pkg of packages) {
    const upstream = pkg.files.find((f) => f.path === SKILL_FILE)?.content.toString('utf8') ?? '';
    const similarity = lineSimilarity(text, upstream);
    if (!best || similarity > best.similarity) best = { version: pkg.version, similarity, pkg };
  }
  if (best && best.similarity >= MODIFIED_SIMILARITY) {
    return { match: 'modified', version: best.version, similarity: round(best.similarity), pkg: best.pkg };
  }
  return { match: 'unknown', ...(best ? { similarity: round(best.similarity) } : {}) };
}

/**
 * Same content after line-ending normalization; with `execBits` (where the
 * filesystem keeps them, see `tracksExecBits`) the executable files must
 * match too, so a script that gained or lost `+x` is not "identical".
 */
export function sameContent(a: TreeFile[], b: TreeFile[], execBits = false): boolean {
  if (renderedHashOf(a) !== renderedHashOf(b)) return false;
  if (!execBits) return true;
  const x = executablePaths(a);
  const y = executablePaths(b);
  return x.length === y.length && x.every((p, i) => p === y[i]);
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

async function readCopy(dir: string): Promise<{ files: TreeFile[]; unhashed: string[] } | null> {
  try {
    return { files: await readTree(dir), unhashed: await listUnhashedEntries(dir) };
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

function fingerprint(files: TreeFile[]): string {
  return hashTree(files);
}

function displayPath(ws: Workspace, abs: string, homeDir: string): string {
  const fromRoot = path.relative(ws.scope.root, abs);
  if (fromRoot && !fromRoot.startsWith('..') && !path.isAbsolute(fromRoot)) {
    return ws.scope.kind === 'global' ? `~/${toPosix(fromRoot)}` : toPosix(fromRoot);
  }
  const fromHome = path.relative(homeDir, abs);
  if (fromHome && !fromHome.startsWith('..') && !path.isAbsolute(fromHome)) return `~/${toPosix(fromHome)}`;
  return abs;
}

/** Real skill directories in a provider directory that are neither AgileFlow links nor mirrors. */
async function providerCopies(ws: Workspace, dirs: ProviderSkillDir[], platform: NodeJS.Platform): Promise<Map<string, AdoptCopy[]>> {
  const found = new Map<string, AdoptCopy[]>();
  const canonical = path.resolve(ws.scope.skillsDir);
  for (const d of dirs) {
    if (path.resolve(d.dir) === canonical) continue;
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(d.dir, { withFileTypes: true });
    } catch (err) {
      if (isNotFound(err) || (err as NodeJS.ErrnoException).code === 'ENOTDIR') continue;
      throw err;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || ws.lock.resolved[entry.name]) continue;
      const entryPath = path.join(d.dir, entry.name);
      const state = await classifyEntry(entryPath, skillDir(ws.scope, entry.name), { platform });
      if (state.state !== 'user-dir') continue;
      try {
        await fs.promises.access(path.join(entryPath, SKILL_FILE));
      } catch {
        continue;
      }
      const list = found.get(entry.name) ?? [];
      list.push({ provider: d.provider, path: entryPath, label: `${d.label}/${entry.name}`, linked: d.linked });
      found.set(entry.name, list);
    }
  }
  return found;
}

/**
 * Find unmanaged skills in the scope and decide, for each, how it would be
 * adopted. Reads only; nothing is written.
 */
export async function planAdoption(services: Services, ws: Workspace, options: AdoptPlanOptions = {}): Promise<AdoptPlan> {
  const platform = services.ctx.platform;
  const canonicalIds = new Set(await listUnmanagedSkills(ws.scope, Object.keys(ws.lock.resolved)));
  const copies = await providerCopies(ws, options.providerDirs ?? [], platform);
  let ids = [...new Set([...canonicalIds, ...copies.keys()])].sort();
  const notFound: string[] = [];
  if (options.ids?.length) {
    for (const id of options.ids) if (!ids.includes(id)) notFound.push(id);
    ids = ids.filter((id) => options.ids!.includes(id));
  }
  const execBits = await tracksExecBits(ws.scope.root, platform);
  const candidates: AdoptCandidate[] = [];
  for (const id of ids) {
    candidates.push(await planOne(services, ws, id, canonicalIds.has(id), copies.get(id) ?? [], { ...options, execBits }));
  }
  return { candidates, notFound };
}

async function planOne(
  services: Services,
  ws: Workspace,
  id: string,
  inCanonical: boolean,
  providerList: AdoptCopy[],
  options: AdoptPlanOptions & { execBits: boolean },
): Promise<AdoptCandidate> {
  const notes: string[] = [];
  const canonicalPath = skillDir(ws.scope, id);
  // Only a copy that `sync` will link back may be moved out of its provider directory.
  const movable = providerList.find((c) => c.linked) ?? providerList[0]!;
  const source: AdoptCopy = inCanonical
    ? { provider: '', path: canonicalPath, label: displayPath(ws, canonicalPath, services.ctx.homeDir), linked: true }
    : movable;
  const others = inCanonical ? providerList : providerList.filter((c) => c !== movable);
  const copy = (await readCopy(source.path)) ?? { files: [], unhashed: [] };
  const candidate: AdoptCandidate = {
    id,
    location: inCanonical ? 'canonical' : 'provider',
    path: source.path,
    label: source.label,
    ...(inCanonical ? {} : { provider: source.provider }),
    match: 'unknown',
    upstreamChecked: false,
    ownership: 'local',
    activation: 'auto',
    move: !inCanonical,
    rewrite: false,
    replaceCopies: [],
    otherCopies: [],
    keptCopies: [],
    notes,
    fingerprint: fingerprint(copy.files),
    snapshot: await snapshotSkill(ws.scope, id),
    files: copy.files,
  };
  const block = (reason: string): AdoptCandidate => ({ ...candidate, blocked: reason });

  if (!SKILL_NAME_RE.test(id) || id.length > MAX_NAME_LENGTH) {
    return block('the directory name is not a valid skill name (lowercase letters, digits, single hyphens)');
  }
  const skillText = copy.files.find((f) => f.path === SKILL_FILE)?.content.toString('utf8');
  if (skillText === undefined) return block(`${SKILL_FILE} could not be read`);
  const issues = validateSkillMarkdown(skillText, id);
  const fatal = issues.filter((i) => i.level === 'error' && !/does not match its directory/.test(i.message));
  if (fatal.length) return block(`${SKILL_FILE} is invalid: ${fatal.map((i) => i.message).join('; ')}`);
  for (const i of issues.filter((x) => !fatal.includes(x))) notes.push(i.message);
  if (!inCanonical && (await pathExistsLstat(canonicalPath))) {
    return block(`${displayPath(ws, canonicalPath, services.ctx.homeDir)} already exists; move one of the copies aside first`);
  }
  if (!inCanonical && !source.linked) {
    return block(
      `${source.provider} is disabled or not detected here, so AgileFlow would not link ${source.label} back after moving it; enable it (agileflow configure provider ${source.provider} on) or move the skill into .agents/skills yourself`,
    );
  }

  // Other copies of the same id in provider directories.
  for (const other of others) {
    const read = await readCopy(other.path);
    const identical = !!read && !read.unhashed.length && sameContent(read.files, copy.files, options.execBits);
    if (identical && other.linked) candidate.replaceCopies.push({ ...other, fingerprint: fingerprint(read!.files) });
    else if (identical) {
      candidate.keptCopies.push(other);
      notes.push(`${other.label} is identical but left in place: ${other.provider} is disabled or not detected, so it would get no link`);
    } else candidate.otherCopies.push(other);
  }
  if (!inCanonical && candidate.otherCopies.length) {
    return block(`different copies exist in ${[source, ...candidate.otherCopies].map((c) => c.label).join(' and ')}; keep one and move it into .agents/skills yourself`);
  }
  if (copy.unhashed.length) {
    if (!inCanonical) {
      return block(`contains entries AgileFlow does not copy (${copy.unhashed.join(', ')}); move it into .agents/skills yourself`);
    }
    notes.push(`contains entries AgileFlow does not track (${copy.unhashed.join(', ')}); recorded as locally owned`);
  }
  const symlinked = inCanonical && (await fs.promises.lstat(canonicalPath)).isSymbolicLink();
  if (symlinked) notes.push('is a symbolic link; recorded as locally owned (AgileFlow never replaces it)');

  // Compare with the registry package of the same id.
  let upstream: UpstreamCandidate | null = null;
  if (options.upstream) {
    try {
      upstream = await options.upstream(id);
      candidate.upstreamChecked = true;
    } catch (err) {
      notes.push(`not compared with the registry (${(err as Error).message})`);
    }
  }
  if (upstream) {
    candidate.source = upstream.source;
    const packages: FetchedPackage[] = [];
    for (const version of upstream.versions.slice(0, options.maxVersions ?? 10)) {
      try {
        packages.push(await services.fetcher.resolve(id, { source: upstream.source, version }, ws.scope.root));
      } catch (err) {
        notes.push(`could not load ${upstream.source}@${version} (${(err as Error).message})`);
        candidate.upstreamChecked = false;
      }
    }
    const result = matchUpstream(copy.files, packages, (pkg) => upstreamVariants(services, ws, id, pkg), { execBits: options.execBits });
    candidate.match = result.match;
    if (result.version) candidate.version = result.version;
    if (result.similarity !== undefined) candidate.similarity = result.similarity;
    if (result.match === 'exact' && result.pkg && !copy.unhashed.length && !symlinked) {
      const activation = result.activation ?? packageActivation(result.pkg.files);
      const rendered = renderSkill(result.pkg.files, {
        id,
        managed: true,
        activation,
        interactionPreference: ws.questionPreference,
        adapters: services.adapters,
      });
      candidate.ownership = 'managed';
      candidate.activation = activation;
      candidate.pkg = result.pkg;
      candidate.rendered = rendered;
      // Same content either way; only rewrite when the bytes on disk are not already the managed render.
      candidate.rewrite = !candidate.move && hashTree(rendered) !== hashTree(copy.files);
      return candidate;
    }
  }
  const declared = parseActivation(skillText);
  candidate.activation = declared;
  return candidate;
}

function parseActivation(skillText: string): Activation {
  try {
    const fm = parseSkillMarkdown(skillText).frontmatter;
    return fm['disable-model-invocation'] === true ? 'manual' : 'auto';
  } catch {
    return 'auto';
  }
}

async function pathExistsLstat(p: string): Promise<boolean> {
  try {
    await fs.promises.lstat(p);
    return true;
  } catch (err) {
    if (isNotFound(err)) return false;
    throw err;
  }
}

/** The agileflow.yaml entry adoption writes for a candidate. */
export function adoptSpec(candidate: AdoptCandidate): SkillSpec {
  if (candidate.ownership === 'managed' && candidate.pkg && candidate.source) {
    return {
      source: candidate.source,
      version: defaultRange(candidate.pkg.version),
      ...(candidate.activation !== packageActivation(candidate.pkg.files) ? { activation: candidate.activation } : {}),
    };
  }
  return {
    source: skillRelPath(candidate.id),
    ...(candidate.activation === 'manual' ? { activation: 'manual' as const } : {}),
    ...(candidate.match === 'modified' && candidate.source && candidate.version
      ? { provenance: { forkedFrom: `${candidate.source}@${candidate.version}` } }
      : {}),
  };
}

export interface AdoptOutcome {
  id: string;
  ownership: 'managed' | 'local';
  source: string;
  version: string;
  /** Provider copy moved into `.agents/skills` (display path). */
  movedFrom?: string;
  /** Provider copies replaced by links (display paths). */
  replacedCopies: string[];
  rewritten: boolean;
}

export interface AdoptResult {
  adopted: AdoptOutcome[];
  failed: Array<{ id: string; error: string }>;
  /** Where moved or rewritten directories were saved, or null when nothing needed a backup. */
  backupDir: string | null;
  /** Provider exposure after adoption (links for moved skills). */
  sync: SyncReport | null;
}

/** Backup path for a display path, without dot-directories a provider could scan (`.claude/skills/x` -> `claude/skills/x`). */
function backupRel(label: string): string {
  return label
    .replace(/^~\//, 'home/')
    .split('/')
    .map((segment) => segment.replace(/^\.+/, '') || '_')
    .join('/');
}

function backupPath(backupDir: string, label: string): string {
  return path.join(backupDir, ...backupRel(label).split('/'));
}

async function copyInto(src: string, dest: string): Promise<void> {
  await fs.promises.mkdir(path.dirname(dest), { recursive: true });
  await fs.promises.cp(src, dest, { recursive: true, verbatimSymlinks: true, errorOnExist: true, force: false });
}

/**
 * Move a directory into the backup in one step (rename), so it is either
 * fully in place or fully in the backup. Across filesystems (EXDEV) it is
 * copied, then removed; if the removal fails part-way the copy is put back.
 */
async function moveAside(src: string, dest: string): Promise<void> {
  await fs.promises.mkdir(path.dirname(dest), { recursive: true });
  try {
    await renameWithRetry(src, dest);
    return;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EXDEV') throw err;
  }
  await copyInto(src, dest);
  try {
    await removePath(src);
  } catch (err) {
    await fs.promises.cp(dest, src, { recursive: true, verbatimSymlinks: true, force: true }).catch(() => undefined);
    await removePath(dest).catch(() => undefined);
    throw err;
  }
}

/** Put a directory moved aside by `moveAside` back where it was. */
async function restoreFrom(dest: string, src: string): Promise<void> {
  try {
    await renameWithRetry(dest, src);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EXDEV') throw err;
    await fs.promises.cp(dest, src, { recursive: true, verbatimSymlinks: true, errorOnExist: true, force: false });
  }
}

/**
 * Adopt the planned candidates (blocked ones are skipped).
 *
 * Order, so no copy is ever lost:
 * 1. re-check that nothing changed since planning; copy a directory that
 *    will be rewritten into the backup;
 * 2. write canonical copies and record config and lock in one journaled
 *    batch (a directory changed since review is left alone);
 * 3. move each provider copy being replaced into the backup (one rename;
 *    left in place if it changed or cannot be moved);
 * 4. `sync` creates the provider links; a provider path that did not get
 *    one is restored from the backup.
 */
export async function applyAdoption(
  services: Services,
  ws: Workspace,
  candidates: AdoptCandidate[],
  options: { backupDir: string },
): Promise<AdoptResult> {
  const result: AdoptResult = { adopted: [], failed: [], backupDir: null, sync: null };
  const writes: SkillWrite[] = [];
  const pending: AdoptCandidate[] = [];
  for (const c of candidates) {
    if (c.blocked) continue;
    try {
      if (ws.lock.resolved[c.id] || ws.specs[c.id]) throw new Error(`${c.id} is already in agileflow.yaml or agileflow.lock`);
      const now = await readCopy(c.path);
      if (!now || fingerprint(now.files) !== c.fingerprint) throw new Error(`${c.label} changed since it was reviewed; run the command again`);
      const canonical = skillDir(ws.scope, c.id);
      if (c.move && (await pathExistsLstat(canonical))) throw new Error(`${displayPath(ws, canonical, services.ctx.homeDir)} appeared since it was reviewed`);
      if (c.rewrite) {
        await copyInto(c.path, backupPath(options.backupDir, c.label));
        result.backupDir = options.backupDir;
      }
      const spec = adoptSpec(c);
      // Writes replace only exactly what was reviewed (`expect`): an absent
      // directory for moves, the reviewed copy for re-renders.
      if (c.ownership === 'managed' && c.pkg && c.rendered) {
        writes.push({
          id: c.id,
          ...(c.rewrite || c.move ? { files: c.rendered, expect: c.snapshot } : {}),
          next: lockEntryFor(c.id, c.pkg, c.rendered, c.activation, spec, ws.questionPreference),
          spec,
        });
      } else {
        // Locally owned content is copied as is; AgileFlow never renders it.
        writes.push({ id: c.id, ...(c.move ? { files: c.files, expect: c.snapshot } : {}), next: localLockEntry(c.id, spec, c.activation), spec });
      }
      pending.push(c);
    } catch (err) {
      result.failed.push({ id: c.id, error: (err as Error).message });
    }
  }
  if (!writes.length) return result;
  const commit = await commitSkillWrites(services, ws, writes);

  const movedAside: Array<{ id: string; copy: AdoptCopy; saved: string }> = [];
  for (const c of pending) {
    if (commit.skipped.includes(c.id)) {
      result.failed.push({ id: c.id, error: `${c.label} changed since it was reviewed; nothing was changed for it` });
      continue;
    }
    const outcome: AdoptOutcome = {
      id: c.id,
      ownership: c.ownership,
      source: ws.specs[c.id]?.source ?? skillRelPath(c.id),
      version: ws.lock.resolved[c.id]?.version ?? 'local',
      replacedCopies: [],
      rewritten: c.rewrite,
    };
    const aside = [
      ...(c.move ? [{ provider: c.provider ?? '', path: c.path, label: c.label, linked: true, fingerprint: c.fingerprint }] : []),
      ...c.replaceCopies,
    ];
    for (const copy of aside) {
      try {
        const now = await readCopy(copy.path);
        if (copy.fingerprint && (!now || fingerprint(now.files) !== copy.fingerprint)) {
          throw new Error('it changed since it was reviewed');
        }
        const saved = backupPath(options.backupDir, copy.label);
        await moveAside(copy.path, saved);
        result.backupDir = options.backupDir;
        movedAside.push({ id: c.id, copy, saved });
        if (copy.path === c.path) outcome.movedFrom = c.label;
        else outcome.replacedCopies.push(copy.label);
      } catch (err) {
        result.failed.push({ id: c.id, error: `adopted, but ${copy.label} was left in place (${(err as Error).message}); that provider keeps using its own copy` });
      }
    }
    result.adopted.push(outcome);
  }
  result.sync = await syncWorkspace(services, ws, { mismatch: 'report' });

  // Every provider path emptied above must now show the canonical skill.
  for (const m of movedAside) {
    const state = await classifyEntry(m.copy.path, skillDir(ws.scope, m.id), { platform: services.ctx.platform }).catch(() => null);
    if (state && ['linked', 'mirror', 'same-as-canonical'].includes(state.state)) continue;
    try {
      if (state?.state === 'missing') await restoreFrom(m.saved, m.copy.path);
      result.failed.push({ id: m.id, error: `no provider link was created at ${m.copy.label}; ${state?.state === 'missing' ? 'restored the original copy there' : `a copy is in ${m.saved}`}` });
    } catch (err) {
      result.failed.push({ id: m.id, error: `no provider link was created at ${m.copy.label}, and restoring it failed (${(err as Error).message}); the original is in ${m.saved}` });
    }
  }
  return result;
}
