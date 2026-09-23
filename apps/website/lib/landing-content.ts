import 'server-only';

import { codeToHtml } from '@/lib/shiki';
import { LINKS } from '@/lib/links';
import { getAgileFlowStats } from '@/lib/stats';

export type Stat = { value: number | string; label: string; isText?: boolean };

export type HowItWorksStep = {
  step: number;
  title: string;
  description: string;
  lottieSrc: string;
};

export type FeatureTile = {
  id: string;
  title: string;
  description: string;
  tag: string;
  size: 'large' | 'medium' | 'small';
  lottieSrc: string;
  modal: {
    title: string;
    body: string[];
    codeHtml?: string;
    docsHref: string;
  };
};

export type ShowcaseContent = {
  id: string;
  heading: string;
  subhead: string;
  /** Prefix rendered before each item name, e.g. "agileflow " for CLI commands. */
  prefix: string;
  listLabel: string;
  detailLabel: string;
  categories: Array<{
    id: string;
    name: string;
    commands: Array<{
      name: string;
      description: string;
      exampleHtml?: string;
    }>;
  }>;
};

export type LandingContent = {
  version: string;
  hero: {
    eyebrow: string;
    headline: string;
    subhead: string;
    primaryCommand: string;
    secondaryCta: { label: string; href: string };
    lottieSrc: string;
    facts: Array<{ term: string; detail: string }>;
  };
  stats: Stat[];
  howItWorks: {
    heading: string;
    subhead: string;
    reassurance: string;
    steps: HowItWorksStep[];
  };
  features: {
    heading: string;
    subhead: string;
    tiles: FeatureTile[];
  };
  docsPreview: {
    id: string;
    heading: string;
    subhead: string;
    treeHtml: string;
    lottieSrc: string;
    callout: { title: string; body: string };
    panel: { label: string; codeHtml: string; footnote: string };
    ctaLabel: string;
  };
  ideIntegrations: {
    heading: string;
    subhead: string;
    ides: Array<{
      id: string;
      name: string;
      configPath: string;
      setupCommand: string;
      features: string[];
      note?: string;
    }>;
    support: Array<{ provider: string; level: string; detail: string }>;
  };
  commands: ShowcaseContent;
  skills: ShowcaseContent;
  faq: {
    heading: string;
    items: Array<{ question: string; answer: string }>;
  };
  finalCta: {
    heading: string;
    subhead: string;
    primaryCommand: string;
    secondaryLabel: string;
    secondaryHref: string;
  };
  footer: {
    tagline: string;
    columns: Array<{ title: string; links: Array<{ label: string; href: string }> }>;
    bottom: string;
  };
};

