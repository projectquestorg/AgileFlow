import path from 'node:path';
import YAML from 'yaml';
import { MAX_DESCRIPTION_LENGTH, MAX_NAME_LENGTH, pathExists, SKILL_NAME_RE, writeFileAtomic } from '@agileflow/core';
import { lintSkill } from '@agileflow/evals';
import type { Cli } from '../runtime';
import { EXIT, findProject, UsageError } from '../runtime';

export interface CreateOptions {
  dir?: string;
  description?: string;
  trigger?: string[];
  notTrigger?: string[];
  scope?: string;
  manual?: boolean;
  json?: boolean;
}

function title(name: string): string {
  return name
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Optional scenario fields, as commented template lines (a real `fixture:` needs `--fixtures <dir>` to run). */
const FIXTURE_HINT =
  '# fixture: my-repo   # optional: run in <fixtures dir>/my-repo (agileflow eval --fixtures <dir>); default is an empty Node project\n';
const NEIGHBOR_HINT =
  '# neighbor: other-skill   # set when this prompt belongs to a similar skill in your catalog (measures trigger conflicts)\n';

function scenario(
  name: string,
  skill: string,
  prompt: string,
  activate: boolean,
  manual: boolean,
  extra: { description?: string; rubric?: string[] } = {},
): string {
  const doc: Record<string, unknown> = {
    name,
    skill,
    ...(extra.description ? { description: extra.description } : {}),
    prompt: `${prompt.trim()}\n`,
    invocation: activate && manual ? 'explicit' : 'implicit',
    assert: { shouldActivate: activate },
  };
  if (activate) {
    doc.rubric = extra.rubric ?? [
      'follows the steps in the Workflow section in order',
      'meets every item in the "Done when" section before finishing',
    ];
  }
  return YAML.stringify(doc, { lineWidth: 0 }) + FIXTURE_HINT + (activate ? '' : NEIGHBOR_HINT);
}

/** Rubric for the blocked-path template: the skill stops and reports instead of guessing. */
const BLOCKED_RUBRIC = [
  'stops at the blocker instead of guessing or silently working around it',
  'tells the user what is missing or failed and what they need to do next',
  'does not claim the task is complete',
];

/**
 * `agileflow create <name>`: scaffold a standard Agent Skill that passes the
 * release-gate lint (SKILL.md with a "Done when" section, a sidecar, and
 * three eval scenarios including negatives), ready to edit, lint, and add.
 */
export async function runCreate(cli: Cli, name: string, options: CreateOptions): Promise<number> {
  const { ctx, out, prompter } = cli;
  if (!SKILL_NAME_RE.test(name) || name.length > MAX_NAME_LENGTH) {
    throw new UsageError(`Skill names are lowercase letters, digits, and single hyphens (max ${MAX_NAME_LENGTH}): ${name}`, [
      'Use a verb-led name that says what the workflow does, e.g. releasing-packages.',
    ]);
  }
  const scopeName = options.scope ?? 'local';
  if (!/^[a-z0-9][a-z0-9-]*$/.test(scopeName)) throw new UsageError('--scope must be lowercase letters, digits, and hyphens');
  const project = await findProject(ctx);
  const base = path.resolve(ctx.cwd, options.dir ?? (project ? path.join(project, 'skills') : 'skills'));
  const dir = path.join(base, name);
  if (await pathExists(dir)) throw new UsageError(`${dir} already exists`);
  if (path.basename(base) === 'skills' && path.basename(path.dirname(base)) === '.agents') {
    out.warn('Creating the source directly in .agents/skills: its evals/ folder will be visible to agents. Prefer a separate skills/ directory and `agileflow add ./skills/<name>`.');
  }

  let description = options.description?.trim();
  let triggers = options.trigger ?? [];
  let notTriggers = options.notTrigger ?? [];
  if (prompter.interactive) {
    if (!description) {
      description = (
        await prompter.text(
          'Description: what does it do, and when should an agent use it?',
          'Prepares a release. Use when the user asks to cut, tag, or publish a new version. Not for changelog-only edits.',
        )
      ).trim();
    }
    if (!triggers.length) {
      const t = (await prompter.text('A request that SHOULD use this skill')).trim();
      if (t) triggers = [t];
    }
    if (!notTriggers.length) {
      const n = (await prompter.text('A similar request that should NOT use it')).trim();
      if (n) notTriggers = [n];
    }
  }
  if (!description) {
    throw new UsageError('Pass --description "<what it does>. Use when <situation>. Not for <similar requests>."', [
      'The description is how agents decide to load the skill: say what it does and when.',
    ]);
  }
  if (description.length > MAX_DESCRIPTION_LENGTH) throw new UsageError(`description is longer than ${MAX_DESCRIPTION_LENGTH} characters`);
  if (!/\bwhen\b/i.test(description)) {
    throw new UsageError('The description must say when to activate, e.g. "... Use when the user asks to ..."');
  }
  if (!triggers.length || !notTriggers.length) {
    throw new UsageError('Pass at least one --trigger "<request that should use it>" and one --not-trigger "<similar request that should not>"', [
      'They become eval scenarios that measure activation precision and recall.',
    ]);
  }

  const hasNotFor = /\bnot for\b/i.test(description);
  const skillMd = [
    '---',
    `name: ${name}`,
    `description: ${JSON.stringify(description)}`,
    // Routing needs both sides: when to use it, and which similar requests belong elsewhere.
    ...(hasNotFor ? [] : ['# TODO: end the description with "Not for <similar requests that belong to another skill>."']),
    '---',
    '',
    `# ${title(name)}`,
    '',
    'Write the repeatable process an agent should follow, not general knowledge the model already has.',
    'Keep this file short (30-120 lines); move long reference material into references/ and link it.',
    '',
    '## Workflow',
    '',
    '1. Gather the facts the task depends on from the repository before changing anything.',
    '2. If a choice would materially change the result and the repository cannot settle it, ask the user before choosing.',
    '3. Do the work in small, verifiable steps, following the project\'s conventions.',
    '4. Verify the result with the project\'s own checks (tests, build, linters).',
    '5. If something blocks the work (a missing tool, a failing prerequisite), stop and report it instead of working around it.',
    '',
    'Detail needed only sometimes lives in [references/details.md](references/details.md); read it when a step calls for it.',
    '',
    '## Done when',
    '',
    '- The requested change is complete and verified, or the blocker is reported.',
    '- The user has a short summary of what changed and anything left open.',
    '',
  ].join('\n');
  const reference = [
    `# ${title(name)}: reference`,
    '',
    'Material the agent needs only for some runs: long checklists, command references, examples.',
    'SKILL.md links here, so it is read on demand instead of loading with every activation.',
    'Delete this file (and the link in SKILL.md) if the skill does not need it.',
    '',
  ].join('\n');
  const sidecar = YAML.stringify(
    {
      schema: 1,
      package: { name: `@${scopeName}/${name}`, version: '0.1.0' },
      activation: { mode: options.manual ? 'manual' : 'auto' },
      requirements: { commands: [], network: 'none' },
      // Matches the Workflow above: it may edit files and asks only when a decision matters.
      capabilities: { modifiesFiles: 'possible', longRunning: false, userInteraction: 'optional' },
      compatibility: { agentSkills: true },
    },
    { lineWidth: 0 },
  );
  const files: Record<string, string> = {
    'SKILL.md': skillMd,
    'agileflow.skill.yaml': sidecar,
    'references/details.md': reference,
  };
  triggers.forEach((t, i) => {
    const n = `should-activate-${i + 1}`;
    files[`evals/${n}.yaml`] = scenario(n, name, t, true, !!options.manual);
  });
  notTriggers.forEach((t, i) => {
    const n = `should-not-activate-${i + 1}`;
    files[`evals/${n}.yaml`] = scenario(n, name, t, false, !!options.manual);
  });
  // Failure path: in scope, but the work cannot be completed. Edit the prompt (or add a
  // `setup:` script) so the blocker is real.
  files['evals/blocked-path.yaml'] = scenario('blocked-path', name, triggers[0]!, true, !!options.manual, {
    description:
      'TEMPLATE: an in-scope request that cannot be completed (a prerequisite is missing, a command fails, or only the user can decide). Make the blocker real in the prompt or a setup script; the rubric checks the skill stops and reports instead of guessing.',
    rubric: BLOCKED_RUBRIC,
  });
  if (triggers.length + notTriggers.length < 3) {
    files['evals/unrelated-question.yaml'] = scenario(
      'unrelated-question',
      name,
      'Explain the difference between a process and a thread in general terms.',
      false,
      !!options.manual,
    );
  }
  for (const [rel, content] of Object.entries(files)) await writeFileAtomic(path.join(dir, ...rel.split('/')), content);

  const lint = await lintSkill(dir);
  const rel = path.relative(ctx.cwd, dir) || '.';
  if (options.json) {
    out.json({ ok: true, dir, files: Object.keys(files), lint });
    return EXIT.OK;
  }
  out.line(`Created ${rel}/`);
  for (const f of Object.keys(files)) out.line(`  ${f}`);
  const problems = lint.issues.filter((i) => i.level !== 'info');
  out.line(problems.length ? `Lint: ${problems.map((p) => p.message).join('; ')}` : 'Lint: passes the release gate.');
  out.line();
  out.line('Next:');
  out.line(`  Edit ${rel}/SKILL.md: replace the generic workflow with your team's steps.`);
  if (!hasNotFor) out.line('  Add a "Not for ..." clause to the description (see the TODO in the frontmatter).');
  out.line(`  Edit ${rel}/evals/blocked-path.yaml so its blocker is real.`);
  out.line(`  Check it:   agileflow eval --lint ${rel}`);
  out.line(`  Measure it: agileflow eval ${rel} --provider claude (activation precision and recall)`);
  out.line(`  Use it:     agileflow add ./${rel.split(path.sep).join('/')}`);
  return EXIT.OK;
}
