import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { z } from 'zod';
import { formatZodError, isNotFound, type InteractionPreference } from '@agileflow/core';

export const RULE_KEYS = ['command', 'noCommand', 'output', 'noOutput', 'fileChanged', 'fileUnchanged', 'fileContains'] as const;

/** Deterministic rubric check: evaluated from the transcript and the sandbox, never by a model. */
export const RuleCheckSchema = z
  .object({
    /** Label shown in reports (default: derived from the check). */
    criterion: z.string().min(1).optional(),
    /** A shell command the agent ran matches this regex. */
    command: z.string().min(1).optional(),
    /** No shell command the agent ran matches this regex. */
    noCommand: z.string().min(1).optional(),
    /** The agent's final response matches this regex. */
    output: z.string().min(1).optional(),
    /** The agent's final response does not match this regex. */
    noOutput: z.string().min(1).optional(),
    /** A file matching this glob (relative to the repository) was created, modified, or deleted. */
    fileChanged: z.string().min(1).optional(),
    /** No file matching this glob was created, modified, or deleted. */
    fileUnchanged: z.string().min(1).optional(),
    /** After the run, the file at `path` exists and its content matches `pattern` (regex). */
    fileContains: z.object({ path: z.string().min(1), pattern: z.string().min(1) }).strict().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const keys = RULE_KEYS.filter((k) => value[k] !== undefined);
    if (keys.length !== 1) {
      ctx.addIssue({
        code: 'custom',
        message: `a rule check needs exactly one of ${RULE_KEYS.join(', ')} (found ${keys.length ? keys.join(', ') : 'none'})`,
      });
    }
    for (const key of ['command', 'noCommand', 'output', 'noOutput'] as const) {
      if (value[key] !== undefined && !isValidRegex(value[key]!)) {
        ctx.addIssue({ code: 'custom', path: [key], message: `invalid regular expression: ${value[key]}` });
      }
    }
    if (value.fileContains && !isValidRegex(value.fileContains.pattern)) {
      ctx.addIssue({ code: 'custom', path: ['fileContains', 'pattern'], message: 'invalid regular expression' });
    }
  });

export type RuleCheck = z.infer<typeof RuleCheckSchema>;

/** A rubric item: a string is graded by the LLM judge; an object is a deterministic rule check. */
export const RubricItemSchema = z.union([z.string().min(1), RuleCheckSchema]);
export type RubricItem = z.infer<typeof RubricItemSchema>;

function isValidRegex(source: string): boolean {
  try {
    new RegExp(source);
    return true;
  } catch {
    return false;
  }
}

const regexList = z.array(
  z
    .string()
    .min(1)
    .superRefine((value, ctx) => {
      if (!isValidRegex(value)) ctx.addIssue({ code: 'custom', message: `invalid regular expression: ${value}` });
    }),
);

/**
 * Safety expectations checked deterministically after every run (any mode):
 * shell commands from the provider's tool events, files the run created,
 * modified, or deleted (a before/after snapshot of the sandbox), and the final
 * response. Any match fails the scenario.
 */
export const ForbidSchema = z
  .object({
    /** Regexes matched against every shell command the agent ran. */
    commands: regexList.optional(),
    /**
     * Globs (`*`, `**`, `?`) matched against files the run created, modified, or
     * deleted: repository-relative paths, or `~/...` for the isolated HOME.
     */
    files: z.array(z.string().min(1)).optional(),
    /** Regexes matched against the agent's final response. */
    output: regexList.optional(),
  })
  .strict();
export type Forbid = z.infer<typeof ForbidSchema>;

/** One eval scenario, stored as `<skill>/evals/<name>.yaml`. */
export const EvalScenarioSchema = z
  .object({
    name: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
    skill: z.string().min(1),
    description: z.string().optional(),
    /**
     * `standard` (default) or `adversarial`: a prompt-injection or unsafe-input
     * scenario. Adversarial scenarios must declare `forbid` and are grouped
     * separately in reports.
     */
    kind: z.enum(['standard', 'adversarial']).default('standard'),
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
    /**
     * Stand-in commands for the run, e.g. a scripted `gh` that answers like a
     * real PR: command name -> shell script. They are written outside the
     * sandbox repository and put first on PATH for `setup` and the agent, and
     * run under the same trust rules as `setup`.
     */
    bin: z
      .record(z.string().regex(/^[a-z0-9][a-z0-9._-]*$/, 'command names are lowercase letters, digits, ., _, -'), z.string().min(1))
      .optional(),
    assert: z.object({ shouldActivate: z.boolean() }).strict(),
    /**
     * For negative scenarios: the neighboring skill this prompt belongs to, so
     * lint can check that trigger conflicts with similar skills are covered.
     */
    neighbor: z.string().min(1).optional(),
    /** Observable behaviors checked on positive scenarios (strings: LLM judge; objects: rule checks). */
    rubric: z.array(RubricItemSchema).optional(),
    /** Safety expectations checked deterministically on every run. */
    forbid: ForbidSchema.optional(),
    /** Marks a question-preference scenario: what kind of ambiguity the prompt contains. */
    interaction: z
      .object({
        /**
         * `choice`: several reasonable options; proceeding with a stated choice is acceptable.
         * `missing-information`: a fact that determines correctness is not in the repository.
         * `repository-answerable`: looks ambiguous, but the repository holds the answer.
         */
        ambiguity: z.enum(['choice', 'missing-information', 'repository-answerable']),
        /** The decision or missing fact and why it matters (for the judge). */
        decision: z.string().min(1),
        /** What a finished change must do (for the judge's `taskSucceeded`). */
        success: z.array(z.string().min(1)).min(1),
      })
      .strict()
      .optional(),
  })
  .strict();

export type EvalScenario = z.infer<typeof EvalScenarioSchema>;
export type Ambiguity = NonNullable<EvalScenario['interaction']>['ambiguity'];

/**
 * Expected behavior for an ambiguity class under a preference.
 * `null`: no per-run expectation.
 *
 * - repository-answerable: nobody should ask; the answer is in the repository.
 * - missing-information: under prefer and minimize, the agent must not guess
 *   the missing fact: it asks, or finishes while leaving the fact explicitly
 *   undecided (graded by the judge as a success). minimize must not become
 *   reckless. provider-default is whatever the provider does.
 * - choice: prefer should ask more often than provider-default, and minimize
 *   no more often; checked by `compareQuestionPreferences`.
 */
export type AskExpectation = 'no-ask' | 'ask-or-defer';

export function expectedAsk(ambiguity: Ambiguity, preference: InteractionPreference): AskExpectation | null {
  if (ambiguity === 'repository-answerable') return 'no-ask';
  if (ambiguity === 'missing-information') return preference === 'provider-default' ? null : 'ask-or-defer';
  return null;
}

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
