import { useLocation, useMatch } from "react-router-dom";
import { useApp } from "@/lib/app-context";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { FullWidthDivider } from "@/components/full-width-divider";
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
		<div className="overflow-hidden">
			<SidebarProvider className="relative mx-auto h-svh w-full max-w-6xl lg:border-x">
				<FullWidthDivider className="top-14 z-60 -translate-y-px" />
				<AppSidebar navGroups={navGroups} footerNavLinks={footer} project={project} />
				<SidebarInset className="min-w-0">
					<AppHeader activeItem={active} project={project} />
					<main id="main" tabIndex={-1} className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto p-4 outline-none md:p-6">
						{children}
					</main>
				</SidebarInset>
			</SidebarProvider>
		</div>
	);
}
