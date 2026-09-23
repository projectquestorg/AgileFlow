import { Command, CommanderError, Option } from 'commander';
import { ConfigError, createContext, OperationError, type ContextOverrides } from '@agileflow/core';
import { runAdd } from './commands/add';
import { runCheck } from './commands/check';
import { runConfigure } from './commands/configure';
import { runDiff } from './commands/diff';
import { runEval } from './commands/eval';
import { runFork } from './commands/fork';
import { runInit } from './commands/init';
import { runList } from './commands/list';
import { runMigrate } from './commands/migrate';
import { runRemove } from './commands/remove';
import { runSync } from './commands/sync';
import { runUpdate } from './commands/update';
import { EXIT, UsageError, type Cli } from './runtime';
import { Output, type Writer } from './ui/output';
import { CancelledError, clackPrompter, defaultsPrompter, type Prompter } from './ui/prompts';
import { cliVersion } from './version';

export interface RunOptions extends ContextOverrides {
  stdout?: Writer;
  stderr?: Writer;
  /** Force a prompter (tests). Otherwise interactive only on a TTY outside CI. */
  prompter?: Prompter;
}

const collect = (value: string, previous: string[] = []) => [...previous, value];

const HELP_FOOTER = `
Exit codes:
  0  success
  1  error, invalid usage, or \`check\` found problems
  3  \`update --non-interactive\` skipped skills with local modifications

Skills live in .agents/skills (project) or ~/.agents/skills (personal).
Open Codex, Claude, Cursor, OpenCode, or Gemini as usual; AgileFlow is not
involved while they run.`;

/**
 * Run the CLI. Returns the exit code instead of exiting so tests can call
 * it in-process with a temporary home, cwd, and scripted prompts.
 */
