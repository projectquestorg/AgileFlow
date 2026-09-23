import fs from 'node:fs';
import semver from 'semver';

/** CLI version from apps/cli/package.json (works from src/ and from the bundled dist/). */
export function cliVersion(): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/**
 * Optional notice when a newer CLI is published. CLI updates are separate
 * from skill updates; skills never require a matching CLI release.
 */
export async function checkCliUpdate(env: Record<string, string | undefined>): Promise<string | null> {
  if (env.AGILEFLOW_NO_UPDATE_NOTIFIER || env.CI) return null;
  try {
    const res = await fetch('https://registry.npmjs.org/agileflow', {
      headers: { accept: 'application/vnd.npm.install-v1+json' },
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { 'dist-tags'?: Record<string, string> };
    const current = cliVersion();
    const tag = semver.prerelease(current) ? 'next' : 'latest';
    const latest = data['dist-tags']?.[tag] ?? data['dist-tags']?.latest;
    if (latest && semver.valid(latest) && semver.valid(current) && semver.gt(latest, current)) {
      return `AgileFlow CLI update available: ${current} -> ${latest}`;
    }
  } catch {
    // offline or registry unavailable: say nothing
  }
  return null;
}
