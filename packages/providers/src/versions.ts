import type { Diagnostic, ProviderContext, ProviderDetection } from '@agileflow/core';
import { compareVersions, parseVersion, probeVersion } from './util';

/**
 * The first provider CLI version known to support what AgileFlow relies on.
 * Only thresholds verified against published releases belong here; for
 * providers without one, `check --verbose` just reports the version.
 */
export interface MinimumVersion {
  version: string;
  /** What older versions lack, e.g. "reading .agents/skills". */
  feature: string;
  /** How to upgrade. */
  upgrade: string;
}

const probes = new Map<string, Promise<string | undefined>>();

/** `probeVersion`, once per executable per process (check calls validate and inspect). */
export function cachedVersion(executable: string, platform: NodeJS.Platform): Promise<string | undefined> {
  let probe = probes.get(executable);
  if (!probe) {
    probe = probeVersion(executable, platform);
    probes.set(executable, probe);
  }
  return probe;
}

/**
 * Verbose-only version diagnostics: the detected CLI version, and a warning
 * with an upgrade hint when it predates `minimum`. Never required: nothing is
 * reported when the CLI is not on PATH or does not answer in time.
 */
export async function versionDiagnostics(
  pctx: ProviderContext,
  displayName: string,
  detect: () => Promise<ProviderDetection>,
  minimum: MinimumVersion | undefined,
): Promise<Diagnostic[]> {
  if (!pctx.verbose) return [];
  const { executable } = await detect();
  if (!executable) return [];
  const line = await cachedVersion(executable, pctx.ctx.platform);
  const version = parseVersion(line);
  if (!minimum || !version || compareVersions(version, minimum.version) >= 0) return [];
  return [
    {
      level: 'warn',
      message: `${displayName} ${version} predates ${minimum.feature} (${minimum.version})`,
      detail: [minimum.upgrade],
    },
  ];
}
