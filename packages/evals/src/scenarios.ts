import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { z } from 'zod';
import { formatZodError, isNotFound } from '@agileflow/core';

/** One eval scenario, stored as `<skill>/evals/<name>.yaml`. */
export const EvalScenarioSchema = z
  .object({
    name: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
    skill: z.string().min(1),
    description: z.string().optional(),
    prompt: z.string().min(1),
    /** `explicit`: the harness invokes the skill by name (`/skill`, `$skill`). */
    invocation: z.enum(['implicit', 'explicit']).default('implicit'),
    /** Fixture repository under `fixtures/` to run in (default: clean-node). */
    fixture: z.string().optional(),
    /**
     * Shell run in the sandbox after the initial commit, to create the state the
     * prompt describes (a regression commit, uncommitted edits, a conflicted rebase).
     */
    setup: z.string().optional(),
    assert: z.object({ shouldActivate: z.boolean() }).strict(),
    /** Observable behaviors a judge checks on positive scenarios. */
    rubric: z.array(z.string().min(1)).optional(),
  })
  .strict();

export type EvalScenario = z.infer<typeof EvalScenarioSchema>;

export interface LoadedScenario extends EvalScenario {
  file: string;
}

export async function loadScenarios(skillDir: string): Promise<{ scenarios: LoadedScenario[]; errors: string[] }> {
  const evalsDir = path.join(skillDir, 'evals');
  const scenarios: LoadedScenario[] = [];
  const errors: string[] = [];
  let files: string[];
  try {
    files = (await fs.promises.readdir(evalsDir)).filter((f) => /\.ya?ml$/.test(f)).sort();
  } catch (err) {
    if (isNotFound(err)) return { scenarios, errors };
    throw err;
  }
  for (const file of files) {
    const abs = path.join(evalsDir, file);
    try {
      const parsed = EvalScenarioSchema.safeParse(YAML.parse(await fs.promises.readFile(abs, 'utf8')));
      if (!parsed.success) {
        errors.push(`${file}: ${formatZodError(parsed.error)}`);
        continue;
      }
      scenarios.push({ ...parsed.data, file: abs });
    } catch (err) {
      errors.push(`${file}: ${(err as Error).message}`);
    }
  }
  return { scenarios, errors };
}
