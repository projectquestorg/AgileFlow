import { Command, CommanderError, Option } from 'commander';
// Startup imports stay light: the context module (node builtins only) instead of
// all of @agileflow/core, and commands, runtime, prompts, zod, and yaml are
// loaded only when a command needs them (`--version`/`--help` load none).
import { createContext, type ContextOverrides } from '../../../packages/core/src/context';
import { appendHistory } from './history';
import type { Cli } from './runtime';
import { Output, type Writer } from './ui/output';
import type { Prompter } from './ui/prompts';
import { cliVersion } from './version';

/** Same values as `EXIT` in ./runtime (kept here so startup does not load it). Never 2. */
const EXIT = { OK: 0, ERROR: 1 } as const;

/** A prompter whose implementation (and @clack/prompts) loads on the first question. */
function lazyPrompter(interactive: boolean): Prompter {
  const load = async () => {
    const m = await import('./ui/prompts');
    return interactive ? m.clackPrompter : m.defaultsPrompter;
  };
  return {
    interactive,
    select: async (message, choices, initial) => (await load()).select(message, choices, initial),
    multiselect: async (message, choices, initial, required) => (await load()).multiselect(message, choices, initial, required),
    confirm: async (message, initial) => (await load()).confirm(message, initial),
    text: async (message, placeholder) => (await load()).text(message, placeholder),
  };
}

export interface RunOptions extends ContextOverrides {
  stdout?: Writer;
  stderr?: Writer;
  /** Force a prompter (tests). Otherwise interactive only on a TTY outside CI. */
  prompter?: Prompter;
  /** Injected effects for `agileflow cloud` (tests): fetch, credential store, browser, clock. */
  cloud?: Cli['cloud'];
}

const collect = (value: string, previous: string[] = []) => [...previous, value];

const HELP_FOOTER = `
Global options (any command): --json, --offline, --debug, --no-color.
Environment: AGILEFLOW_REGISTRY, AGILEFLOW_OFFLINE=1, AGILEFLOW_NON_INTERACTIVE=1,
AGILEFLOW_ALLOW_INSECURE=1, AGILEFLOW_NO_HISTORY=1, AGILEFLOW_DEBUG=1.

Exit codes:
  0  success
  1  error, invalid usage, or \`check\`/\`verify\` found problems
  3  a non-interactive \`update\` skipped skills that need a decision (local
     modifications, or third-party changes not approved with --yes)

Skills live in .agents/skills (project) or ~/.agents/skills (personal).
Open Codex, Claude, Cursor, OpenCode, or Gemini as usual; AgileFlow is not
involved while they run. Problems? Run \`agileflow check\`.`;

/** The eval command's exit codes (the only copy: \`agileflow eval --help\` and the docs describe these). */
const EVAL_EXIT_HELP = `Exit codes:
  0  every skill passed the release gate, every scenario that ran passed, and every
     --compare/--pack comparison improved or showed no measurable difference
  1  a skill failed the gate, a scenario failed or was inconclusive (setup, provider
     crash or timeout, judge failure, isolation leak, criteria left ungraded), the
     preflight found a problem, a comparison regressed or was inconclusive, a
     question-preference comparison is out of order, or the command was used incorrectly
  130/143  interrupted (SIGINT/SIGTERM); a partial report is written with complete: false`;

/** Commands whose runs are recorded in `agileflow history`. */
const RECORDED = new Set(['init', 'add', 'remove', 'sync', 'update', 'configure', 'fork', 'migrate', 'work']);

/** Friendly messages for filesystem errors users can act on. */
function systemErrorHints(err: NodeJS.ErrnoException): string[] {
  switch (err.code) {
    case 'ENOSPC':
      return ['The disk is full. Free some space and run the command again; nothing half-written was kept.'];
    case 'EACCES':
    case 'EPERM':
      return [`Permission denied${err.path ? ` for ${err.path}` : ''}. Check the file's owner and permissions (and close editors or agents holding it on Windows).`];
    case 'EROFS':
      return ['The file system is read-only.'];
    case 'EMFILE':
    case 'ENFILE':
      return ['Too many open files; close other programs or raise the open-file limit.'];
    default:
      return [];
  }
}

/**
 * Run the CLI. Returns the exit code instead of exiting so tests can call
 * it in-process with a temporary home, cwd, and scripted prompts.
 */
