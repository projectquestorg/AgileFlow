import path from 'node:path';
import {
  classifyEntry,
  hashTree,
  MIRROR_MARKER,
  readTree,
  type Diagnostic,
  type PlannedChange,
  type ProviderAdapter,
  type ProviderContext,
  type ProviderDetection,
  type ProviderId,
  type ResolvedSkill,
  type SupportLevel,
  type TreeFile,
} from '@agileflow/core';
import { getSkillFrontmatter, setSkillFrontmatter } from './util';
import { readSkillText } from './standard-agent-skills';
import { cachedVersion, versionDiagnostics, type MinimumVersion } from './versions';

/**
 * Adapter for providers that read their own skill directory instead of
 * `.agents/skills` (Claude Code, and custom providers declared in config).
 * Each canonical skill becomes visible there through a per-skill link
 * (symlink, junction on Windows, or a marked mirror as a last resort). The
 * adapter owns only the links/mirrors it created, found by the skill ids the
 * caller passes (from the lockfile); the directory and everything else in it
 * belong to the user.
 */
export interface LinkAdapterDefinition {
  id: ProviderId;
  displayName: string;
  support: SupportLevel;
  detect(pctx: ProviderContext): Promise<ProviderDetection>;
  /** Absolute directory the provider reads skills from in this scope; null when it has none there. */
  linkDir(pctx: ProviderContext): string | null;
  /** How that directory is shown (`.claude/skills`, `~/.claude/skills`). */
  linkLabel(pctx: ProviderContext): string;
  manualInvocation: 'hard' | 'semantic';
  /** SKILL.md frontmatter flag that makes a skill manual-only for this provider. */
  manualFlag?: { key: string[]; value: unknown };
  /** Problems with the adapter's own configuration; an error disables linking. */
  configProblems?(pctx: ProviderContext): Diagnostic[];
  /** Shown when `linkDir` is null for the scope. */
  noDirMessage?(pctx: ProviderContext): string;
  minimumVersion?: MinimumVersion;
}

function canonicalLabel(pctx: ProviderContext, id?: string): string {
  const base = pctx.scope.kind === 'project' ? '.agents/skills' : '~/.agents/skills';
  return id ? `${base}/${id}` : base;
}

