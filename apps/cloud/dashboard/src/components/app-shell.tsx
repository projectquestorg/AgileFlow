import { useLocation, useMatch } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useApp } from "@/lib/app-context";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppHeader } from "@/components/app-header";
import { AppSidebar } from "@/components/app-sidebar";
import { buildFooterLinks, buildNavGroups, flattenNav } from "@/components/app-shared";

export function AppShell({ children }: { children: React.ReactNode }) {
	const { me } = useApp();
	const { pathname } = useLocation();
	const m = useMatch("/p/:pid/*");
	const pid = m?.params.pid ?? null;
	const project = pid ? me.projects.find((p) => p.id === pid) ?? null : null;
	const navGroups = buildNavGroups(pathname, project ? pid : null, project?.role === "admin");
	const footer = buildFooterLinks(pathname);
	const active = flattenNav(navGroups, footer).find((i) => i.isActive) ?? null;

	return (
		<SidebarProvider className={cn("[--app-wrapper-max-width:80rem]")}>
			<AppSidebar navGroups={navGroups} footerNavLinks={footer} project={project} />
			<SidebarInset className="min-w-0">
				<AppHeader activeItem={active} project={project} />
				<main
					id="main"
					tabIndex={-1}
					className={cn(
						"flex min-w-0 flex-1 flex-col p-4 outline-none md:p-6",
						"mx-auto w-full max-w-(--app-wrapper-max-width)"
					)}
				>
					{children}
				</main>
			</SidebarInset>
		</SidebarProvider>
	);
}
