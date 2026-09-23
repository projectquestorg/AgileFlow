import fs from 'node:fs';
import path from 'node:path';
import semver from 'semver';
import {
  hashTree,
  isNotFound,
  packMembers,
  parsePack,
  parseSidecar,
  pickVersion,
  readTree,
  SIDECAR_FILE,
  SKILL_FILE,
  summarizeTree,
  validateSkillMarkdown,
  DEFAULT_SCOPE,
} from '@agileflow/core';
import type { RegistrySkill, RegistrySkillIndex, RegistryVersion, RegistryPackIndex } from './client';
import { encodeBundle } from './integrity';

export interface BuildOptions {
  skillsDir: string;
  packsDir: string;
  outDir: string;
  /** Compare against disk without writing. */
  check?: boolean;
}

export interface BuildResult {
  written: string[];
  /** Files that differ from disk (check mode) or would be created. */
  outOfDate: string[];
  errors: string[];
  skills: Array<{ name: string; version: string; integrity: string }>;
}

function json(value: unknown): string {
  return JSON.stringify(value, null, 2) + '\n';
}

async function readJsonFile<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.promises.readFile(file, 'utf8')) as T;
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

async function listDirs(dir: string): Promise<string[]> {
  try {
    return (await fs.promises.readdir(dir, { withFileTypes: true }))
      .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
      .map((e) => e.name)
      .sort();
  } catch (err) {
    if (isNotFound(err)) return [];
    throw err;
  }
}

/**
 * Build the static registry from `skills/` and `packs/`.
 *
 * Published versions are immutable: rebuilding with changed content under
 * an existing version is an error, so users never see different bytes for
 * the same locked version. Older versions already in `outDir` are kept.
 */
export async function buildRegistry(options: BuildOptions): Promise<BuildResult> {
  const result: BuildResult = { written: [], outOfDate: [], errors: [], skills: [] };
  const outputs = new Map<string, string>();
  const skillIndex: RegistrySkillIndex = { schema: 1, skills: [] };

  for (const dirName of await listDirs(options.skillsDir)) {
    const dir = path.join(options.skillsDir, dirName);
    const files = await readTree(dir);
    const skillFile = files.find((f) => f.path === SKILL_FILE);
    const sidecarFile = files.find((f) => f.path === SIDECAR_FILE);
    if (!skillFile || !sidecarFile) {
      result.errors.push(`${dirName}: needs ${SKILL_FILE} and ${SIDECAR_FILE}`);
      continue;
    }
    const issues = validateSkillMarkdown(skillFile.content.toString('utf8'), dirName).filter((i) => i.level === 'error');
    if (issues.length) {
      result.errors.push(...issues.map((i) => `${dirName}: ${i.message}`));
      continue;
    }
    let sidecar;
    try {
      sidecar = parseSidecar(sidecarFile.content.toString('utf8'));
    } catch (err) {
      result.errors.push(`${dirName}: ${(err as Error).message}`);
      continue;
    }
    const { name, version } = sidecar.package;
    if (!semver.valid(version)) {
      result.errors.push(`${dirName}: version "${version}" is not valid semver`);
      continue;
    }
    if (name !== `${DEFAULT_SCOPE}/${dirName}`) {
      result.errors.push(`${dirName}: package name must be ${DEFAULT_SCOPE}/${dirName} (got ${name})`);
      continue;
    }
    const integrity = hashTree(files);
    const summary = summarizeTree(files);
    const bundleRel = `packages/${name}/${version}.json`;
    const versionRel = `v1/skills/${name}/${version}.json`;
    const existing = await readJsonFile<RegistryVersion>(path.join(options.outDir, versionRel));
    if (existing && existing.integrity !== integrity) {
      result.errors.push(
        `${name}@${version} is already published with different content. Bump package.version in ${dirName}/${SIDECAR_FILE}.`,
      );
      continue;
    }
    const versionMeta: RegistryVersion = {
      name,
      version,
      integrity,
      url: bundleRel,
      metadata: {
        description: summary.description ?? '',
        activation: sidecar.activation?.mode ?? 'auto',
        files: files.length,
        references: summary.references,
        scripts: summary.scripts,
        requirements: {
          commands: sidecar.requirements?.commands ?? [],
          network: sidecar.requirements?.network ?? 'none',
        },
      },
      compatibility: { agentSkills: sidecar.compatibility?.agentSkills ?? true, bundleFormat: 1 },
    };
    outputs.set(bundleRel, encodeBundle(name, version, files));
    outputs.set(versionRel, json(versionMeta));

    const previous = await readJsonFile<RegistrySkill>(path.join(options.outDir, `v1/skills/${name}/index.json`));
    const versions: Record<string, RegistryVersion> = { ...(previous?.versions ?? {}), [version]: versionMeta };
    const sortedVersions = Object.fromEntries(
      Object.keys(versions)
        .sort(semver.compare)
        .map((v) => [v, versions[v]!]),
    );
    const latest = pickVersion(Object.keys(sortedVersions), '*') ?? version;
    const skillDoc: RegistrySkill = {
      schema: 1,
      name,
      description: sortedVersions[latest]!.metadata.description,
      latest,
      versions: sortedVersions,
    };
    outputs.set(`v1/skills/${name}/index.json`, json(skillDoc));
    skillIndex.skills.push({
      name,
      description: skillDoc.description,
      latest,
      versions: Object.keys(sortedVersions),
    });
    result.skills.push({ name, version, integrity });
  }
  outputs.set('v1/skills/index.json', json(skillIndex));

  const packIndex: RegistryPackIndex = { schema: 1, packs: [] };
  let packFiles: string[] = [];
  try {
    packFiles = (await fs.promises.readdir(options.packsDir)).filter((f) => /\.ya?ml$/.test(f)).sort();
  } catch (err) {
    if (!isNotFound(err)) throw err;
  }
  for (const file of packFiles) {
    try {
      const pack = parsePack(await fs.promises.readFile(path.join(options.packsDir, file), 'utf8'), file);
      const fullName = pack.name.startsWith('@') ? pack.name : `${DEFAULT_SCOPE}/${pack.name}`;
      for (const member of packMembers(pack)) {
        const known = skillIndex.skills.find((s) => s.name === member.source);
        if (!known) throw new Error(`references unknown skill ${member.source}`);
        if (!pickVersion(known.versions, member.range)) {
          throw new Error(`no published version of ${member.source} satisfies ${member.range}`);
        }
      }
      outputs.set(`v1/packs/${fullName}.json`, json({ ...pack, name: fullName }));
      packIndex.packs.push({ name: fullName, description: pack.description, version: pack.version });
    } catch (err) {
      result.errors.push(`pack ${file}: ${(err as Error).message}`);
    }
  }
  outputs.set('v1/packs/index.json', json(packIndex));

  if (result.errors.length) return result;

  for (const [rel, content] of [...outputs.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const abs = path.join(options.outDir, ...rel.split('/'));
    let current: string | null = null;
    try {
      current = await fs.promises.readFile(abs, 'utf8');
    } catch (err) {
      if (!isNotFound(err)) throw err;
    }
    if (current === content) continue;
    result.outOfDate.push(rel);
    if (!options.check) {
      await fs.promises.mkdir(path.dirname(abs), { recursive: true });
      await fs.promises.writeFile(abs, content);
      result.written.push(rel);
    }
  }
  return result;
}
