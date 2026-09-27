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

function scenario(name: string, skill: string, prompt: string, activate: boolean, manual: boolean): string {
  const doc: Record<string, unknown> = {
    name,
    skill,
    prompt: `${prompt.trim()}\n`,
    invocation: activate && manual ? 'explicit' : 'implicit',
    assert: { shouldActivate: activate },
  };
  if (activate) {
    doc.rubric = [
      'follows the steps in the Workflow section in order',
      'meets every item in the "Done when" section before finishing',
    ];
  }
  return YAML.stringify(doc, { lineWidth: 0 });
}

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
          'Prepares a release. Use when the user asks to cut, tag, or publish a new version.',
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
    throw new UsageError('Pass --description "<what it does>. Use when <situation>."', [
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

  const skillMd = [
    '---',
    `name: ${name}`,
    `description: ${JSON.stringify(description)}`,
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
    '2. Do the work in small, verifiable steps, following the project\'s conventions.',
    '3. Verify the result with the project\'s own checks (tests, build, linters).',
    '',
    '## Done when',
    '',
    '- The requested change is complete and verified.',
    '- The user has a short summary of what changed and anything left open.',
    '',
  ].join('\n');
  const sidecar = YAML.stringify(
    {
      schema: 1,
      package: { name: `@${scopeName}/${name}`, version: '0.1.0' },
      activation: { mode: options.manual ? 'manual' : 'auto' },
      requirements: { commands: [], network: 'none' },
      capabilities: { modifiesFiles: 'possible', longRunning: false, userInteraction: 'none' },
      compatibility: { agentSkills: true },
    },
    { lineWidth: 0 },
  );
  const files: Record<string, string> = {
    'SKILL.md': skillMd,
    'agileflow.skill.yaml': sidecar,
  };
  triggers.forEach((t, i) => {
    const n = `should-activate-${i + 1}`;
    files[`evals/${n}.yaml`] = scenario(n, name, t, true, !!options.manual);
  });
  notTriggers.forEach((t, i) => {
    const n = `should-not-activate-${i + 1}`;
    files[`evals/${n}.yaml`] = scenario(n, name, t, false, !!options.manual);
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
  out.line(`  Check it:   agileflow eval --lint ${rel}`);
  out.line(`  Measure it: agileflow eval ${rel} --provider claude (activation precision and recall)`);
  out.line(`  Use it:     agileflow add ./${rel.split(path.sep).join('/')}`);
  return EXIT.OK;
}
