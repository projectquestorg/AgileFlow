import type { LinkItemType } from "@/components/sheard";
import { LINKS } from "@/lib/links";
import {
	BookOpenIcon,
	FileTextIcon,
	FlaskConicalIcon,
	GitForkIcon,
	GithubIcon,
	HistoryIcon,
	KanbanSquareIcon,
	MessagesSquareIcon,
	PackageIcon,
	PlugIcon,
	ScaleIcon,
	SquareTerminalIcon,
	TriangleAlertIcon,
	UsersIcon,
	WrenchIcon,
} from "lucide-react";

export const productLinks: LinkItemType[] = [
	{ label: "Skills", href: `${LINKS.docs}/reference/official-skills`, description: "Official workflows for debugging, reviews, and PRs", icon: <WrenchIcon /> },
	{ label: "Providers", href: `${LINKS.docs}/concepts/providers`, description: "Claude Code, Codex, Cursor, OpenCode, Gemini CLI", icon: <PlugIcon /> },
	{ label: "Agile Work", href: `${LINKS.docs}/work`, description: "Epics, stories, and decisions as Markdown", icon: <KanbanSquareIcon /> },
	{ label: "Evals", href: `${LINKS.docs}/commands/eval`, description: "Measure whether a skill actually helps", icon: <FlaskConicalIcon /> },
	{ label: "Updates and forks", href: `${LINKS.docs}/guides/updates-and-conflicts`, description: "Versioned updates that never overwrite your edits", icon: <GitForkIcon /> },
	{ label: "CLI", href: `${LINKS.docs}/commands/init`, description: "init, add, update, check, and friends", icon: <SquareTerminalIcon /> },
];

export const companyLinks: LinkItemType[] = [
	{ label: "Documentation", href: LINKS.docs, description: "Guides, concepts, and command reference", icon: <BookOpenIcon /> },
	{ label: "GitHub", href: LINKS.github, description: "Source, releases, and roadmap", icon: <GithubIcon /> },
	{ label: "Changelog", href: `${LINKS.github}/blob/main/apps/cli/CHANGELOG.md`, description: "What changed in each release", icon: <HistoryIcon /> },
];

export const companyLinks2: LinkItemType[] = [
	{ label: "Discussions", href: `${LINKS.github}/discussions`, icon: <MessagesSquareIcon /> },
	{ label: "Report an issue", href: `${LINKS.github}/issues`, icon: <TriangleAlertIcon /> },
	{ label: "Contributing", href: `${LINKS.github}/blob/main/README.md`, icon: <UsersIcon /> },
	{ label: "npm package", href: "https://www.npmjs.com/package/agileflow", icon: <PackageIcon /> },
	{ label: "MIT License", href: `${LINKS.github}/blob/main/LICENSE`, icon: <ScaleIcon /> },
];

export const quickStartHref = `${LINKS.docs}/quick-start`;