export async function run(argv: string[], options: RunOptions = {}): Promise<number> {
  // Global flags become environment settings so every layer sees them.
  const env = { ...(options.env ?? process.env) };
  if (argv.includes('--offline')) env.AGILEFLOW_OFFLINE = '1';
  if (argv.includes('--debug')) env.AGILEFLOW_DEBUG = '1';
  if (argv.includes('--no-color')) env.NO_COLOR = '1';
  const ctx = createContext({ ...options, env });
  const json = argv.includes('--json');
  const out = new Output(options.stdout ?? process.stdout, options.stderr ?? process.stderr, ctx.env, { json });
  const wantsYes = argv.includes('--yes') || argv.includes('-y') || argv.includes('--non-interactive');
  const interactiveTerminal =
    !!process.stdin.isTTY && !!process.stdout.isTTY && !ctx.env.CI && !ctx.env.AGILEFLOW_NON_INTERACTIVE;
  // JSON output is for scripts: never prompt, whatever prompter was passed in.
  const prompter = json ? lazyPrompter(false) : (options.prompter ?? lazyPrompter(interactiveTerminal && !wantsYes));
  const commandName = argv.slice(2).find((a) => !a.startsWith('-')) ?? '';
  const cli: Cli = { ctx, out, prompter, invocation: { command: commandName, args: argv.slice(3) }, cloud: options.cloud };
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
    .description('Portable workflows for coding agents: find, install, update, fork, verify, and evaluate Agent Skills.')
    .version(cliVersion(), '-v, --version')
    .option('--offline', 'never use the network; work from the package cache')
    .option('--debug', 'print stack traces for unexpected errors')
    .option('--no-color', 'plain output')
    // With --json, a usage error is one JSON document on stdout and one line on stderr (no help dump).
    .showHelpAfterError(!json)
    .addHelpText('after', HELP_FOOTER)
    .configureOutput({
      writeOut: (s) => out.stdout.write(s),
      writeErr: (s) => out.stderr.write(s),
      // With --json the error is the JSON document on stdout (handleError), not text on stderr.
      outputError: (s, write) => {
        if (!json) write(s);
      },
    })
    .exitOverride();

  // Each command module is loaded only when that command runs (fast startup).
  program
    .command('init')
    .description('Set up AgileFlow in this repository (or personal skills with --global)')
    .option('-y, --yes', 'non-interactive: install only the core pack')
    .option('-g, --global', 'set up personal skills in ~/.agents/skills')
    .option('--skills <ids>', 'comma-separated skills to install instead of asking')
    .option('--json', 'machine-readable output')
    .action(async (opts) => setExit(await (await import('./commands/init')).runInit(cli, opts)));

  program
    .command('search')
    .description('Find skills in the official catalog and the skills.sh directory')
    .argument('<query...>', 'words to search for')
    .option('--source <source>', 'all (default), official, or skills.sh')
    .option('--limit <n>', 'results per source (default 20)')
    .option('--json', 'machine-readable output')
    .action(async (words, opts) => setExit(await (await import('./commands/search')).runSearch(cli, words, opts)));

  program
    .command('info')
    .description('Show a skill or pack before installing: versions, license, files, requirements, risk scan')
    .argument('<target>', 'e.g. diagnosing-bugs, diagnosing-bugs@1.0.0, @agileflow/github, owner/repo/skill, ./skills/mine')
    .option('--skill <name>', 'pick one skill from a multi-skill source')
    .option('--ref <ref>', 'git sources: branch, tag, or commit')
    .option('--content', 'also print SKILL.md')
    .option('--json', 'machine-readable output')
    .action(async (target, opts) => setExit(await (await import('./commands/info')).runInfo(cli, target, opts)));

  program
    .command('add')
    .alias('install')
    .description('Add skills, packs, GitHub repositories (owner/repo[/skill]), git+ sources, or local paths')
    .argument('[targets...]', 'e.g. diagnosing-bugs, @agileflow/github, owner/repo/skill, git+https://host/repo.git#skills/x, ./skills/mine')
    .option('-g, --global', 'add to personal skills (~/.agents/skills)')
    .option('-y, --yes', 'skip the confirmation (required for third-party content when not interactive)')
    .option('--activation <mode>', 'auto or manual')
    .option('--skill <name>', 'pick a skill from a multi-skill source (repeatable)', collect)
    .option('--ref <ref>', 'git sources: branch, tag, or commit to track')
    .option('--dry-run', 'resolve and review (files, risk scan) without installing')
    .option('--adopt', 'adopt skills already in .agents/skills or a provider dir (e.g. .claude/skills); previews, then asks (or --yes)')
    .option('--json', 'machine-readable output')
    .action(async (targets, opts) => setExit(await (await import('./commands/add')).runAdd(cli, targets, opts)));

  program
    .command('outdated')
    .description('Show installed skills with the locked, wanted (allowed by the range), and latest versions (read-only)')
    .option('-g, --global', 'personal skills')
    .option('--json', 'machine-readable output')
    .action(async (opts) => setExit(await (await import('./commands/outdated')).runOutdated(cli, opts)));

  program
    .command('remove')
    .description('Remove skills AgileFlow manages (never unmanaged ones)')
    .argument('[skills...]')
    .option('-g, --global', 'remove from personal skills')
    .option('-f, --force', 'discard local modifications')
    .option('--all', 'stop using AgileFlow in this scope (removes agileflow.yaml and agileflow.lock)')
    .addOption(new Option('--keep-skills', 'with --all: keep skills as standalone Agent Skills (default)').default(undefined))
    .option('--delete-skills', 'with --all: delete unmodified AgileFlow skills')
    .option('-y, --yes', 'do not ask (required non-interactively for --all and for --force on modified skills)')
    .option('--dry-run', 'show what would be removed')
    .option('--json', 'machine-readable output')
    .action(async (ids, opts) =>
      setExit(
        await (await import('./commands/remove')).runRemove(cli, ids, {
          ...opts,
          keepSkills: opts.deleteSkills ? false : opts.keepSkills,
        }),
      ),
    );

  program
    .command('list')
    .description('Show installed skills and how each provider sees them')
    .option('-g, --global', 'personal skills only')
    .option('--json', 'machine-readable output')
    .action(async (opts) => setExit(await (await import('./commands/list')).runList(cli, opts)));

  program
    .command('sync')
    .description('Make the filesystem match agileflow.lock (no version changes)')
    .option('-g, --global', 'personal skills')
    .option('--dry-run', 'show what would change without writing anything')
    .option('-y, --yes', 'install third-party content this machine has not installed before (review with --dry-run first)')
    .option('--json', 'machine-readable output')
    .action(async (opts) => setExit(await (await import('./commands/sync')).runSync(cli, opts)));

  program
    .command('update')
    .description('Resolve newer versions allowed by agileflow.yaml, update the lockfile, and sync')
    .argument('[skills...]')
    .option('-g, --global', 'personal skills')
    .option('--non-interactive', 'never prompt; skip skills that need a decision (exit 3)')
    .option('--reset <skill>', 'discard local modifications of this skill (repeatable)', collect)
    .option('--dry-run', 'show what would change (the plan)')
    .option('-y, --yes', 'apply without confirming, including reviewed third-party changes')
    .option('--json', 'machine-readable output')
    .action(async (ids, opts) => setExit(await (await import('./commands/update')).runUpdate(cli, ids, opts)));

  program
    .command('check')
    .alias('doctor')
    .description('Diagnose configuration, skills, and provider visibility (offline)')
    .option('-g, --global', 'personal skills only')
    .option('--verbose', 'include paths, link types, versions, and hashes')
    .option('--fix', 'repair AgileFlow-owned artifacts only (never your edits or provider settings)')
    .option('--json', 'machine-readable output')
    .action(async (opts) => setExit(await (await import('./commands/check')).runCheck(cli, opts)));

  program
    .command('verify')
    .description('Supply-chain check: re-verify locked packages, pins, installed files, and content risks')
    .argument('[skills...]')
    .option('-g, --global', 'personal skills')
    .option('--attestations', 'also verify GitHub (Sigstore) build attestations of official bundles with gh')
    .option('--fail-on <severity>', 'exit 1 when content findings reach this severity: high or medium')
    .option('--sbom', 'print a CycloneDX SBOM of the locked skills (integrity, source, license)')
    .option('--json', 'machine-readable output')
    .action(async (ids, opts) => setExit(await (await import('./commands/verify')).runVerify(cli, ids, opts)));

  program
    .command('configure')
    .alias('config')
    .description('Show or change configuration: skills, providers, structured questions, defaults')
    .argument('[topic...]', 'show | skill <id> | provider <id> <auto|on|off> | codex-questions <enable|disable|status> | question-preference <value>')
    .option('-g, --global', 'personal scope')
    .option('--activation <mode>', 'with `skill`: auto or manual')
    .option('--enable', 'with `skill`: enable')
    .option('--disable', 'with `skill`: disable (removes its files unless modified)')
    .option('-y, --yes', 'do not ask for confirmation')
    .option('--json', 'machine-readable output')
    .action(async (args, opts) => setExit(await (await import('./commands/configure')).runConfigure(cli, args, opts)));

  program
    .command('fork')
    .description('Take ownership of a managed skill; updates will never overwrite it')
    .argument('<skill>')
    .option('-g, --global', 'personal skills')
    .option('--json', 'machine-readable output')
    .action(async (id, opts) => setExit(await (await import('./commands/fork')).runFork(cli, id, opts)));

  program
    .command('diff')
    .description('Show local changes to a skill, or a fork vs the latest upstream (--upstream)')
    .argument('<skill>')
    .option('-g, --global', 'personal skills')
    .option('--upstream', 'compare your copy with the latest upstream version')
    .option('--json', 'machine-readable output')
    .action(async (id, opts) => setExit(await (await import('./commands/diff')).runDiff(cli, id, opts)));

  program
    .command('create')
    .description('Scaffold a new Agent Skill that passes the release-gate lint')
    .argument('<name>', 'skill name: lowercase letters, digits, hyphens (e.g. releasing-packages)')
    .option('--dir <dir>', 'parent directory (default: skills/ in the project)')
    .option('--description <text>', 'what it does, when to use it, and when not ("... Use when ... Not for ...")')
    .option('--trigger <prompt>', 'a request that should use the skill (repeatable; becomes an eval)', collect)
    .option('--not-trigger <prompt>', 'a similar request that should not (repeatable; becomes an eval)', collect)
    .option('--scope <scope>', 'package scope for agileflow.skill.yaml (default local)')
    .option('--manual', 'only activate when invoked by name')
    .option('--json', 'machine-readable output')
    .action(async (name, opts) => setExit(await (await import('./commands/create')).runCreate(cli, name, opts)));

  program
    .command('history')
    .description('Show what AgileFlow changed here (and third-party content you approved)')
    .option('-g, --global', 'personal scope')
    .option('--all', 'every scope on this machine')
    .option('--limit <n>', 'entries to show (default 20)')
    .option('--json', 'machine-readable output')
    .action(async (opts) => setExit(await (await import('./commands/history')).runHistory(cli, opts)));

  program
    .command('migrate')
    .description('Migrate a v4 project to v5 (preview first), or --detach from AgileFlow')
    .argument('[from]', 'v4')
    .option('--preview', 'report what would change without changing anything')
    .option('--dry-run', 'same as --preview')
    .option('--report-docs', 'report legacy docs directories (never deleted)')
    .option('-g, --global', 'migrate your personal v4 install in the home directory (~/.agileflow, ~/.claude, ~/.codex)')
    .addOption(new Option('--user', 'same as --global').hideHelp())
    .option('-y, --yes', 'apply without prompting')
    .option('--no-backup', 'do not copy changed files to .agileflow-v4-backup-<timestamp>/')
    .option('--include-unverified', 'also remove v4 skill mirrors that cannot be verified against v4\'s file index')
    .option('--skills <ids>', 'v5 skills to install after migrating')
    .option('--detach', 'stop using AgileFlow here but keep skills working (same as remove --all)')
    .addOption(new Option('--keep-skills', 'with --detach: keep skills (default)').default(undefined))
    .option('--delete-skills', 'with --detach: delete unmodified AgileFlow skills')
    .option('--json', 'machine-readable output (plan with --preview/--dry-run)')
    .action(async (from, opts) => {
      const backup = argv.includes('--no-backup') ? false : argv.includes('--backup') ? true : undefined;
      setExit(await (await import('./commands/migrate')).runMigrate(cli, from, { ...opts, backup }));
    });

  program
    .command('eval')
    .description('Check skills against the release gate, or run activation/behavior evals on a provider')
    .argument('[skills...]', 'skill names, skill directories, or directories of skills')
    .option('--lint', 'structural release-gate checks only')
    .option('--catalog <dir>', 'evaluate every skill in this directory (and install them all in the sandbox)')
    .option('--provider <ids>', 'claude, codex, gemini, opencode (comma-separated; several print a comparison)')
    .option('--mode <mode>', 'activation (read-only, default) or full (behavior + rubric judging)')
    .option('--runs <n>', 'runs per scenario (default 1; >1 reports 95% confidence intervals)')
    .option('--judge <id>', 'rubric judge: claude (default in full mode) or none')
    .option('--judge-model <model>', 'model for the Claude judge (never taken from --model)')
    .option('--model <model>', 'model passed to the provider under test')
    .option('--fixtures <dir>', 'fixture repositories directory')
    .option('--pass-rate <n>', 'fraction (0-1] of runs whose activation must match (default 1)')
    .option('--rubric-threshold <n>', 'fraction [0-1] of rubric items that must pass (default 0.75)')
    .option('--timeout <seconds>', 'per-run timeout (default 300)')
    .option('--scenario <name>', 'only run this scenario (repeatable)', collect)
    .option('--question-preference <value>', 'sandbox interaction.questionPreference: provider-default, prefer, minimize, or all (runs each and compares)')
    .option('--no-isolate', 'run providers with your real HOME (personal skills and settings apply)')
    .option('--allow-setup', 'run scenario setup scripts and bin commands of skills not from the official registry (local directories included)')
    .option('--json', 'machine-readable output (schemaVersion 2)')
    .option('--out <file>', 'write a JSON report (rewritten after each scenario; raw transcripts saved next to it)')
    .option('--keep', 'keep sandboxes for inspection')
    .option('--compare [arms]', 'compare the skill across arms: baseline (not installed), released, candidate (the skill you pass); default all three with --mode full, else released,candidate')
    .option('--released <version|dir>', 'with --compare: the released copy (default: the version this project locks, else the latest published)')
    .option('--pack <name|installed>', 'install a whole pack together and report which skill activated for which request; with --compare, the pack without vs with the skills you pass')
    .option('--seed <n>', 'with --compare: seed for the randomized arm order (recorded in the report)')
    .addHelpText('after', `\n${EVAL_EXIT_HELP}`)
    .action(async (skills, opts) => setExit(await (await import('./commands/eval')).runEval(cli, skills, opts)));

  const work = program
    .command('work')
    .description('Agile Work (optional): product, roadmap, epics, stories, and decisions as Markdown')
    .addHelpText(
      'after',
      '\nThe workspace (docs/agile by default) holds 00-product, 01-roadmap, 02-epics, 03-stories, 04-decisions.\nIDs accept unambiguous prefixes: `agileflow work show 3Q7M`. `agileflow check` validates the workspace.',
    );
  const workCommands = () => import('./commands/work');

  work
    .command('init')
    .description('Enable Work: configure agileflow.yaml, create the workspace, add the Agile skills')
    .option('--root <dir>', 'workspace directory relative to the project', 'docs/agile')
    .option('-y, --yes', 'do not ask (adopts a compatible existing workspace)')
    .option('--no-skills', 'do not install the Agile workflow skills')
    .option('--json', 'machine-readable output')
    .action(async (opts, cmd) =>
      setExit(
        await (await workCommands()).runWorkInit(cli, {
          ...opts,
          root: cmd.getOptionValueSource('root') === 'default' ? undefined : opts.root,
        }),
      ),
    );

  work
    .command('new')
    .description('Create an epic, story, or decision')
    .argument('<type>', 'epic, story, or decision')
    .requiredOption('--title <title>', 'title')
    .option('--epic <id>', 'story: parent epic (full ID or unambiguous prefix)')
    .option('--priority <p>', 'epic/story: p0, p1, p2, or p3')
    .option('--horizon <h>', 'epic: now, next, or later')
    .option('--status <status>', 'initial status (default: epic proposed, story backlog, decision proposed)')
    .option('--depends-on <ids>', 'story: stories this one cannot finish before (repeatable or comma-separated)', collect)
    .option('--related <ids>', 'decision: related epics, stories, or decisions (repeatable or comma-separated)', collect)
    .option('--json', 'machine-readable output')
    .action(async (type, opts) => setExit(await (await workCommands()).runWorkNew(cli, type, opts)));

  work
    .command('list')
    .description('List work items (epics grouped by horizon, stories, decisions)')
    .option('--type <type>', 'epic, story, or decision (plural accepted)')
    .option('--status <status>', 'only this status')
    .option('--epic <id>', 'stories of this epic')
    .option('--ready', 'stories that can start now: ready or backlog, every dependency done')
    .option('--json', 'machine-readable output')
    .action(async (opts) => setExit(await (await workCommands()).runWorkList(cli, opts)));

  work
    .command('show')
    .description('Show one item with derived relationships (stories of an epic, dependencies, criteria)')
    .argument('<id>', 'full ID or unambiguous prefix, e.g. 3Q7M')
    .option('--body', 'also print the Markdown body')
    .option('--json', 'machine-readable output')
    .action(async (id, opts) => setExit(await (await workCommands()).runWorkShow(cli, id, opts)));

  work
    .command('status')
    .description('Set the status of an epic, story, or decision (only the status line changes)')
    .argument('<id>', 'full ID or unambiguous prefix')
    .argument('<status>', 'new status')
    .option('--force', 'apply even when it cannot close cleanly (e.g. an epic with unfinished stories)')
    .option('--json', 'machine-readable output')
    .action(async (id, status, opts) => setExit(await (await workCommands()).runWorkStatus(cli, id, status, opts)));

  work
    .command('board')
    .description('Show the board, computed from story frontmatter (nothing is written)')
    .option('--json', 'machine-readable output')
    .action(async (opts) => setExit(await (await workCommands()).runWorkBoard(cli, opts)));

  work
    .command('import')
    .description('Import a v4 backlog (docs/05-epics, docs/06-stories, docs/09-agents/status.json) as Work items')
    .argument('<from>', 'v4')
    .option('--preview', 'show what would be imported without writing anything')
    .option('-y, --yes', 'import without asking')
    .option('--prefer <side>', 'when status.json and Markdown disagree: json or markdown (default: hold those items back)')
    .option('--json', 'machine-readable output')
    .action(async (from, opts) => setExit(await (await workCommands()).runWorkImport(cli, from, opts)));

  work
    .command('next')
    .description('Stories that can be picked up now (ready, every dependency done), best first, with reasons; read-only')
    .option('--epic <id>', 'only stories of this epic')
    .option('--limit <n>', 'how many to show (default 5)')
    .option('--explain', 'also explain why the top stories that are not eligible are not')
    .option('--json', 'machine-readable output')
    .action(async (opts) => setExit(await (await workCommands()).runWorkNext(cli, opts)));

  work
    .command('evidence')
    .description('Show or record evidence per acceptance criterion (verified / stale / not verified)')
    .argument('<id>', 'story ID or unambiguous prefix')
    .option('--criterion <n|text>', 'record: criterion number (1-based) or its text')
    .option('--kind <kind>', 'record: test, inspection, pr, or manual')
    .option('--ref <ref>', 'record: test name or file:line, inspected file:line, PR URL, or what was checked')
    .option('--note <text>', 'record: short note')
    .option('--file <path>', 'record: file the evidence depends on, hashed to detect staleness (repeatable or comma-separated)', collect)
    .option('--json', 'machine-readable output')
    .action(async (id, opts) => setExit(await (await workCommands()).runWorkEvidence(cli, id, opts)));

  program
    .command('registry')
    .description('Build or check a static skill registry for your team (private catalog, same format as the official one)')
    .argument('<action>', 'build or check')
    .option('--skills <dir>', 'skill directories (default skills)')
    .option('--packs <dir>', 'pack files (default packs)')
    .option('--out <dir>', 'output directory (default registry)')
    .option('--scope <scope>', 'package scope of your skills, e.g. myorg for @myorg/<skill>')
    .option('--json', 'machine-readable output')
    .action(async (action, opts) => setExit(await (await import('./commands/registry')).runRegistry(cli, action, opts)));

  const cloud = program
    .command('cloud')
    .description('Connected mode (optional): sign in to an AgileFlow service, bind this checkout, work, import/export, local companion')
    .addHelpText('after', '\nConnected mode is opt-in. Local projects never need it. Credentials are kept in the OS credential store; .agileflow/connection.json holds no secrets.');
  const cloudCommands = () => import('./commands/cloud');
  const svc = (c: Command) => c.option('--service <url>', 'AgileFlow service URL (default: from .agileflow/connection.json or AGILEFLOW_CLOUD_URL)');
  svc(cloud.command('login'))
    .description('Sign in with your browser (OAuth + PKCE); requests only read access unless you add --scope')
    .option('--scope <scope>', 'extra OAuth scope, e.g. agileflow:work:write (repeatable)', collect)
    .option('--resource <resource>', 'cli (default) or local-control')
    .option('--insecure-file-store', 'store credentials as plaintext in ~/.agileflow/credentials.json when no OS credential store exists')
    .option('--json', 'machine-readable output')
    .action(async (opts) => setExit(await (await cloudCommands()).runCloudLogin(cli, opts)));
  svc(cloud.command('logout'))
    .description('Delete local credentials (revoke remote access in the dashboard Connections page)')
    .option('--resource <resource>', 'only cli or local-control')
    .option('--json', 'machine-readable output')
    .action(async (opts) => setExit(await (await cloudCommands()).runCloudLogout(cli, opts)));
  svc(cloud.command('status'))
    .description('Registered, reachable, authorized, and operation verified: four separate checks')
    .option('--json', 'machine-readable output')
    .action(async (opts) => setExit(await (await cloudCommands()).runCloudStatus(cli, opts)));
  svc(cloud.command('connect'))
    .description('Bind this checkout to a cloud project (.agileflow/connection.json, no tokens)')
    .requiredOption('--project <id>', 'project ID')
    .option('--json', 'machine-readable output')
    .action(async (opts) => setExit(await (await cloudCommands()).runCloudConnect(cli, opts)));
  cloud
    .command('disconnect')
    .description('Remove the binding from this checkout (cloud data is untouched)')
    .option('--json', 'machine-readable output')
    .action(async () => setExit(await (await cloudCommands()).runCloudDisconnect(cli)));
  svc(cloud.command('work'))
    .description('Connected work: list, show <id>, create <kind> <title...>, move <id> <status>, note <text...>')
    .argument('<action>', 'list, show, create, move, or note')
    .argument('[args...]', 'action arguments')
    .option('--project <id>', 'project ID (default: the connected project)')
    .option('--type <type>', 'list: epic, story, or decision')
    .option('--status <status>', 'list: only this status; create: initial status')
    .option('--epic <id>', 'list: stories of this epic; create: parent epic')
    .option('--search <text>', 'list: search')
    .option('--limit <n>', 'list: at most n items (default 50)')
    .option('--body <markdown>', 'create: body')
    .option('--priority <p>', 'create: p0-p3')
    .option('--horizon <h>', 'create: now, next, or later')
    .option('--reason <text>', 'move: reason')
    .option('--work <id>', 'note: attach to this work item')
    .option('--kind <kind>', 'note: comment, progress, blocker, handoff, decision-proposal, correction')
    .option('--json', 'machine-readable output')
    .action(async (action, args, opts) => setExit(await (await cloudCommands()).runCloudWork(cli, action, args, opts)));
  svc(cloud.command('import'))
    .description('Upload the local Work tree for an import preview; an admin confirms it in the dashboard')
    .option('--project <id>', 'project ID (default: the connected project)')
    .option('--work-root <dir>', 'Work root (default: agileflow.yaml work.root or docs/agile)')
    .option('--json', 'machine-readable output')
    .action(async (opts) => setExit(await (await cloudCommands()).runCloudImport(cli, opts)));
  svc(cloud.command('export'))
    .description('Download native Work files (and with --complete, collaboration JSON) plus a validation report')
    .option('--project <id>', 'project ID (default: the connected project)')
    .option('--out <dir>', 'output directory (default agileflow-export-<projectId>)')
    .option('--complete', 'also export notes, revisions, activity, runs, claims, approvals, controls')
    .option('--force', 'overwrite existing files in the output directory')
    .option('--json', 'machine-readable output')
    .action(async (opts) => setExit(await (await cloudCommands()).runCloudExport(cli, opts)));
  svc(cloud.command('companion'))
    .description('Local settings companion: enroll, run [--once], disconnect (macOS arm64/x64, Linux x64)')
    .argument('<action>', 'enroll, run, or disconnect')
    .option('--apply', 'enroll: also request permission to apply settings (agileflow:local:apply)')
    .option('--name <name>', 'enroll: companion name shown in the dashboard')
    .option('--once', 'run: poll once and exit')
    .option('--interval <seconds>', 'run: poll interval (default 15)')
    .option('--insecure-file-store', 'enroll: plaintext credential file when no OS credential store exists')
    .option('--json', 'machine-readable output')
    .action(async (action, opts) => setExit(await (await cloudCommands()).runCloudCompanion(cli, action, opts)));

  program
    .command('completion')
    .description('Print a shell completion script')
    .argument('<shell>', 'bash, zsh, or fish')
    .action(async (shell) => setExit((await import('./commands/completion')).runCompletion(cli, program, shell)));

  program
    .command('self-update')
    .description('Update the AgileFlow CLI itself (or --to <version> to roll back); skills use `update`')
    .option('--to <version>', 'install this exact version (roll back or pin)')
    .option('--dry-run', 'show what would be installed')
    .option('-y, --yes', 'do not ask')
    .option('--json', 'machine-readable output')
    .action(async (opts) => setExit(await (await import('./commands/self-update')).runSelfUpdate(cli, opts)));

  let error: string | undefined;
  try {
    await program.parseAsync(argv, { from: 'node' });
  } catch (err) {
    exitCode = handleError(cli, err);
    if (!(err instanceof CommanderError)) error = (err as Error)?.message ?? String(err);
    else if (exitCode === EXIT.OK) return EXIT.OK;
  }
  if (RECORDED.has(commandName) && (cli.record?.scope || error)) {
    await appendHistory(ctx, {
      at: new Date().toISOString(),
      command: commandName,
      args: argv.slice(3),
      cwd: ctx.cwd,
      ...(cli.record?.scope ? { scope: { kind: cli.record.scope.kind, root: cli.record.scope.root } } : {}),
      exitCode,
      ...(cli.record?.changed?.length ? { changed: cli.record.changed } : {}),
      ...(cli.record?.approved?.length ? { approved: cli.record.approved } : {}),
      ...(error ? { error } : {}),
    });
  }
  return exitCode;
}

