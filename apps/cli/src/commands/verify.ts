import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import path from 'node:path';
import { promisify } from 'node:util';
import {
  globalScope,
  inspectSkill,
  loadWorkspace,
  parseSource,
  projectScope,
  parseSkillMarkdown,
  scanSkill,
  SKILL_FILE,
  type RiskFinding,
  type ScopeTarget,
} from '@agileflow/core';
import { cachedBundlePath, type RegistryClient } from '@agileflow/registry';
import type { Cli } from '../runtime';
import { EXIT, findProject, servicesFor, UsageError } from '../runtime';
import { table } from '../ui/tables';
import { riskLine } from './shared';

const execFileAsync = promisify(execFile);

/** Repository whose CI publishes the official registry and attests every bundle. */
export const OFFICIAL_REPOSITORY = 'projectquestorg/AgileFlow';

export interface VerifyOptions {
  global?: boolean;
  attestations?: boolean;
  failOn?: string;
  json?: boolean;
  /** Print a CycloneDX SBOM of the locked skills instead of the table. */
  sbom?: boolean;
}

export interface VerifyRow {
  id: string;
  source: string;
  version: string;
  ownership: 'managed' | 'local';
  /** Package bytes match the lockfile integrity. */
  integrity: 'ok' | 'failed' | 'skipped';
  /** Official package whose integrity this CLI release pins. */
  pinned: boolean;
  /** Installed files match what AgileFlow rendered. */
  files: string;
  attestation?: 'verified' | 'failed' | 'unavailable' | 'not-applicable';
  risks: RiskFinding[];
  /** Git commit for git sources. */
  resolved?: string;
  /** SPDX license from SKILL.md frontmatter, when declared. */
  license?: string;
  error?: string;
}

/** CycloneDX 1.5 SBOM: one component per locked skill, with integrity, source, and license. */
export function cycloneDx(rows: VerifyRow[], project: string, version: string): Record<string, unknown> {
  return {
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    serialNumber: `urn:uuid:${crypto.randomUUID()}`,
    version: 1,
    metadata: {
      timestamp: new Date().toISOString(),
      tools: { components: [{ type: 'application', name: 'agileflow', version }] },
      component: { type: 'application', name: project, 'bom-ref': 'project' },
    },
    components: rows.map((r) => {
      const registry = r.source.startsWith('@');
      const git = r.source.startsWith('git+');
      return {
        type: 'data',
        'bom-ref': `skill:${r.id}`,
        name: r.id,
        version: r.version,
        ...(registry ? { group: r.source.split('/')[0], purl: `pkg:generic/${encodeURIComponent(r.source)}@${r.version}` } : {}),
        ...(r.license ? { licenses: [{ license: /^[A-Za-z0-9.+-]+$/.test(r.license) ? { id: r.license } : { name: r.license } }] } : {}),
        ...(git ? { externalReferences: [{ type: 'vcs', url: r.source.slice(4).split('#')[0], comment: r.resolved ? `commit ${r.resolved}` : undefined }] } : {}),
        properties: [
          { name: 'agileflow:source', value: r.source },
          { name: 'agileflow:ownership', value: r.ownership },
          { name: 'agileflow:integrity-check', value: r.integrity },
          { name: 'agileflow:installed-files', value: r.files },
          { name: 'agileflow:pinned-by-release', value: String(r.pinned) },
          { name: 'agileflow:findings', value: `high=${r.risks.filter((f) => f.severity === 'high').length} medium=${r.risks.filter((f) => f.severity === 'medium').length}` },
        ],
      };
    }),
    dependencies: [{ ref: 'project', dependsOn: rows.map((r) => `skill:${r.id}`) }],
  };
}

function licenseOf(files: Array<{ path: string; content: Buffer }>): string | undefined {
  const text = files.find((f) => f.path === SKILL_FILE)?.content.toString('utf8');
  if (!text) return undefined;
  try {
    const value = parseSkillMarkdown(text).frontmatter.license;
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  } catch {
    return undefined;
  }
}

async function verifyAttestation(file: string, env: Record<string, string | undefined>): Promise<{ status: 'verified' | 'failed' | 'unavailable'; detail?: string }> {
  try {
    await execFileAsync('gh', ['attestation', 'verify', file, '--repo', OFFICIAL_REPOSITORY], {
      timeout: 60_000,
      env: { ...process.env, ...Object.fromEntries(Object.entries(env).filter(([k]) => k.startsWith('GH_') || k === 'GITHUB_TOKEN')) },
    });
    return { status: 'verified' };
  } catch (err) {
    const e = err as { code?: string; stderr?: string; message: string };
    if (e.code === 'ENOENT') return { status: 'unavailable', detail: 'GitHub CLI (gh) is not installed' };
    const detail = (e.stderr || e.message).trim().split('\n').slice(-1)[0];
    if (/auth|login|token/i.test(detail ?? '')) return { status: 'unavailable', detail: `gh is not logged in: ${detail}` };
    return { status: 'failed', detail };
  }
}

/**
 * `agileflow verify`: supply-chain check of everything in the lockfile.
 * Re-fetches each locked package (cache or network), verifies it against
 * the lockfile and the integrities pinned into this CLI release, checks the
 * installed files, scans the content, and with `--attestations` verifies the
 * Sigstore build attestation GitHub recorded for official registry bundles.
 */
