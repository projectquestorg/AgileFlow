import type { Diagnostic, ProviderContext, ProviderDetection, ResolvedSkill } from '@agileflow/core';
import { cachedVersion } from './versions';

/**
 * How `check` grades what a provider will do with the installed skills. It
 * states what AgileFlow verified and labels the rest "not verified" instead
 * of printing a bare green check:
 *
 * - visible: the skill files are where the provider reads skills (the
 *   directory, or a valid link or mirror). Whether the provider discovers
 *   them is provider behavior AgileFlow does not run, so it is not verified
 *   here (`npm run test:conformance` checks it against real CLIs).
 * - enforced: a manual-only skill carries the provider's documented hard
 *   switch (checked in the files).
 * - advisory: the provider has no manual-only switch; only the description
 *   asks for explicit use, so automatic use is still possible.
 */
export interface CompatibilityInput {
  name: string;
  /** Where the provider reads skills, e.g. `.agents/skills`, `.claude/skills`. */
  location: string;
  skills: ResolvedSkill[];
  /** Skills whose files are not where the provider reads them (reported separately). */
  notInstalled: string[];
  /** How the files got there when not native, e.g. `symlink`, `junction: 2, mirror: 5`. */
  via?: string;
  manualInvocation: 'hard' | 'semantic';
  /** The hard switch, for messages (e.g. "`disable-model-invocation: true` in SKILL.md"). */
  manualMechanism?: string;
  /** Manual skills missing the hard switch. */
  unflagged: string[];
  /** Provider CLI release this adapter's behavior was last verified with, where known. */
  verifiedWith?: string;
  detect: () => Promise<ProviderDetection>;
}

export async function compatibilityDiagnostics(pctx: ProviderContext, input: CompatibilityInput): Promise<Diagnostic[]> {
  const out: Diagnostic[] = [];
  const { name, skills } = input;
  const installed = skills.filter((s) => !input.notInstalled.includes(s.id));
  const manual = skills.filter((s) => s.activation === 'manual');
  const count = `${installed.length} skill${installed.length === 1 ? '' : 's'}${input.via ? ` via ${input.via}` : ''}`;
  if (skills.length && installed.length) {
    out.push({ level: 'ok', message: `${name}: visible in ${input.location} (${count}; provider discovery not verified)` });
  } else if (!skills.length) {
    out.push({ level: 'ok', message: `${name}: ${input.location} ready (no skills to expose)` });
  }

  const enforced = manual.filter((s) => !input.unflagged.includes(s.id)).map((s) => s.id);
  if (manual.length && input.manualInvocation === 'semantic') {
    out.push({
      level: 'info',
      message: `${name} manual-only: advisory`,
      detail: [
        `${manual.map((s) => s.id).join(', ')}: ${name} has no manual-only switch; the description asks for explicit use, so automatic use is still possible.`,
      ],
    });
  } else if (manual.length) {
    if (enforced.length) {
      out.push({
        level: 'ok',
        message: `${name} manual-only: enforced`,
        detail: [`${enforced.join(', ')}: ${input.manualMechanism ?? 'manual-only flag'} present`],
      });
    }
    if (input.unflagged.length) {
      out.push({
        level: 'warn',
        message: `${name} manual-only: not enforced; ${name} may invoke these automatically`,
        detail: [
          `${input.unflagged.join(', ')} lack ${input.manualMechanism ?? 'the manual-only flag'}.`,
          'Managed skills get it on `agileflow sync`; add it yourself to forked/local skills.',
        ],
      });
    }
  }

  // Per-skill status and the provider version: verbose only (probing the
  // version spawns the provider CLI).
  if (pctx.verbose && skills.length) {
    const rows = skills.map((s) => {
      const here = !input.notInstalled.includes(s.id);
      const automatic =
        s.activation !== 'manual'
          ? 'eligible'
          : input.manualInvocation === 'semantic'
            ? 'possible (advisory: description only)'
            : input.unflagged.includes(s.id)
              ? 'possible (flag missing)'
              : 'blocked (enforced)';
      return `${s.id}: installed ${here ? 'yes' : 'no'}; discovered not verified; explicit invocation ${here ? 'not verified' : 'no'}; automatic ${here ? automatic : 'no'}`;
    });
    const { executable } = await input.detect();
    const version = executable ? await cachedVersion(executable, pctx.ctx.platform) : undefined;
    out.push({
      level: 'info',
      message: `${name} skill status`,
      detail: [
        ...rows,
        `provider version: ${version ?? (executable ? 'unknown (no --version answer)' : 'not on PATH')}`,
        `behavior last verified with: ${input.verifiedWith ?? 'not verified'}`,
      ],
      verboseOnly: true,
    });
  }
  return out;
}