/** Print an error (as JSON with --json) and return its exit code. Never 2. */
function handleError(cli: Cli, err: unknown): number {
  const { out, ctx } = cli;
  if (err instanceof CommanderError) {
    if (err.code === 'commander.helpDisplayed' || err.code === 'commander.version' || err.code === 'commander.help') {
      return EXIT.OK;
    }
    if (out.jsonMode) out.jsonError(err.message.replace(/^error: /, ''), [], 'usage');
    return EXIT.ERROR;
  }
  const e = err as Error & { hint?: string[]; hints?: string[]; file?: string };
  const known = ['UsageError', 'OperationError', 'WorkError', 'RegistryError', 'ConfigError', 'IntegrityError'];
  let hints: string[] = [];
  let code = 'error';
  if (e?.name === 'CancelledError') {
    if (out.jsonMode) out.jsonError('Cancelled', [], 'cancelled');
    else out.line('Cancelled. Nothing else was changed.');
    return EXIT.ERROR;
  }
  if (known.includes(e?.name)) {
    hints = e.name === 'ConfigError' && e.file ? [`File: ${e.file}`] : (e.hint ?? e.hints ?? []);
    code = e.name === 'UsageError' ? 'usage' : e.name === 'IntegrityError' ? 'integrity' : e.name === 'ConfigError' ? 'config' : 'error';
  } else if ((err as NodeJS.ErrnoException)?.code) {
    hints = systemErrorHints(err as NodeJS.ErrnoException);
    if (!hints.length && !ctx.env.AGILEFLOW_DEBUG) hints = ['Run with --debug for details, or `agileflow check` to diagnose the setup.'];
    code = 'system';
  } else if (!ctx.env.AGILEFLOW_DEBUG) {
    hints = ['This looks like a bug. Run with --debug and report it: https://github.com/projectquestorg/AgileFlow/issues'];
    code = 'internal';
  }
  const message = e?.message ?? String(err);
  // JSON mode: the error is the JSON document; text goes to stderr only if a document was already printed.
  if (out.jsonMode && !out.hasJson) out.jsonError(message, hints, code);
  else out.error(message, hints);
  if (ctx.env.AGILEFLOW_DEBUG && e?.stack) out.stderr.write(`${e.stack}\n`);
  return EXIT.ERROR;
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
  // Set the exit code instead of calling process.exit(), which can cut off
  // piped stdout that has not drained yet (e.g. large --json output).
  run(process.argv).then((code) => {
    process.exitCode = code;
  });
}