export function createLinkAdapter(def: LinkAdapterDefinition): ProviderAdapter {
  const provider = def.id;
  const name = def.displayName;
  const label = (pctx: ProviderContext, id?: string) => (id ? `${def.linkLabel(pctx)}/${id}` : def.linkLabel(pctx));
  const classify = (pctx: ProviderContext, entryPath: string, canonical: string) =>
    classifyEntry(entryPath, canonical, { platform: pctx.ctx.platform });
  const usable = (pctx: ProviderContext): string | null =>
    def.configProblems?.(pctx).some((d) => d.level === 'error') ? null : def.linkDir(pctx);

  async function planExposure(pctx: ProviderContext, skills: ResolvedSkill[]): Promise<PlannedChange[]> {
    const dir = usable(pctx);
    if (!dir) return [];
    const changes: PlannedChange[] = [];
    for (const skill of skills) {
      const entryPath = path.join(dir, skill.id);
      const state = await classify(pctx, entryPath, skill.dir);
      const link: PlannedChange = { kind: 'link', provider, skillId: skill.id, path: entryPath, target: skill.dir };
      switch (state.state) {
        case 'missing':
        case 'dangling-ours':
          changes.push(link);
          break;
        case 'git-placeholder':
          // A committed link checked out as a text file (git core.symlinks=false).
          changes.push({ kind: 'remove', provider, skillId: skill.id, path: entryPath, reason: 'git symlink placeholder' }, link, {
            kind: 'warn',
            provider,
            skillId: skill.id,
            message: `${label(pctx, skill.id)} was a symlink that git checked out as a text file (core.symlinks=false); replaced it with a link. git may now show it as changed; enable symlinks (Windows Developer Mode and \`git config core.symlinks true\`) or keep these links out of git.`,
          });
          break;
        case 'mirror': {
          if (state.modified) {
            changes.push({
              kind: 'warn',
              provider,
              skillId: skill.id,
              message: `${label(pctx, skill.id)} is a generated mirror that was edited directly; not refreshed. Edit ${canonicalLabel(pctx, skill.id)} instead, then delete the mirror so AgileFlow regenerates it.`,
            });
            break;
          }
          const canonical = hashTree(await readTree(skill.dir, { exclude: (rel) => rel === MIRROR_MARKER }));
          if (canonical !== state.marker.hash) {
            changes.push({ kind: 'refresh-mirror', provider, skillId: skill.id, path: entryPath, target: skill.dir });
          }
          break;
        }
        case 'user-dir':
          changes.push({
            kind: 'warn',
            provider,
            skillId: skill.id,
            message: `${label(pctx, skill.id)} already exists and is not AgileFlow's; ${name} will use that one instead of ${canonicalLabel(pctx, skill.id)}`,
          });
          break;
        case 'file':
          changes.push({
            kind: 'warn',
            provider,
            skillId: skill.id,
            message: `${label(pctx, skill.id)} already exists as a file and is not AgileFlow's; ${name} cannot see ${canonicalLabel(pctx, skill.id)} until it is removed`,
          });
          break;
        case 'foreign-link':
          changes.push({
            kind: 'warn',
            provider,
            skillId: skill.id,
            message: `${label(pctx, skill.id)} links to ${state.target}, not the canonical skill; left unchanged`,
          });
          break;
        case 'linked':
        case 'same-as-canonical':
          break;
      }
    }
    return changes;
  }

  const adapter: ProviderAdapter = {
    id: def.id,
    displayName: def.displayName,
    support: def.support,
    detect: (pctx) => def.detect(pctx),

    async inspect(pctx) {
      const detection = await def.detect(pctx);
      return {
        skillLocations: [def.linkDir(pctx) ? label(pctx) : '(none in this scope)'],
        exposure: 'linked',
        manualInvocation: def.manualInvocation,
        version: pctx.verbose && detection.executable ? await cachedVersion(detection.executable, pctx.ctx.platform) : undefined,
      };
    },

    planProjectSkillExposure: planExposure,
    planUserSkillExposure: planExposure,

    async validate(pctx, skills) {
      const problems = def.configProblems?.(pctx) ?? [];
      if (problems.some((d) => d.level === 'error')) return problems;
      const out: Diagnostic[] = [...problems];
      const dir = def.linkDir(pctx);
      if (!dir) {
        if (!problems.length) out.push({ level: 'info', message: def.noDirMessage?.(pctx) ?? `${name}: nothing to link in this scope` });
        return out;
      }
      const missing: string[] = [];
      const modifiedMirrors: string[] = [];
      const staleMirrors: string[] = [];
      const conflicts: string[] = [];
      const linkTypes = new Map<string, number>();
      const count = (key: string) => linkTypes.set(key, (linkTypes.get(key) ?? 0) + 1);
      for (const skill of skills) {
        const state = await classify(pctx, path.join(dir, skill.id), skill.dir);
        if (state.state === 'missing' || state.state === 'dangling-ours' || state.state === 'git-placeholder') {
          missing.push(skill.id);
        } else if (state.state === 'mirror') {
          count('mirror');
          if (state.modified) modifiedMirrors.push(skill.id);
          else {
            const canonical = hashTree(await readTree(skill.dir, { exclude: (rel) => rel === MIRROR_MARKER }));
            if (canonical !== state.marker.hash) staleMirrors.push(skill.id);
          }
        } else if (state.state === 'linked') count(state.linkType);
        else if (state.state === 'same-as-canonical') count('directory link');
        else {
          const why =
            state.state === 'foreign-link'
              ? `links to ${state.target}`
              : state.state === 'file'
                ? 'a file with the same name'
                : `${name}-only skill with the same name`;
          conflicts.push(`${label(pctx, skill.id)}: ${why}`);
        }
      }
      if (missing.length) {
        out.push({
          level: 'error',
          message: `${name} compatibility links missing`,
          detail: [...missing.map((id) => label(pctx, id)), 'Run `agileflow sync` or `agileflow check --fix`.'],
        });
      }
      if (modifiedMirrors.length) {
        out.push({
          level: 'warn',
          message: `${name} mirrors were edited directly`,
          detail: modifiedMirrors.map((id) => `${label(pctx, id)} is generated; the canonical copy is ${canonicalLabel(pctx, id)}`),
        });
      }
      if (staleMirrors.length) {
        out.push({
          level: 'warn',
          message: `${name} mirrors are out of date`,
          detail: [...staleMirrors.map((id) => label(pctx, id)), 'Run `agileflow sync`.'],
        });
      }
      if (conflicts.length) out.push({ level: 'warn', message: `${name} skills shadow AgileFlow skills`, detail: conflicts });
      if (!missing.length && !modifiedMirrors.length && !staleMirrors.length && !conflicts.length) {
        out.push({ level: 'ok', message: skills.length ? `${name} compatibility links valid` : `${name} has no skills to link` });
      }
      if (linkTypes.size) {
        out.push({
          level: 'info',
          message: `${name} link types`,
          detail: [...linkTypes.entries()].map(([k, v]) => `${k}: ${v}`),
          verboseOnly: true,
        });
      }
      const manual = skills.filter((s) => s.activation === 'manual');
      if (manual.length && def.manualFlag) {
        const flag = def.manualFlag;
        const unflagged: string[] = [];
        for (const skill of manual) {
          const text = await readSkillText(skill);
          if (text && getSkillFrontmatter(text, flag.key) !== flag.value) unflagged.push(skill.id);
        }
        if (unflagged.length) {
          out.push({
            level: 'warn',
            message: `${name} may invoke manual skills automatically`,
            detail: [`${unflagged.join(', ')} lack \`${flag.key.join('.')}: ${String(flag.value)}\`.`],
          });
        }
      } else if (manual.length && def.manualInvocation === 'semantic') {
        out.push({
          level: 'info',
          message: `${name} manual-only enforcement: semantic`,
          detail: [`${manual.map((s) => s.id).join(', ')} rely on their descriptions to avoid automatic activation.`],
        });
      }
      out.push(...(await versionDiagnostics(pctx, name, () => def.detect(pctx), def.minimumVersion)));
      return out;
    },

    async removeManagedArtifacts(pctx, skillIds) {
      // Ownership is explicit: only skills the caller names (from the lockfile)
      // are considered. Never scan the directory and guess.
      const dir = usable(pctx);
      if (!dir) return [];
      const changes: PlannedChange[] = [];
      for (const id of skillIds ?? []) {
        const entryPath = path.join(dir, id);
        const state = await classify(pctx, entryPath, path.join(pctx.scope.skillsDir, id));
        if (state.state === 'linked' || state.state === 'dangling-ours') {
          changes.push({ kind: 'remove', provider, skillId: id, path: entryPath, reason: 'AgileFlow link' });
        } else if (state.state === 'git-placeholder') {
          changes.push({ kind: 'remove', provider, skillId: id, path: entryPath, reason: 'git symlink placeholder' });
        } else if (state.state === 'mirror') {
          if (state.modified) {
            changes.push({
              kind: 'warn',
              provider,
              skillId: id,
              message: `${label(pctx, id)} is an AgileFlow mirror with direct edits; left in place`,
            });
          } else {
            changes.push({ kind: 'remove', provider, skillId: id, path: entryPath, reason: 'AgileFlow mirror' });
          }
        }
      }
      return changes;
    },
  };
  if (def.manualFlag) {
    const flag = def.manualFlag;
    adapter.applyManualActivation = (files: TreeFile[]) => setSkillFrontmatter(files, flag.key, flag.value);
  }
  return adapter;
}