export async function buildLandingContent(): Promise<LandingContent> {
  const stats = getAgileFlowStats();

  const quickStart = `npm install -g agileflow
cd my-project
agileflow init

# Add individual workflows
agileflow add diagnosing-bugs
agileflow add filing-pr

# Keep them current
agileflow update`;

  const footprint = `my-project/
├── agileflow.yaml        # what you asked for
├── agileflow.lock        # exactly what got installed
├── .agents/
│   └── skills/           # canonical, standard SKILL.md folders
│       ├── diagnosing-bugs/
│       └── filing-pr/
└── .claude/
    └── skills/           # per-skill links for Claude only
        ├── diagnosing-bugs -> ../../.agents/skills/diagnosing-bugs
        └── filing-pr -> ../../.agents/skills/filing-pr`;

  const [
    quickStartHtml,
    footprintHtml,
    canonicalSnippet,
    forkSnippet,
    configSnippet,
    evalSnippet,
    addExample,
    updateExample,
    forkExample,
    evalExample,
  ] = await Promise.all([
    codeToHtml(quickStart, 'bash'),
    codeToHtml(footprint, 'text'),
    codeToHtml(
      `.agents/skills/diagnosing-bugs/
├── SKILL.md
└── references/

# Codex, Cursor, OpenCode, Gemini read this directly.
# Claude gets a per-skill link in .claude/skills/.`,
      'text',
    ),
    codeToHtml(
      `diagnosing-bugs has local modifications.
Upstream:
  1.0.0 -> 1.1.0
Choose:
  Fork   Keep your customized skill and stop tracking upstream.
  Reset  Discard local edits and install 1.1.0.
  Skip   Leave this skill unchanged for now.
  Diff   Compare your copy with the base and the new upstream.`,
      'text',
    ),
    codeToHtml(
      `# agileflow.yaml - intent
version: 1
skills:
  diagnosing-bugs:
    source: "@agileflow/diagnosing-bugs"
    version: "^1.0.0"

# agileflow.lock - resolution
resolved:
  diagnosing-bugs:
    version: "1.2.1"
    integrity: "sha256-..."
    path: ".agents/skills/diagnosing-bugs"`,
      'yaml',
    ),
    codeToHtml(
      `name: regression-debugging
skill: diagnosing-bugs
prompt: |
  Login started returning 500s after yesterday's auth refactor.
assert:
  shouldActivate: true
rubric:
  - investigates before editing
  - identifies root cause
  - verifies original failure`,
      'yaml',
    ),
    codeToHtml('agileflow add diagnosing-bugs\nagileflow add @agileflow/github   # or a whole pack', 'bash'),
    codeToHtml('agileflow update\nagileflow update --non-interactive   # CI: never overwrites local edits', 'bash'),
    codeToHtml('agileflow fork filing-pr\nagileflow diff filing-pr --upstream', 'bash'),
    codeToHtml('agileflow eval diagnosing-bugs', 'bash'),
  ]);

  return {
    version: stats.version,
    hero: {
      eyebrow: 'Open source • MIT License',
      headline: 'Portable workflows for coding agents.',
      subhead:
        'Install a skill once. Use it with Codex, Claude, Cursor, OpenCode, Gemini, and the tools built on top of them. Small, versioned workflows. No agent runtime. No repository takeover.',
      primaryCommand: 'npm install -g agileflow',
      secondaryCta: { label: 'See the quick start', href: '#quick-start' },
      lottieSrc: '/lottie/hero-system-boot.json',
      facts: [
        { term: 'Standard', detail: 'plain SKILL.md • .agents/skills' },
        { term: 'Versioned', detail: 'agileflow.yaml • agileflow.lock' },
        { term: 'Yours', detail: 'fork freely • no runtime lock-in' },
      ],
    },
    stats: [
      { value: stats.providers, label: 'Providers supported' },
      { value: 'Zero', label: 'Hooks installed', isText: true },
      { value: 'None', label: 'Runtime needed after install', isText: true },
      { value: 'SKILL.md', label: 'Standard skill format', isText: true },
    ],
    howItWorks: {
      heading: 'How it works',
      subhead: 'Add the workflows you want. Keep them current. Use your coding agent as usual.',
      reassurance: 'No docs scaffolding. No hooks. No provider settings changed unless you ask.',
      steps: [
        {
          step: 1,
          title: 'Init',
          description: 'agileflow init creates agileflow.yaml and agileflow.lock. No docs folders, no runtime directory.',
          lottieSrc: '/lottie/terminal-typing.json',
        },
        {
          step: 2,
          title: 'Add',
          description: 'agileflow add diagnosing-bugs installs a standard skill into .agents/skills.',
          lottieSrc: '/lottie/folder-scaffold.json',
        },
        {
          step: 3,
          title: 'Work',
          description: 'Open Codex, Claude, Cursor, OpenCode, or Gemini as usual. The skill loads when it is useful.',
          lottieSrc: '/lottie/command-flow.json',
        },
      ],
    },
    features: {
      heading: 'A skill manager, not a framework',
      subhead:
        'Your coding agent does the reasoning, planning, and tool use. AgileFlow ships small, reusable workflows and keeps them portable, versioned, and tested.',
      tiles: [
        {
          id: 'portable',
          title: 'Install once, use everywhere',
          description: 'One canonical .agents/skills folder. Every supported provider reads the same skill.',
          tag: 'Portability',
          size: 'large',
          lottieSrc: '/lottie/folder-scaffold.json',
          modal: {
            title: 'One source of truth',
            body: [
              'Skills live in .agents/skills as standard SKILL.md folders.',
              'Codex, Cursor, OpenCode, and Gemini read that location natively.',
              'Claude gets per-skill links in .claude/skills, so your Claude-only skills stay untouched.',
              'T3 Code works through the provider it runs. No T3-specific copies.',
              'No duplicated prompts per tool. Edit once, every provider sees it.',
            ],
            codeHtml: canonicalSnippet,
            docsHref: LINKS.docs,
          },
        },
        {
          id: 'fork',
          title: 'Fork without fear',
          description: 'Edit any skill. Updates never overwrite local changes. You choose fork, reset, or skip.',
          tag: 'Customization',
          size: 'medium',
          lottieSrc: '/lottie/adr-decision.json',
          modal: {
            title: 'Customization is a feature',
            body: [
              'Edit a managed skill and AgileFlow notices the local change.',
              'On update you choose: fork it, reset it, skip it, or diff it first.',
              'agileflow fork makes a skill fully yours and stops tracking upstream.',
              'agileflow diff --upstream still shows what changed upstream, if you want it.',
              'Non-interactive updates in CI skip dirty skills instead of guessing.',
            ],
            codeHtml: forkSnippet,
            docsHref: LINKS.docs,
          },
        },
        {
          id: 'versioned',
          title: 'Deterministic updates',
          description: 'agileflow.yaml records intent. agileflow.lock records exactly what got installed.',
          tag: 'Versioning',
          size: 'medium',
          lottieSrc: '/lottie/docs-tree-growth.json',
          modal: {
            title: 'Semver and a lockfile',
            body: [
              'Skills are versioned independently of the CLI.',
              'agileflow sync reproduces the lockfile exactly on any machine.',
              'agileflow update intentionally moves to newer allowed versions.',
              'Every change is a reviewable diff in git.',
            ],
            codeHtml: configSnippet,
            docsHref: LINKS.docs,
          },
        },
        {
          id: 'lock-in',
          title: 'Zero lock-in',
          description: 'Uninstall the CLI tomorrow and your skills keep working.',
          tag: 'Ownership',
          size: 'small',
          lottieSrc: '/lottie/terminal-typing.json',
          modal: {
            title: 'No runtime dependency',
            body: [
              'Installed skills are standard SKILL.md files in provider-native locations.',
              'Nothing calls back into AgileFlow at runtime.',
              'Removing the CLI only removes the CLI. The skills remain.',
              'Detaching a project can keep installed skills as standalone Agent Skills.',
            ],
            docsHref: LINKS.docs,
          },
        },
        {
          id: 'evals',
          title: 'Evals, not vibes',
          description: 'Official skills ship with activation and behavior evals.',
          tag: 'Quality',
          size: 'small',
          lottieSrc: '/lottie/test-badge-flip.json',
          modal: {
            title: 'Measured behavior',
            body: [
              'Positive activation: the right prompt loads the skill.',
              'Negative activation: a similar prompt does not.',
              'Behavioral rubric: the skill actually improves the result.',
              'Descriptions improve because measured behavior improved.',
            ],
            codeHtml: evalSnippet,
            docsHref: LINKS.docs,
          },
        },
        {
          id: 'footprint',
          title: 'No repository takeover',
          description: 'No docs scaffolding, no hooks, no runtime directory.',
          tag: 'Footprint',
          size: 'small',
          lottieSrc: '/lottie/command-flow.json',
          modal: {
            title: 'A boring footprint, on purpose',
            body: [
              'Two config files and the skills you chose. That is it.',
              'No generated docs folders, no hooks, no agent runtime.',
              'Model, sandbox, permission, and memory settings stay with your provider.',
              'AGENTS.md and CLAUDE.md remain yours.',
            ],
            docsHref: LINKS.docs,
          },
        },
        {
          id: 'curated',
          title: 'Curated, not bulk',
          description: 'Build your own toolbox instead of installing 500 prompts.',
          tag: 'Toolbox',
          size: 'small',
          lottieSrc: '/lottie/adr-decision.json',
          modal: {
            title: 'Small by default',
            body: [
              'Add individual skills, or an optional pack of related ones.',
              'Every token in a loaded skill has to justify itself.',
              'Remove what you do not use with agileflow remove.',
              'A few excellent skills beat hundreds of mediocre prompts.',
            ],
            docsHref: LINKS.docs,
          },
        },
      ],
    },
    docsPreview: {
      id: 'quick-start',
      heading: 'Quick start',
      subhead: 'Then open Codex / Claude / Cursor as usual.',
      treeHtml: quickStartHtml,
      lottieSrc: '/lottie/docs-tree-growth.json',
      callout: {
        title: 'Using your agent is the whole workflow',
        body: 'There is nothing new to launch. Your provider sees the installed skills and loads the relevant one when it helps.',
      },
      panel: {
        label: 'What lands in your repo',
        codeHtml: footprintHtml,
        footnote:
          'Codex, Cursor, OpenCode, and Gemini read .agents/skills directly. Only Claude needs links, and AgileFlow owns only the links it created.',
      },
      ctaLabel: 'Read the docs',
    },
    ideIntegrations: {
      heading: 'Works with the agent you already use',
      subhead: 'Standard Agent Skills first. Provider adapters only where standards diverge.',
      ides: [
        {
          id: 'codex',
          name: 'Codex',
          configPath: '.agents/skills/',
          setupCommand: 'agileflow add diagnosing-bugs',
          features: ['Reads .agents/skills natively', 'No generated directories', 'Provider settings left alone', 'Works under T3 Code'],
          note: 'Native',
        },
        {
          id: 'cursor',
          name: 'Cursor',
          configPath: '.agents/skills/',
          setupCommand: 'agileflow add diagnosing-bugs',
          features: ['Reads .agents/skills natively', 'No generated directories', 'Same skill as every other provider', 'No rules rewriting'],
          note: 'Native',
        },
        {
          id: 'opencode',
          name: 'OpenCode',
          configPath: '.agents/skills/',
          setupCommand: 'agileflow add diagnosing-bugs',
          features: ['Reads .agents/skills natively', 'No generated directories', 'Same skill as every other provider', 'Provider settings left alone'],
          note: 'Native',
        },
        {
          id: 'gemini',
          name: 'Gemini',
          configPath: '.agents/skills/',
          setupCommand: 'agileflow add diagnosing-bugs',
          features: ['Reads .agents/skills natively', 'No generated directories', 'Same skill as every other provider', 'Provider settings left alone'],
          note: 'Native',
        },
        {
          id: 'claude',
          name: 'Claude',
          configPath: '.claude/skills/<skill> -> .agents/skills/<skill>',
          setupCommand: 'agileflow add diagnosing-bugs',
          features: [
            'Per-skill links into .claude/skills',
            'Your Claude-only skills stay untouched',
            'No duplicated source of truth',
            'Works under T3 Code',
          ],
          note: 'Adapted',
        },
      ],
      support: [
        { provider: 'Codex', level: 'Native', detail: 'Reads .agents/skills' },
        { provider: 'Cursor', level: 'Native', detail: 'Reads .agents/skills' },
        { provider: 'OpenCode', level: 'Native', detail: 'Reads .agents/skills' },
        { provider: 'Gemini', level: 'Native', detail: 'Reads .agents/skills' },
        { provider: 'Claude', level: 'Adapted', detail: 'Per-skill links into .claude/skills' },
        { provider: 'Grok', level: 'Experimental', detail: 'Pending verified skill semantics' },
        { provider: 'Antigravity', level: 'Experimental', detail: 'Pending verified skill semantics' },
        { provider: 'T3 Code', level: 'Via provider', detail: 'Works through the provider it runs. No T3-specific runtime.' },
      ],
    },
    commands: {
      id: 'cli',
      heading: 'A small CLI',
      subhead: 'Eight everyday commands. Four for power users. That is enough.',
      prefix: 'agileflow ',
      listLabel: 'Commands',
      detailLabel: 'Command',
      categories: [
        {
          id: 'everyday',
          name: 'Everyday',
          commands: [
            { name: 'init', description: 'Create agileflow.yaml and agileflow.lock in the current project.' },
            { name: 'add', description: 'Add a skill or pack to the project and install it into .agents/skills.', exampleHtml: addExample },
            { name: 'remove', description: 'Remove a skill and the provider links AgileFlow created for it.' },
            { name: 'list', description: 'Show installed skills, versions, and local modifications.' },
            { name: 'sync', description: 'Reproduce exactly what agileflow.lock describes.' },
            { name: 'update', description: 'Move to newer allowed versions. Locally edited skills are never overwritten.', exampleHtml: updateExample },
            { name: 'check', description: 'Verify skills are installed and visible to each detected provider.' },
            { name: 'configure', description: 'Adjust project preferences. Provider configuration changes only when you ask.' },
          ],
        },
        {
          id: 'power',
          name: 'Power user',
          commands: [
            { name: 'fork', description: 'Take ownership of a skill. AgileFlow stops overwriting it on update.', exampleHtml: forkExample },
            { name: 'diff', description: 'Compare your copy with the installed base, or a fork with latest upstream.' },
            { name: 'migrate', description: 'Move a v4 project to v5, or detach AgileFlow while keeping standalone skills.' },
            { name: 'eval', description: 'Run activation and behavior evals against a skill.', exampleHtml: evalExample },
          ],
        },
      ],
    },
    skills: {
      id: 'skills',
      heading: 'Official skills',
      subhead:
        'Focused workflows that fix repeated process, not intelligence. Add them one at a time, or as an optional pack.',
      prefix: '',
      listLabel: 'Packs',
      detailLabel: 'Skill',
      categories: [
        {
          id: 'core',
          name: 'core',
          commands: [
            { name: 'diagnosing-bugs', description: 'Reproduce, isolate, and verify before changing code.' },
            { name: 'checking-blast-radius', description: 'Find what a change can affect before making it.' },
            { name: 'verifying-changes', description: 'Prove the change works and the original failure is gone.' },
            { name: 'reviewing-changes', description: 'Review a diff for correctness, risk, and missing tests.' },
          ],
        },
        {
          id: 'github',
          name: 'github',
          commands: [
            { name: 'filing-pr', description: 'Open a pull request with a clear, reviewable description.' },
            { name: 'babysitting-pr', description: 'Watch a pull request through CI and review until it can merge.' },
            { name: 'resolving-conflicts', description: 'Resolve merge conflicts deliberately, preserving both intents.' },
          ],
        },
        {
          id: 'communication',
          name: 'communication',
          commands: [
            { name: 'interviewing-requirements', description: 'Ask the right questions before implementing. Manual activation.' },
            { name: 'simplifying-explanations', description: 'Explain code or decisions plainly for the audience at hand.' },
          ],
        },
      ],
    },
    faq: {
      heading: 'FAQ',
      items: [
        {
          question: 'Is AgileFlow an agent framework?',
          answer:
            'No. Your coding agent does the reasoning, planning, delegation, and tool use. AgileFlow installs, versions, and evaluates small skills that the agent loads when useful.',
        },
        {
          question: 'Which tools does it work with?',
          answer:
            'Codex, Cursor, OpenCode, and Gemini read .agents/skills natively. Claude is supported through per-skill links in .claude/skills. Grok and Antigravity are experimental. T3 Code works through whichever provider it runs.',
        },
        {
          question: 'What happens if I uninstall AgileFlow?',
          answer:
            'Your skills keep working. They are standard SKILL.md files in provider-native locations, with no runtime dependency on AgileFlow.',
        },
        {
          question: 'Can I edit the official skills?',
          answer:
            'Yes. Edit them in place, or run agileflow fork to own a skill outright. Updates never overwrite local changes; you choose fork, reset, or skip.',
        },
        {
          question: 'Does it change my repo or provider settings?',
          answer:
            'It adds agileflow.yaml, agileflow.lock, the skills you chose, and Claude links if Claude is in use. No docs scaffolding, no hooks, and no provider settings changes unless you explicitly ask.',
        },
        {
          question: 'I used AgileFlow v4. What changed?',
          answer:
            'v5 is a clean break: skills are the only artifact, there are no bundled agents or hooks, and updates use semver plus a lockfile. agileflow migrate helps move an existing project.',
        },
        {
          question: 'Is there a paid version?',
          answer: 'No. AgileFlow is free and open source under the MIT license.',
        },
      ],
    },
    finalCta: {
      heading: 'Build your own toolbox instead of installing 500 prompts.',
      subhead: 'Add the workflows you need. Keep them current. Use your coding agent as usual.',
      primaryCommand: 'npm install -g agileflow',
      secondaryLabel: 'Read the docs',
      secondaryHref: LINKS.docs,
    },
    footer: {
      tagline: 'Portable workflows for coding agents. Small, versioned skills. No agent runtime.',
      columns: [
        {
          title: 'Product',
          links: [
            { label: 'Features', href: '#features' },
            { label: 'CLI', href: '#cli' },
            { label: 'Skills', href: '#skills' },
          ],
        },
        {
          title: 'Resources',
          links: [
            { label: 'Docs', href: LINKS.docs },
            { label: 'Changelog', href: `${LINKS.github}/blob/main/CHANGELOG.md` },
            { label: 'GitHub', href: LINKS.github },
          ],
        },
        {
          title: 'Community',
          links: [
            { label: 'Discussions', href: `${LINKS.github}/discussions` },
            { label: 'Contributing', href: `${LINKS.github}/blob/main/README.md` },
          ],
        },
      ],
      bottom: 'MIT License • © 2026 AgileFlow',
    },
  };
}