export async function run(argv: string[], options: RunOptions = {}): Promise<number> {
  const ctx = createContext(options);
  const out = new Output(options.stdout ?? process.stdout, options.stderr ?? process.stderr, ctx.env);
  const wantsYes = argv.includes('--yes') || argv.includes('-y') || argv.includes('--non-interactive');
  const interactiveTerminal =
    !!process.stdin.isTTY && !!process.stdout.isTTY && !ctx.env.CI && !ctx.env.AGILEFLOW_NON_INTERACTIVE;
  const prompter = options.prompter ?? (interactiveTerminal && !wantsYes ? clackPrompter : defaultsPrompter);
  const cli: Cli = { ctx, out, prompter };
  let exitCode: number = EXIT.OK;
  const setExit = (code: number) => {
    exitCode = code;
  };

  // v5 has no hook command. Stale v4 hook entries that still call it get a
  // clear pointer (exit 1 is a non-blocking hook error; never exit 2).
  if (argv[2] === 'hook') {
    out.error('AgileFlow v5 does not use hooks, so `agileflow hook` no longer exists.', [
      'Run `agileflow migrate v4` to remove the old hook entries from your provider settings.',
    ]);
    return EXIT.ERROR;
  }

  const program = new Command();
  program
    .name('agileflow')
    .description('Portable workflows for coding agents: install, update, fork, and evaluate Agent Skills.')
    .version(cliVersion(), '-v, --version')
    .showHelpAfterError()
    .addHelpText('after', HELP_FOOTER)
    .configureOutput({
      writeOut: (s) => out.stdout.write(s),
      writeErr: (s) => out.stderr.write(s),
    })
    .exitOverride();

  program
    .command('init')
    .description('Set up AgileFlow in this repository (or personal skills with --global)')
    .option('-y, --yes', 'non-interactive: install only the core pack')
    .option('-g, --global', 'set up personal skills in ~/.agents/skills')
    .option('--skills <ids>', 'comma-separated skills to install instead of asking')
    .action(async (opts) => setExit(await runInit(cli, opts)));

  program
    .command('add')
    .description('Add skills, packs, git+ sources, or local paths')
    .argument('[targets...]', 'e.g. diagnosing-bugs, @agileflow/github, git+https://host/repo.git#skills/x, ./skills/mine')
    .option('-g, --global', 'add to personal skills (~/.agents/skills)')
    .option('-y, --yes', 'skip the confirmation')
    .option('--activation <mode>', 'auto or manual')
    .option('--skill <name>', 'pick a skill from a multi-skill source (repeatable)', collect)
    .action(async (targets, opts) => setExit(await runAdd(cli, targets, opts)));

  program
    .command('remove')
    .description('Remove skills AgileFlow manages (never unmanaged ones)')
    .argument('[skills...]')
    .option('-g, --global', 'remove from personal skills')
    .option('-f, --force', 'discard local modifications')
    .option('--all', 'stop using AgileFlow in this scope (removes agileflow.yaml and agileflow.lock)')
    .addOption(new Option('--keep-skills', 'with --all: keep skills as standalone Agent Skills (default)').default(undefined))
    .option('--delete-skills', 'with --all: delete unmodified AgileFlow skills')
    .option('-y, --yes', 'do not ask')
    .action(async (ids, opts) =>
      setExit(await runRemove(cli, ids, { ...opts, keepSkills: opts.deleteSkills ? false : opts.keepSkills })),
    );

  program
    .command('list')
    .description('Show installed skills and how each provider sees them')
    .option('-g, --global', 'personal skills only')
    .option('--json', 'machine-readable output')
    .action(async (opts) => setExit(await runList(cli, opts)));

  program
    .command('sync')
    .description('Make the filesystem match agileflow.lock (no version changes)')
    .option('-g, --global', 'personal skills')
    .action(async (opts) => setExit(await runSync(cli, opts)));

  program
    .command('update')
    .description('Resolve newer versions allowed by agileflow.yaml, update the lockfile, and sync')
    .argument('[skills...]')
    .option('-g, --global', 'personal skills')
    .option('--non-interactive', 'never prompt; skip locally modified skills (exit 3)')
    .option('--reset <skill>', 'discard local modifications of this skill (repeatable)', collect)
    .option('--dry-run', 'show what would change')
    .option('-y, --yes', 'apply without confirming')
    .action(async (ids, opts) => setExit(await runUpdate(cli, ids, opts)));

  program
    .command('check')
    .description('Check configuration, skills, and provider visibility')
    .option('-g, --global', 'personal skills only')
    .option('--verbose', 'include paths, link types, versions, and hashes')
    .option('--fix', 'repair AgileFlow-owned artifacts only (never your edits or provider settings)')
    .option('--json', 'machine-readable output')
    .action(async (opts) => setExit(await runCheck(cli, opts)));

  program
    .command('configure')
    .description('Configure skills, providers, structured questions, and defaults')
    .argument('[topic...]', 'skill <id> | provider <id> <auto|on|off> | codex-questions <enable|disable|status> | question-preference <value>')
    .option('-g, --global', 'personal scope')
    .option('--activation <mode>', 'with `skill`: auto or manual')
    .option('--enable', 'with `skill`: enable')
    .option('--disable', 'with `skill`: disable (removes its files unless modified)')
    .option('-y, --yes', 'do not ask for confirmation')
    .action(async (args, opts) => setExit(await runConfigure(cli, args, opts)));

  program
    .command('fork')
    .description('Take ownership of a managed skill; updates will never overwrite it')
    .argument('<skill>')
    .option('-g, --global', 'personal skills')
    .action(async (id, opts) => setExit(await runFork(cli, id, opts)));

  program
    .command('diff')
    .description('Show local changes to a skill, or a fork vs the latest upstream (--upstream)')
    .argument('<skill>')
    .option('-g, --global', 'personal skills')
    .option('--upstream', 'compare your copy with the latest upstream version')
    .action(async (id, opts) => setExit(await runDiff(cli, id, opts)));

  program
    .command('migrate')
    .description('Migrate a v4 project to v5 (preview first), or --detach from AgileFlow')
    .argument('[from]', 'v4')
    .option('--preview', 'report what would change without changing anything')
    .option('--report-docs', 'report legacy docs directories (never deleted)')
    .option('-y, --yes', 'apply without prompting')
    .option('--no-backup', 'do not copy changed files to .agileflow-v4-backup-<timestamp>/')
    .option('--skills <ids>', 'v5 skills to install after migrating')
    .option('--detach', 'stop using AgileFlow here but keep skills working (same as remove --all)')
    .addOption(new Option('--keep-skills', 'with --detach: keep skills (default)').default(undefined))
    .option('--delete-skills', 'with --detach: delete unmodified AgileFlow skills')
    .action(async (from, opts) => {
      const backup = argv.includes('--no-backup') ? false : argv.includes('--backup') ? true : undefined;
      setExit(
        await runMigrate(cli, from, {
          ...opts,
          backup,
          keepSkills: opts.deleteSkills ? false : opts.keepSkills,
        }),
      );
    });

  program
    .command('eval')
    .description('Check skills against the release gate, or run activation/behavior evals on a provider')
    .argument('[skills...]', 'skill names or directories')
    .option('--lint', 'structural release-gate checks only')
    .option('--catalog <dir>', 'evaluate every skill in this directory (and install them all in the sandbox)')
    .option('--provider <ids>', 'claude, codex, gemini, opencode (comma-separated)')
    .option('--mode <mode>', 'activation (read-only, default) or full (behavior + rubric judging)')
    .option('--runs <n>', 'runs per scenario')
    .option('--judge <id>', 'rubric judge: claude (default in full mode) or none')
    .option('--model <model>', 'model passed to the provider')
    .option('--fixtures <dir>', 'fixture repositories directory')
    .option('--pass-rate <n>', 'fraction of runs whose activation must match (default 1)')
    .option('--rubric-threshold <n>', 'fraction of rubric items that must pass (default 0.75)')
    .option('--timeout <seconds>', 'per-run timeout')
    .option('--scenario <name>', 'only run this scenario (repeatable)', collect)
    .option('--json', 'machine-readable output')
    .option('--out <file>', 'write a JSON report')
    .option('--keep', 'keep sandboxes for inspection')
    .action(async (skills, opts) => setExit(await runEval(cli, skills, opts)));

  // Transition shims; not advertised.
  program
    .command('doctor', { hidden: true })
    .option('--verbose')
    .option('--fix')
    .action(async (opts) => {
      out.line('`agileflow doctor` was renamed to `agileflow check` in v5.');
      out.line('Running check...');
      out.line();
      setExit(await runCheck(cli, opts));
    });

  try {
    await program.parseAsync(argv, { from: 'node' });
  } catch (err) {
    if (err instanceof CommanderError) {
      if (err.code === 'commander.helpDisplayed' || err.code === 'commander.version' || err.code === 'commander.help') {
        return EXIT.OK;
      }
      return EXIT.ERROR;
    }
    if (err instanceof CancelledError) {
      out.line('Cancelled. Nothing else was changed.');
      return EXIT.ERROR;
    }
    if (err instanceof UsageError || err instanceof OperationError) {
      out.error(err.message, err instanceof UsageError ? err.hints : (err.hint ?? []));
      return EXIT.ERROR;
    }
    if (err instanceof ConfigError) {
      out.error(err.message, [`File: ${err.file}`]);
      return EXIT.ERROR;
    }
    out.error((err as Error).message ?? String(err));
    if (ctx.env.AGILEFLOW_DEBUG) out.stderr.write(`${(err as Error).stack}\n`);
    return EXIT.ERROR;
  }
  return exitCode;
}

const isEntrypoint = (() => {
  try {
    const entry = process.argv[1] ? new URL(`file://${process.argv[1]}`).pathname : '';
    return import.meta.url.endsWith('/src/index.ts') && entry.endsWith('/src/index.ts');
  } catch {
    return false;
  }
})();

if (isEntrypoint) {
  run(process.argv).then((code) => process.exit(code));
}
