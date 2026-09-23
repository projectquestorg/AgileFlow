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
import { detectBySpec, probeVersion, type DetectionSpec } from './util';

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
        version: pctx.verbose ? await probeVersion(detection.executable) : undefined,
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
      out.push(
        visible
          ? { level: 'ok', message: `${def.displayName} reads ${canonicalLabel(pctx)}` }
          : { level: 'error', message: `${canonicalLabel(pctx)} is missing`, detail: ['Run `agileflow sync`.'] },
      );
      const manual = skills.filter((s) => s.activation === 'manual');
      if (manual.length) {
        if (def.manualInvocation === 'semantic') {
          out.push({
            level: 'info',
            message: `${def.displayName} manual-only enforcement: semantic`,
            detail: [
              `${manual.map((s) => s.id).join(', ')} rely on their descriptions to avoid automatic activation.`,
            ],
          });
        } else if (def.hasManualFlag) {
          const missing: string[] = [];
          for (const skill of manual) if (!(await def.hasManualFlag(skill))) missing.push(skill.id);
          if (missing.length) {
            out.push({
              level: 'warn',
              message: `${def.displayName} may invoke manual skills automatically`,
              detail: [
                `${missing.join(', ')} lack ${def.manualMechanism ?? 'the manual-only flag'}.`,
                'Managed skills get it on `agileflow sync`; add it yourself to forked/local skills.',
              ],
            });
          }
        }
      }
      if (def.extraValidate) out.push(...(await def.extraValidate(pctx, skills)));
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
