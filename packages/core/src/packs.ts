import YAML from 'yaml';
import { z } from 'zod';
import { formatZodError } from './skill';
import { parseAddTarget, skillIdFromPackageName } from './source';
import type { PackDefinition } from './types';

/** A pack is a named list of skills. No runtime, hooks, or agents. */
export const PackSchema = z
  .object({
    name: z.string().regex(/^(@[a-z0-9-]+\/)?[a-z0-9]+(-[a-z0-9]+)*$/),
    version: z.union([z.number().int().positive(), z.string().min(1)]),
    description: z.string().optional(),
    skills: z.array(z.string().min(1)).min(1),
  })
  .strict();

export function parsePack(text: string, file = 'pack'): PackDefinition {
  const result = PackSchema.safeParse(YAML.parse(text));
  if (!result.success) throw new Error(`Invalid pack ${file}: ${formatZodError(result.error)}`);
  return result.data;
}

export interface PackMember {
  id: string;
  source: string;
  range: string | null;
}

export function packMembers(pack: PackDefinition): PackMember[] {
  return pack.skills.map((entry) => {
    const target = parseAddTarget(entry);
    if (target.ref.kind !== 'registry') {
      throw new Error(`Pack ${pack.name} entry "${entry}" must be a registry skill`);
    }
    return { id: skillIdFromPackageName(target.ref.name), source: target.source, range: target.range };
  });
}
