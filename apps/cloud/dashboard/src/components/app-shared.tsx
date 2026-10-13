import type { ReactNode } from "react";
import {
	LayoutGridIcon,
	KanbanSquareIcon,
	ListTodoIcon,
	ScaleIcon,
	FileTextIcon,
	MapIcon,
	BotIcon,
	MessageSquareTextIcon,
	SlidersHorizontalIcon,
	ShieldCheckIcon,
	SettingsIcon,
	UploadIcon,
	PlugIcon,
	FolderKanbanIcon,
} from "lucide-react";

export type SidebarNavItem = {
	title: string;
	path?: string;
	icon?: ReactNode;
	isActive?: boolean;
	subItems?: SidebarNavItem[];
};

export type SidebarNavGroup = {
	label?: string;
	items: SidebarNavItem[];
};

type NavDef = { title: string; suffix: string; icon: ReactNode; adminOnly?: boolean; prefixes?: string[] };

const PROJECT_GROUPS: Array<{ label: string; items: NavDef[] }> = [
	{
		label: "Plan",
		items: [
			{ title: "Overview", suffix: "/overview", icon: <LayoutGridIcon />, prefixes: [""] },
			{ title: "Board", suffix: "/board", icon: <KanbanSquareIcon /> },
			{ title: "Work list", suffix: "/work", icon: <ListTodoIcon />, prefixes: ["/work/"] },
			{ title: "Decisions", suffix: "/decisions", icon: <ScaleIcon /> },
			{ title: "Product", suffix: "/docs/product", icon: <FileTextIcon /> },
			{ title: "Roadmap", suffix: "/docs/roadmap", icon: <MapIcon /> },
		],
	},
	{
		label: "Collaborate",
		items: [
			{ title: "Agent activity", suffix: "/agents", icon: <BotIcon /> },
			{ title: "Notes and history", suffix: "/notes", icon: <MessageSquareTextIcon /> },
		],
	},
	{
		label: "Govern",
		items: [
			{ title: "Project controls", suffix: "/controls", icon: <SlidersHorizontalIcon /> },
			{ title: "Approvals", suffix: "/approvals", icon: <ShieldCheckIcon />, prefixes: ["/approvals/"] },
			{ title: "Administration", suffix: "/admin", icon: <SettingsIcon />, adminOnly: true },
			{ title: "Import", suffix: "/import", icon: <UploadIcon />, adminOnly: true, prefixes: ["/import/"] },
			{ title: "Connect", suffix: "/connect", icon: <PlugIcon /> },
		],
	},
];

const enc = encodeURIComponent;

/** Sidebar groups for the current route. `path` is the router pathname (without '#'). */
export function buildNavGroups(path: string, pid: string | null, isAdmin: boolean): SidebarNavGroup[] {
	const groups: SidebarNavGroup[] = [
		{
			label: "Workspace",
			items: [{ title: "Projects", path: "#/", icon: <FolderKanbanIcon />, isActive: path === "/" }],
		},
	];
	if (!pid) return groups;
	const base = `/p/${enc(pid)}`;
	for (const g of PROJECT_GROUPS) {
		groups.push({
			label: g.label,
			items: g.items
				.filter((i) => !i.adminOnly || isAdmin)
				.map((i) => ({
					title: i.title,
					path: `#${base}${i.suffix}`,
					icon: i.icon,
					isActive: path === `${base}${i.suffix}` || (i.prefixes ?? []).some((p) => (p === "" ? path === base : path.startsWith(`${base}${p}`))),
				})),
		});
	}
	return groups;
}

export function buildFooterLinks(path: string): SidebarNavItem[] {
	return [{ title: "Connection diagnostics", path: "#/connect", icon: <PlugIcon />, isActive: path === "/connect" }];
}

/** Flattened items, used to resolve the breadcrumb for the active page. */
export function flattenNav(groups: SidebarNavGroup[], footer: SidebarNavItem[]): SidebarNavItem[] {
	return [
		...groups.flatMap((group) => group.items.flatMap((item) => (item.subItems?.length ? [item, ...item.subItems] : [item]))),
		...footer,
	];
}
