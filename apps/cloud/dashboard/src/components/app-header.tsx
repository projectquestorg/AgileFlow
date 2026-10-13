import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { DecorIcon } from "@/components/decor-icon";
import { AppBreadcrumbs } from "@/components/app-breadcrumbs";
import type { SidebarNavItem } from "@/components/app-shared";
import { CustomSidebarTrigger } from "@/components/custom-sidebar-trigger";
import { NavUser } from "@/components/nav-user";
import { useApp, type Project } from "@/lib/app-context";
import { Chip } from "@/components/common";
import { PlugIcon } from "lucide-react";

export function AppHeader({ activeItem, project }: { activeItem: SidebarNavItem | null; project: Project | null }) {
	const { me } = useApp();
	const trail = [
		...(me.workspace ? [{ title: me.workspace.name, href: "#/" }] : []),
		...(project && activeItem?.title !== "Projects" ? [{ title: project.name, href: `#/p/${encodeURIComponent(project.id)}/overview` }] : []),
	];
	return (
		<header
			className={cn(
				"sticky top-0 z-50 flex h-14 shrink-0 items-center justify-between gap-2 border-b px-4 md:px-6",
				"bg-background/95 backdrop-blur-sm supports-backdrop-filter:bg-background/50"
			)}
		>
			<DecorIcon className="hidden md:block" position="bottom-left" />
			<div className="flex min-w-0 items-center gap-3">
				<CustomSidebarTrigger />
				<Separator
					className="mr-2 h-4 data-[orientation=vertical]:self-center"
					orientation="vertical"
				/>
				<AppBreadcrumbs page={activeItem ?? (project ? { title: project.name } : null)} trail={activeItem ? trail : trail.slice(0, -1)} />
			</div>
			<div className="flex items-center gap-3">
				{project?.clientWritesPaused ? <Chip tone="warn" className="hidden sm:inline-flex">client changes paused</Chip> : null}
				<Button size="sm" variant="outline" render={<Link to={project ? `/p/${encodeURIComponent(project.id)}/connect` : "/connect"} />} nativeButton={false}>
					<PlugIcon data-icon="inline-start" />
					<span className="max-sm:sr-only">Connect</span>
				</Button>
				<Separator
					className="h-4 data-[orientation=vertical]:self-center"
					orientation="vertical"
				/>
				<NavUser />
			</div>
		</header>
	);
}
