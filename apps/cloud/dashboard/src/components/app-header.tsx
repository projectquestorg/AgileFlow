import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { AppBreadcrumbs } from "@/components/app-breadcrumbs";
import type { SidebarNavItem } from "@/components/app-shared";
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
		<header className="sticky top-0 z-50 flex h-14 shrink-0 items-center justify-between gap-2 bg-background px-4 md:px-6">
			<div className="flex min-w-0 items-center gap-2">
				<SidebarTrigger className="md:hidden" />
				<Separator className="mr-2 data-[orientation=vertical]:h-4 md:hidden" orientation="vertical" />
				<AppBreadcrumbs page={activeItem ?? (project ? { title: project.name } : null)} trail={activeItem ? trail : trail.slice(0, -1)} />
			</div>
			<div className="flex items-center gap-2">
				{project?.clientWritesPaused ? <Chip tone="warn" className="hidden sm:inline-flex">client changes paused</Chip> : null}
				<Button size="sm" variant="ghost" render={<Link to={project ? `/p/${encodeURIComponent(project.id)}/connect` : "/connect"} />} nativeButton={false}>
					<PlugIcon data-icon="inline-start" />
					<span className="max-sm:sr-only">Connect</span>
				</Button>
			</div>
		</header>
	);
}
