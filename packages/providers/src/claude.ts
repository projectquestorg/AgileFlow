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
  type ResolvedSkill,
} from '@agileflow/core';
import { detectBySpec, getSkillFrontmatter, probeVersion, setSkillFrontmatter } from './util';
import { readSkillText } from './standard-agent-skills';

/**
 * Claude Code reads `.claude/skills` (and `~/.claude/skills`), not
 * `.agents/skills`. The adapter makes each canonical skill visible there
 * with a per-skill link (symlink, junction on Windows, or a marked mirror
 * as a last resort). It owns only the links/mirrors it created; the
 * `.claude/skills` directory and everything else in it belong to the user.
 * It never touches `.claude/settings.json`.
 */

function claudeSkillsDir(pctx: ProviderContext): string {
  return path.join(pctx.scope.root, '.claude', 'skills');
}

function label(pctx: ProviderContext, id?: string): string {
  const base = pctx.scope.kind === 'project' ? '.claude/skills' : '~/.claude/skills';
  return id ? `${base}/${id}` : base;
}

async function planExposure(pctx: ProviderContext, skills: ResolvedSkill[]): Promise<PlannedChange[]> {
  const changes: PlannedChange[] = [];
  const dir = claudeSkillsDir(pctx);
  for (const skill of skills) {
    const entryPath = path.join(dir, skill.id);
    const state = await classifyEntry(entryPath, skill.dir);
    switch (state.state) {
      case 'missing':
      case 'dangling-ours':
        changes.push({ kind: 'link', provider: 'claude', skillId: skill.id, path: entryPath, target: skill.dir });
        break;
      case 'mirror': {
        if (state.modified) {
          changes.push({
            kind: 'warn',
            provider: 'claude',
            skillId: skill.id,
            message: `${label(pctx, skill.id)} is a generated mirror that was edited directly; not refreshed. Edit ${pctx.scope.kind === 'project' ? '.agents/skills' : '~/.agents/skills'}/${skill.id} instead, then delete the mirror so AgileFlow regenerates it.`,
          });
          break;
        }
        const canonical = hashTree(await readTree(skill.dir, { exclude: (rel) => rel === MIRROR_MARKER }));
        if (canonical !== state.marker.hash) {
          changes.push({ kind: 'refresh-mirror', provider: 'claude', skillId: skill.id, path: entryPath, target: skill.dir });
        }
        break;
      }
      case 'user-dir':
      case 'file':
        changes.push({
          kind: 'warn',
          provider: 'claude',
          skillId: skill.id,
          message: `${label(pctx, skill.id)} already exists and is not AgileFlow's; Claude will use that one instead of .agents/skills/${skill.id}`,
        });
        break;
      case 'foreign-link':
        changes.push({
          kind: 'warn',
          provider: 'claude',
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

export const claudeAdapter: ProviderAdapter = {
  id: 'claude',
  displayName: 'Claude',
  support: 'adapted',

  detect: (pctx) =>
    detectBySpec(pctx, {
      executables: ['claude'],
      homeMarkers: ['.claude'],
      projectMarkers: ['.claude', 'CLAUDE.md'],
    }),

  async inspect(pctx) {
    const detection = await this.detect(pctx);
    return {
      skillLocations: [label(pctx)],
      exposure: 'linked',
      manualInvocation: 'hard',
      version: pctx.verbose ? await probeVersion(detection.executable) : undefined,
    };
  },

  planProjectSkillExposure: planExposure,
  planUserSkillExposure: planExposure,

  async validate(pctx, skills) {
    const out: Diagnostic[] = [];
    const missing: string[] = [];
    const modifiedMirrors: string[] = [];
    const staleMirrors: string[] = [];
    const conflicts: string[] = [];
    const linkTypes = new Map<string, number>();
    for (const skill of skills) {
      const entryPath = path.join(claudeSkillsDir(pctx), skill.id);
      const state = await classifyEntry(entryPath, skill.dir);
      if (state.state === 'missing' || state.state === 'dangling-ours') missing.push(skill.id);
      else if (state.state === 'mirror') {
        linkTypes.set('mirror', (linkTypes.get('mirror') ?? 0) + 1);
        if (state.modified) modifiedMirrors.push(skill.id);
        else {
          const canonical = hashTree(await readTree(skill.dir, { exclude: (rel) => rel === MIRROR_MARKER }));
          if (canonical !== state.marker.hash) staleMirrors.push(skill.id);
        }
      } else if (state.state === 'linked') linkTypes.set(state.linkType, (linkTypes.get(state.linkType) ?? 0) + 1);
      else if (state.state === 'same-as-canonical') linkTypes.set('directory link', (linkTypes.get('directory link') ?? 0) + 1);
      else conflicts.push(`${label(pctx, skill.id)}: ${state.state === 'foreign-link' ? `links to ${state.target}` : 'Claude-only skill with the same name'}`);
    }
    if (missing.length) {
      out.push({
        level: 'error',
        message: `Claude compatibility links missing`,
        detail: [...missing.map((id) => label(pctx, id)), 'Run `agileflow sync` or `agileflow check --fix`.'],
      });
    }
    if (modifiedMirrors.length) {
      out.push({
        level: 'warn',
        message: 'Claude mirrors were edited directly',
        detail: modifiedMirrors.map(
          (id) => `${label(pctx, id)} is generated; the canonical copy is ${pctx.scope.kind === 'project' ? '' : '~/'}.agents/skills/${id}`,
        ),
      });
    }
    if (staleMirrors.length) {
      out.push({
        level: 'warn',
        message: 'Claude mirrors are out of date',
        detail: [...staleMirrors.map((id) => label(pctx, id)), 'Run `agileflow sync`.'],
      });
    }
    if (conflicts.length) out.push({ level: 'warn', message: 'Claude skills shadow AgileFlow skills', detail: conflicts });
    if (!missing.length && !modifiedMirrors.length && !staleMirrors.length && !conflicts.length) {
      out.push({ level: 'ok', message: skills.length ? 'Claude compatibility links valid' : 'Claude has no skills to link' });
    }
    if (linkTypes.size) {
      out.push({
        level: 'info',
        message: 'Claude link types',
        detail: [...linkTypes.entries()].map(([k, v]) => `${k}: ${v}`),
        verboseOnly: true,
      });
    }
    const manual = skills.filter((s) => s.activation === 'manual');
    const unflagged: string[] = [];
    for (const skill of manual) {
      const text = await readSkillText(skill);
      if (text && getSkillFrontmatter(text, ['disable-model-invocation']) !== true) unflagged.push(skill.id);
    }
    if (unflagged.length) {
      out.push({
        level: 'warn',
        message: 'Claude may invoke manual skills automatically',
        detail: [`${unflagged.join(', ')} lack \`disable-model-invocation: true\`.`],
      });
    }
    return out;
  },

  async removeManagedArtifacts(pctx, skillIds) {
    // Ownership is explicit: only skills the caller names (from the lockfile)
    // are considered. Never scan the directory and guess.
    const dir = claudeSkillsDir(pctx);
    const changes: PlannedChange[] = [];
    for (const id of skillIds ?? []) {
      const entryPath = path.join(dir, id);
      const canonical = path.join(pctx.scope.skillsDir, id);
      const state = await classifyEntry(entryPath, canonical);
      if (state.state === 'linked' || state.state === 'dangling-ours') {
        changes.push({ kind: 'remove', provider: 'claude', skillId: id, path: entryPath, reason: 'AgileFlow link' });
      } else if (state.state === 'mirror') {
        if (state.modified) {
          changes.push({
            kind: 'warn',
            provider: 'claude',
            skillId: id,
            message: `${label(pctx, id)} is an AgileFlow mirror with direct edits; left in place`,
          });
        } else {
          changes.push({ kind: 'remove', provider: 'claude', skillId: id, path: entryPath, reason: 'AgileFlow mirror' });
        }
      }
    }
    return changes;
  },

  applyManualActivation(files) {
    return setSkillFrontmatter(files, ['disable-model-invocation'], true);
  },
};
