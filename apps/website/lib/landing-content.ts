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

export type LandingContent = {
  version: string;
  hero: {
    eyebrow: string;
    headline: string;
    subhead: string;
    primaryCommand: string;
    secondaryCta: { label: string; href: string };
    lottieSrc: string;
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
    heading: string;
    subhead: string;
    treeHtml: string;
    lottieSrc: string;
    callout: { title: string; body: string };
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
  };
  commands: {
    heading: string;
    subhead: string;
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
  agents: {
    heading: string;
    subhead: string;
    lottieSrc: string;
    highlight: string;
    keyAgents: Array<{ name: string; summary: string }>;
  };
  testimonials: {
    heading: string;
    subhead: string;
    items: Array<
      | { kind: 'quote'; quote: string; name: string; role: string }
      | { kind: 'diff'; title: string; html: string; caption: string }
    >;
  };
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
    columns: Array<{ title: string; links: Array<{ label: string; href: string }> }>;
    bottom: string;
  };
};

export async function buildLandingContent(): Promise<LandingContent> {
  const stats = getAgileFlowStats();

  const docsTree = `docs/
├── 00-meta/          # Templates, guides, conventions
├── 01-brainstorming/ # Ideas and sketches
├── 02-practices/     # Testing, git, releasing, security
├── 03-decisions/     # Architecture Decision Records
├── 04-architecture/  # System design docs
├── 05-epics/         # Feature epics (EP-####)
├── 06-stories/       # User stories (US-####)
├── 07-testing/       # Test cases and acceptance tests
├── 08-project/       # Roadmap, backlog, milestones
├── 09-agents/        # Status tracking + message bus
└── 10-research/      # Technical research notes`;

  const [docsTreeHtml, storySnippet, adrSnippet, busSnippet, diffSnippet] = await Promise.all([
    codeToHtml(docsTree, 'text'),
    codeToHtml(
      `# US-0123: Context export for web AI

## Goal
Generate a one-page context summary for tools with strict limits.

## Acceptance Criteria
- Given a repo, when /agileflow:context:full runs, then \`docs/00-meta/context.md\` updates
- Given verbose docs, when /agileflow:compress runs, then duplicated sections are reduced
`,
      'markdown',
    ),
    codeToHtml(
      `# ADR-0042: Message bus format

## Decision
Use append-only JSONL: \`docs/09-agents/bus.jsonl\`

## Consequences
- Auditable coordination between agents
- Diff-friendly history in git
`,
      'markdown',
    ),
    codeToHtml(
      `{"ts":"2025-01-12T09:14:03Z","agent":"ui","type":"status","story":"US-0123","state":"in-progress"}
{"ts":"2025-01-12T09:19:27Z","agent":"ci","type":"check","story":"US-0123","state":"passing"}`,
      'json',
    ),
    codeToHtml(
      `diff --git a/README.md b/README.md
index 3b18c71..8c2aa0f 100644
--- a/README.md
+++ b/README.md
@@ -1,3 +1,14 @@
 # Repo
+
+## AgileFlow
+- Scaffolded docs-as-code workflow
+- Added epics, stories, ADRs, and testing folders
+- Introduced message bus for multi-agent coordination
`,
      'diff',
    ),
  ]);

  return {
    version: stats.version,
    hero: {
      eyebrow: 'Open-source • MIT License',
      headline: 'Agile delivery, in your repo—powered by AI.',
      subhead:
        'Scrum, Kanban, ADRs, and docs-as-code—scaffolded into Claude Code, Cursor, or Windsurf. Everything versioned. Nothing hidden.',
      primaryCommand: 'npx agileflow@latest setup',
      secondaryCta: { label: 'See the docs structure', href: '#docs' },
      lottieSrc: '/lottie/hero-system-boot.json',
    },
    stats: [
      { value: stats.commands, label: 'Slash commands' },
      { value: stats.agents, label: 'Agents & experts' },
      { value: 'Dynamic', label: 'Skill generator', isText: true },
      { value: stats.ides, label: 'IDEs supported' },
    ],
    howItWorks: {
      heading: 'How It Works',
      subhead: 'Install once. Scaffold structure. Operate with commands.',
      reassurance: 'All files are markdown. All changes are commits. Fully reversible.',
      steps: [
        {
          step: 1,
          title: 'Setup',
          description: 'npx agileflow@latest setup',
          lottieSrc: '/lottie/terminal-typing.json',
        },
        {
          step: 2,
          title: 'Explore',
          description: 'Run /agileflow:help to see all commands',
          lottieSrc: '/lottie/folder-scaffold.json',
        },
        {
          step: 3,
          title: 'Work',
          description: 'Use commands to plan, record, verify, and ship',
          lottieSrc: '/lottie/command-flow.json',
        },
      ],
    },
    features: {
      heading: 'Systematic by default',
      subhead: 'A repeatable docs-as-code workflow that scales from solo to multi-agent.',
      tiles: [
        {
          id: 'epics-stories',
          title: 'Epics and stories',
          description: 'Turn ideas into testable increments with acceptance criteria.',
          tag: 'Planning',
          size: 'large',
          lottieSrc: '/lottie/kanban-markdown.json',
          modal: {
            title: 'Stories that stay reviewable',
            body: [
              'Stories are markdown files in your repo.',
              'Acceptance criteria is explicit and testable.',
              'Templates keep naming, status, and ownership consistent.',
              'Updates are diffs. Reviews are pull requests.',
              'WIP limits and lifecycle rules stay visible to everyone.',
              'Everything stays portable across IDEs and assistants.',
            ],
            codeHtml: storySnippet,
            docsHref: LINKS.docs,
          },
        },
        {
          id: 'adrs',
          title: 'Decision records',
          description: 'Stop re-deciding. Record decisions once, in markdown.',
          tag: 'Decisions',
          size: 'medium',
          lottieSrc: '/lottie/adr-decision.json',
          modal: {
            title: 'Architecture decisions in git',
            body: [
              'ADRs are first-class docs with consistent templates.',
              'Alternatives are captured alongside the chosen path.',
              'New teammates inherit context without meetings.',
              'Your architecture history is searchable and auditable.',
              'Decisions remain reviewable via diffs and PRs.',
              'No hosted system required.',
            ],
            codeHtml: adrSnippet,
            docsHref: LINKS.docs,
          },
        },
        {
          id: 'structure',
          title: 'Docs-as-code structure',
          description: '11 folders with clear hierarchy. Versioned and reviewable.',
          tag: 'Structure',
          size: 'medium',
          lottieSrc: '/lottie/docs-tree-growth.json',
          modal: {
            title: 'A folder system you can keep',
            body: [
              'Conventions live alongside the work they govern.',
              'Docs remain readable without a proprietary UI.',
              'Everything is portable across IDEs and assistants.',
              'Scaffolding is reversible: delete the folders, remove the config.',
              'Structure stays consistent as teams grow.',
              'History stays in git.',
            ],
            docsHref: LINKS.docs,
          },
        },
        {
          id: 'coordination',
          title: 'Multi-agent coordination',
          description: `${stats.agents} agents coordinate via an append-only message bus.`,
          tag: 'Agents',
          size: 'small',
          lottieSrc: '/lottie/message-bus-pulse.json',
          modal: {
            title: 'Auditable coordination',
            body: [
              'Agents operate in focused context windows.',
              'They exchange state through an append-only JSONL log.',
              'Logs are diffable, reviewable, and versioned in git.',
              'No hidden memory or opaque coordination layer.',
              'Coordination remains inspectable in code review.',
              'You can replay state from history.',
            ],
            codeHtml: busSnippet,
            docsHref: LINKS.docs,
          },
        },
        {
          id: 'sprint',
          title: 'Planning and WIP',
          description: 'Track velocity and WIP limits with explicit status.',
          tag: 'Planning',
          size: 'small',
          lottieSrc: '/lottie/velocity-chart.json',
          modal: {
            title: 'Planning with constraints',
            body: [
              'WIP limits stay visible in the repo.',
              'Status changes are documented, not implied.',
              'Metrics are computed from structured files.',
              'Works for solo flow or team cadence.',
              'Planning artifacts remain reviewable.',
              'No dashboards required.',
            ],
            docsHref: LINKS.docs,
          },
        },
        {
          id: 'verification',
          title: 'Verification harness',
          description: 'Keep a clean baseline with repeatable verification.',
          tag: 'Quality',
          size: 'small',
          lottieSrc: '/lottie/test-badge-flip.json',
          modal: {
            title: 'Verify before you ship',
            body: [
              'Verification is a first-class workflow step.',
              'Test expectations stay close to the story they serve.',
              'A session harness reduces broken baselines.',
              'Fits CI without requiring a hosted service.',
              'Keeps the repo in a known-good state.',
              'Failure states stay explicit.',
            ],
            docsHref: LINKS.docs,
          },
        },
        {
          id: 'pr',
          title: 'PR generation',
          description: 'Generate PR summaries from story context.',
          tag: 'Automation',
          size: 'small',
          lottieSrc: '/lottie/command-flow.json',
          modal: {
            title: 'PRs tied to the story',
            body: [
              'PR descriptions pull from story fields and acceptance criteria.',
              'Links to ADRs and tests remain consistent.',
              'Reviewers get context without a separate system.',
              'Keeps documentation durable after merge.',
              'Works with any git hosting.',
              'No hosted lock-in.',
            ],
            docsHref: LINKS.docs,
          },
        },
      ],
    },
    docsPreview: {
      heading: 'Docs structure preview',
      subhead: 'Scaffolded folders and conventions, committed to git.',
      treeHtml: docsTreeHtml,
      lottieSrc: '/lottie/docs-tree-growth.json',
      callout: {
        title: 'Single source of truth',
        body: 'docs/09-agents/status.json keeps WIP limits and lifecycle state explicit.',
      },
    },
    ideIntegrations: {
      heading: 'Works with your favorite AI IDE',
      subhead: 'One codebase, multiple AI assistants. Install once, work anywhere.',
      ides: [
        {
          id: 'claude',
          name: 'Claude Code',
          configPath: '.claude/commands/agileflow/',
          setupCommand: 'npx agileflow setup',
          features: [
            '69 slash commands',
            '28 specialized agents',
            'Status line integration',
            'Hooks system for automation',
          ],
        },
        {
          id: 'cursor',
          name: 'Cursor',
          configPath: '.cursor/rules/agileflow/',
          setupCommand: 'npx agileflow setup --ide cursor',
          features: [
            'Rule-based commands',
            'Agent delegation',
            'Project structure sync',
            'Composer integration',
          ],
        },
        {
          id: 'windsurf',
          name: 'Windsurf',
          configPath: '.windsurf/workflows/agileflow/',
          setupCommand: 'npx agileflow setup --ide windsurf',
          features: [
            'Workflow templates',
            'Cascade mode support',
            'Multi-file operations',
            'Terminal automation',
          ],
        },
        {
          id: 'codex',
          name: 'Codex CLI',
          configPath: '~/.codex/prompts/',
          setupCommand: 'npx agileflow setup --ide codex',
          features: [
            'Prompt library',
            'Skill-based agents',
            'OpenAI integration',
            'CLI-first workflow',
          ],
          note: 'OpenAI Codex CLI',
        },
      ],
    },
    commands: {
      heading: 'Commands',
      subhead: `All ${stats.commands} slash commands grouped by workflow stage.`,
      categories: [
        {
          id: 'core',
          name: 'Core',
          commands: [
            { name: 'help', description: 'Display system overview and all available commands.' },
            { name: 'babysit', description: 'Interactive mentor for end-to-end feature implementation.' },
            { name: 'configure', description: 'Configure hooks, status line, archival, and other features.' },
            { name: 'diagnose', description: 'System health diagnostics and troubleshooting.' },
            { name: 'whats-new', description: 'Show recent AgileFlow updates and version history.' },
          ],
        },
        {
          id: 'planning',
          name: 'Planning',
          commands: [
            { name: 'epic', description: 'Create a new epic with stories and milestones.' },
            { name: 'story', description: 'Create a user story with acceptance criteria.' },
            { name: 'story-validate', description: 'Validate story completeness before development.' },
            { name: 'sprint', description: 'Data-driven sprint planning with velocity forecasting.' },
            { name: 'assign', description: 'Assign or reassign a story to an owner.' },
            { name: 'status', description: 'Update story status and progress.' },
            { name: 'deps', description: 'Visualize dependency graph with critical path detection.' },
            { name: 'auto', description: 'Auto-generate stories from PRDs, mockups, or specs.' },
            { name: 'template', description: 'Create and manage custom document templates.' },
          ],
        },
        {
          id: 'development',
          name: 'Development',
          commands: [
            { name: 'verify', description: 'Run project tests and update story test status.' },
            { name: 'baseline', description: 'Mark current state as verified baseline.' },
            { name: 'review', description: 'AI-powered code review with quality suggestions.' },
            { name: 'pr', description: 'Generate pull request description from story.' },
            { name: 'tests', description: 'Set up automated testing infrastructure.' },
            { name: 'ci', description: 'Bootstrap CI/CD workflow with testing and quality checks.' },
            { name: 'impact', description: 'Analyze change impact across codebase.' },
            { name: 'debt', description: 'Track and prioritize technical debt items.' },
          ],
        },
        {
          id: 'docs',
          name: 'Documentation',
          commands: [
            { name: 'adr', description: 'Create an Architecture Decision Record.' },
            { name: 'docs', description: 'Synchronize documentation with code changes.' },
            { name: 'readme-sync', description: 'Synchronize folder READMEs with contents.' },
            { name: 'changelog', description: 'Auto-generate changelog from commit history.' },
            { name: 'update', description: 'Generate stakeholder progress report.' },
          ],
        },
        {
          id: 'analytics',
          name: 'Analytics',
          commands: [
            { name: 'board', description: 'Display visual kanban board with WIP limits.' },
            { name: 'velocity', description: 'Track velocity and forecast sprint capacity.' },
            { name: 'metrics', description: 'Analytics dashboard with cycle time and throughput.' },
            { name: 'blockers', description: 'Track and resolve blockers with actionable suggestions.' },
            { name: 'retro', description: 'Generate retrospective with Start/Stop/Continue format.' },
            { name: 'feedback', description: 'Collect and process agent feedback.' },
          ],
        },
        {
          id: 'devops',
          name: 'DevOps',
          commands: [
            { name: 'deploy', description: 'Set up automated deployment pipeline.' },
            { name: 'packages', description: 'Manage dependencies with updates and security audits.' },
            { name: 'compress', description: 'Compress status.json to reduce token usage.' },
            { name: 'handoff', description: 'Document work handoff between agents.' },
          ],
        },
        {
          id: 'agents',
          name: 'Agents',
          commands: [
            { name: 'agent', description: 'Onboard a new agent with profile and contract.' },
            { name: 'multi-expert', description: 'Deploy multiple domain experts for cross-domain analysis.' },
            { name: 'validate-expertise', description: 'Validate expertise files for drift and staleness.' },
          ],
        },
        {
          id: 'context',
          name: 'Context',
          commands: [
            { name: 'context:full', description: 'Generate/refresh comprehensive project context.' },
            { name: 'context:export', description: 'Export concise context excerpt for web AI.' },
            { name: 'context:note', description: 'Add timestamped note to context file.' },
          ],
        },
        {
          id: 'research',
          name: 'Research',
          commands: [
            { name: 'research:ask', description: 'Generate detailed 200+ line research prompt for web AI.' },
            { name: 'research:import', description: 'Import results from ChatGPT, Perplexity, or other AI.' },
            { name: 'research:list', description: 'View research notes index.' },
            { name: 'research:view', description: 'Read specific research note.' },
          ],
        },
        {
          id: 'sessions',
          name: 'Sessions',
          commands: [
            { name: 'session:new', description: 'Create a parallel session with git worktree.' },
            { name: 'session:resume', description: 'Switch to a different session.' },
            { name: 'session:status', description: 'View current session state and activity.' },
            { name: 'session:end', description: 'End session and optionally clean up worktree.' },
            { name: 'session:init', description: 'Initialize session harness with test verification.' },
            { name: 'session:history', description: 'View past session history and metrics.' },
          ],
        },
        {
          id: 'skills',
          name: 'Skills',
          commands: [
            { name: 'skill:create', description: 'Generate a custom skill with web research and MCP.' },
            { name: 'skill:list', description: 'List all installed skills with descriptions.' },
            { name: 'skill:edit', description: 'Edit an existing skill.' },
            { name: 'skill:delete', description: 'Remove an installed skill.' },
            { name: 'skill:test', description: 'Verify a skill works correctly.' },
          ],
        },
      ],
    },
    agents: {
      heading: 'Agent architecture',
      subhead: 'Focused agents, coordinated through a message bus.',
      lottieSrc: '/lottie/message-bus-pulse.json',
      highlight:
        'Each agent operates in its own context window. Agents coordinate via an append-only message bus—auditable and versioned.',
      keyAgents: [
        { name: 'mentor', summary: 'End-to-end implementation guidance (orchestrator).' },
        { name: 'epic-planner', summary: 'Feature decomposition and milestone planning.' },
        { name: 'ui', summary: 'Front-end components and interaction patterns.' },
        { name: 'api', summary: 'Backend services and data contracts.' },
        { name: 'ci', summary: 'CI/CD pipelines and verification workflows.' },
        { name: 'security', summary: 'Vulnerability analysis and safe defaults.' },
        { name: 'research', summary: 'Technical research and tradeoff analysis.' },
      ],
    },
    testimonials: {
      heading: 'Testimonials',
      subhead: 'Quiet signals from developers who prefer systems.',
      items: [
        {
          kind: 'quote',
          quote:
            'Finally, a system that makes my AI assistants useful for planning. The ADR workflow alone saved us hours of re-discussion.',
          name: '@devhandle',
          role: 'Senior Engineer',
        },
        {
          kind: 'quote',
          quote:
            'I was skeptical about docs-as-code for agile, but having everything in git with clear structure changed how our team works.',
          name: 'Tech Lead',
          role: 'Series B startup',
        },
        {
          kind: 'quote',
          quote:
            'The multi-agent coordination is clever. Each agent stays focused, but they share context through the message bus.',
          name: '@anotherdev',
          role: 'Open source maintainer',
        },
        {
          kind: 'diff',
          title: 'What changes in a repo',
          html: diffSnippet,
          caption: 'Structure added as versioned files, not a hosted project.',
        },
      ],
    },
    faq: {
      heading: 'FAQ',
      items: [
        {
          question: 'Does this replace Jira?',
          answer:
            'AgileFlow is docs-as-code. It can complement or replace traditional tools—your call.',
        },
        {
          question: 'What if my team uses a different framework?',
          answer: 'Framework-agnostic. Works with any tech stack.',
        },
        {
          question: 'Does it work without Claude?',
          answer: 'Yes. Works with Cursor and Windsurf too. The docs structure works with any AI assistant.',
        },
        {
          question: 'How does it handle context limits?',
          answer:
            '/agileflow:compress reduces verbose fields. /agileflow:context:export exports a concise summary for web AI tools.',
        },
        {
          question: 'Is there a paid version?',
          answer: 'No. AgileFlow is free and open-source under MIT license.',
        },
      ],
    },
    finalCta: {
      heading: 'Install structure. Ship faster. Keep the record.',
      subhead: 'Takes ~2 minutes to scaffold. Fully reversible. MIT licensed.',
      primaryCommand: 'npx agileflow@latest setup',
      secondaryLabel: 'Read the docs',
      secondaryHref: LINKS.docs,
    },
    footer: {
      columns: [
        {
          title: 'Product',
          links: [
            { label: 'Features', href: '#features' },
            { label: 'Commands', href: '#commands' },
            { label: 'Agents', href: '#agents' },
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
      bottom: 'MIT License • © 2025 AgileFlow',
    },
  };
}