export async function runVerify(cli: Cli, ids: string[], options: VerifyOptions): Promise<number> {
  const { ctx, out } = cli;
  const failOn = options.failOn;
  if (failOn && failOn !== 'high' && failOn !== 'medium') throw new UsageError('--fail-on must be high or medium');
  let scope: ScopeTarget;
  if (options.global) scope = globalScope(ctx);
  else {
    const root = await findProject(ctx);
    if (!root) throw new UsageError(`No agileflow.yaml found in ${ctx.cwd} or its parents`, ['Pass --global to verify personal skills.']);
    scope = projectScope(root);
  }
  const services = await servicesFor(ctx, scope);
  const registry = (services.fetcher as { registry?: RegistryClient }).registry;
  const ws = await loadWorkspace(scope);
  const entries = Object.entries(ws.lock.resolved).filter(([id]) => !ids.length || ids.includes(id));
  for (const id of ids) if (!ws.lock.resolved[id]) throw new UsageError(`${id} is not in ${scope.kind === 'project' ? 'agileflow.lock' : 'your personal lock'}`);

  out.progress(`Verifying ${entries.length} skill(s)...`);
  const rows: VerifyRow[] = [];
  for (const [id, entry] of entries) {
    const row: VerifyRow = {
      id,
      source: entry.source,
      version: entry.version,
      ownership: entry.ownership,
      integrity: 'skipped',
      pinned: false,
      files: 'local',
      risks: [],
    };
    const state = await inspectSkill(scope, id, entry);
    row.files = state.status;
    if (entry.ownership === 'local') {
      row.risks = state.files ? scanSkill(state.files) : [];
      row.license = state.files ? licenseOf(state.files) : undefined;
      rows.push(row);
      continue;
    }
    if (entry.resolved) row.resolved = entry.resolved;
    try {
      const pkg = await services.fetcher.fetchLocked(id, entry, scope.root);
      row.integrity = pkg.integrity === entry.integrity ? 'ok' : 'failed';
      row.risks = scanSkill(pkg.files);
      row.license = licenseOf(pkg.files);
      const ref = parseSource(entry.source);
      if (ref.kind === 'registry') {
        row.pinned = registry?.isPinned(ref.name, entry.version) ?? false;
        if (options.attestations) {
          if (ref.name.startsWith('@agileflow/')) {
            const result = await verifyAttestation(cachedBundlePath(ctx, ref.name, entry.version), ctx.env);
            row.attestation = result.status;
            if (result.detail) row.error = result.detail;
          } else {
            row.attestation = 'not-applicable';
          }
        }
      } else if (options.attestations) {
        row.attestation = 'not-applicable';
      }
    } catch (err) {
      row.integrity = 'failed';
      row.error = (err as Error).message;
    }
    rows.push(row);
  }

  const threshold = failOn === 'medium' ? ['high', 'medium'] : failOn === 'high' ? ['high'] : [];
  const riskFailures = rows.filter((r) => r.risks.some((f) => threshold.includes(f.severity)));
  const failures = rows.filter((r) => r.integrity === 'failed' || r.attestation === 'failed');
  const ok = !failures.length && !riskFailures.length;
  if (options.sbom) {
    const { cliVersion } = await import('../version');
    out.json(cycloneDx(rows, path.basename(scope.root), cliVersion()));
    return ok ? EXIT.OK : EXIT.ERROR;
  }
  if (options.json) {
    out.json({ ok, scope: scope.kind, root: scope.root, skills: rows });
    return ok ? EXIT.OK : EXIT.ERROR;
  }
  if (!rows.length) {
    out.line('No skills in the lockfile.');
    return EXIT.OK;
  }
  out.lines(
    table(
      ['SKILL', 'VERSION', 'INTEGRITY', 'FILES', ...(options.attestations ? ['ATTESTATION'] : []), 'FINDINGS'],
      rows.map((r) => [
        r.id,
        r.version,
        r.integrity === 'ok' ? (r.pinned ? 'ok (pinned)' : 'ok') : r.integrity,
        r.files,
        ...(options.attestations ? [r.attestation ?? '-'] : []),
        `${r.risks.filter((f) => f.severity === 'high').length}H ${r.risks.filter((f) => f.severity === 'medium').length}M ${r.risks.filter((f) => f.severity === 'low').length}L`,
      ]),
    ),
  );
  for (const r of rows) {
    if (r.error) out.line(`${r.id}: ${r.error}`);
    for (const f of r.risks.filter((x) => x.severity === 'high')) out.line(`${r.id}: ${riskLine(f)}`);
  }
  if (options.attestations && rows.some((r) => r.attestation === 'unavailable')) {
    out.line('Attestations need the GitHub CLI (gh), logged in: https://cli.github.com');
  }
  out.line(
    ok
      ? `Verified ${rows.length} skill(s).`
      : `${failures.length + riskFailures.length} skill(s) failed verification${riskFailures.length ? ` (${riskFailures.length} over the --fail-on ${failOn} threshold)` : ''}.`,
  );
  return ok ? EXIT.OK : EXIT.ERROR;
}
