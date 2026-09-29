import fs from 'node:fs';
import path from 'node:path';
import {
  SKILL_FILE,
  type Diagnostic,
  type ProviderAdapter,
  type ProviderCapabilities,
  type ProviderContext,
  type ProviderId,
  type ResolvedSkill,
  type SupportLevel,
  type TreeFile,
} from '@agileflow/core';
import { compatibilityDiagnostics } from './compat';
import { detectBySpec, type DetectionSpec } from './util';
import { cachedVersion, versionDiagnostics, type MinimumVersion } from './versions';

export interface StandardAdapterDefinition {
  id: ProviderId;
  displayName: string;
  support: SupportLevel;
  detection: DetectionSpec;
  manualInvocation: 'hard' | 'semantic';
  /** How this provider's manual-only flag is expressed; used in validation. */
  manualMechanism?: string;
  applyManualActivation?: (files: TreeFile[], skillId: string) => TreeFile[];
  /** True when the skill's files carry this provider's manual-only flag. */
  hasManualFlag?: (skill: ResolvedSkill) => Promise<boolean>;
  extraValidate?: (pctx: ProviderContext, skills: ResolvedSkill[]) => Promise<Diagnostic[]>;
  optionalFeatures?: (pctx: ProviderContext) => Promise<ProviderCapabilities['optionalFeatures']>;
  /** First CLI version known to read skills from `.agents/skills` (only where verified). */
  minimumVersion?: MinimumVersion;
  /** Provider CLI release this adapter's behavior was last verified with (conformance run or source review). */
  verifiedWith?: string;
}

export function canonicalLabel(pctx: ProviderContext): string {
  return pctx.scope.kind === 'project' ? '.agents/skills' : '~/.agents/skills';
}

/**
 * Adapter for providers that read `.agents/skills` natively (Codex, Cursor,
 * OpenCode, Gemini CLI). Exposure is a no-op: the canonical directory *is*
 * the provider's skill directory. The adapter only detects, validates, and
 * translates manual invocation.
 */
export function createStandardAdapter(def: StandardAdapterDefinition): ProviderAdapter {
  const adapter: ProviderAdapter = {
    id: def.id,
    displayName: def.displayName,
    support: def.support,

    detect: (pctx) => detectBySpec(pctx, def.detection),

    async inspect(pctx) {
      const detection = await detectBySpec(pctx, def.detection);
      return {
        skillLocations: [canonicalLabel(pctx)],
        exposure: 'native',
        manualInvocation: def.manualInvocation,
        version: pctx.verbose && detection.executable ? await cachedVersion(detection.executable, pctx.ctx.platform) : undefined,
        optionalFeatures: def.optionalFeatures ? await def.optionalFeatures(pctx) : undefined,
      };
    },

    async planProjectSkillExposure() {
      return [];
    },

    async planUserSkillExposure() {
      return [];
    },

    async validate(pctx, skills) {
      const out: Diagnostic[] = [];
      let visible = true;
      try {
        await fs.promises.access(pctx.scope.skillsDir);
      } catch {
        visible = skills.length === 0;
      }
      if (!visible) out.push({ level: 'error', message: `${canonicalLabel(pctx)} is missing`, detail: ['Run `agileflow sync`.'] });
      const unflagged: string[] = [];
      if (def.manualInvocation === 'hard' && def.hasManualFlag) {
        for (const skill of skills) if (skill.activation === 'manual' && !(await def.hasManualFlag(skill))) unflagged.push(skill.id);
      }
      out.push(
        ...(await compatibilityDiagnostics(pctx, {
          name: def.displayName,
          location: canonicalLabel(pctx),
          skills,
          notInstalled: visible ? [] : skills.map((s) => s.id),
          manualInvocation: def.manualInvocation,
          manualMechanism: def.manualMechanism,
          unflagged,
          verifiedWith: def.verifiedWith,
          detect: () => detectBySpec(pctx, def.detection),
        })),
      );
      if (def.extraValidate) out.push(...(await def.extraValidate(pctx, skills)));
      out.push(...(await versionDiagnostics(pctx, def.displayName, () => detectBySpec(pctx, def.detection), def.minimumVersion)));
      return out;
    },

    async removeManagedArtifacts() {
      return [];
    },
  };
  if (def.applyManualActivation) adapter.applyManualActivation = def.applyManualActivation;
  return adapter;
}

export async function readSkillText(skill: ResolvedSkill, rel = SKILL_FILE): Promise<string | null> {
  try {
    return await fs.promises.readFile(path.join(skill.dir, ...rel.split('/')), 'utf8');
  } catch {
    return null;
  }
}
