import { RouterLink } from "@/components/router-link";
import { Logo } from "@/components/logo";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@/components/ui/sidebar";
import type { SidebarNavGroup, SidebarNavItem } from "@/components/app-shared";
import type { Project } from "@/lib/app-context";
import { LatestChange } from "@/components/latest-change";
import { NavGroup } from "@/components/nav-group";
import { NavUser } from "@/components/nav-user";
import { ProjectSwitcher } from "@/components/project-switcher";

export function AppSidebar({ navGroups, footerNavLinks, project }: { navGroups: SidebarNavGroup[]; footerNavLinks: SidebarNavItem[]; project: Project | null }) {
	return (
		<Sidebar
			className="static min-h-full *:data-[slot=sidebar-inner]:bg-background"
			collapsible="offcanvas"
			variant="sidebar"
		>
			<SidebarHeader className="relative h-14 justify-center px-2 py-0">
				<RouterLink
					className="flex h-10 w-max items-center justify-center rounded-lg px-3 hover:bg-muted dark:hover:bg-muted/50"
					href="#/"
					aria-label="AgileFlow projects"
				>
					<Logo />
				</RouterLink>
			</SidebarHeader>
			<SidebarContent>
				<ProjectSwitcher current={project} />
				{navGroups.map((group, index) => (
					<NavGroup key={`sidebar-group-${index}`} {...group} />
				))}
			</SidebarContent>
			<SidebarFooter className="gap-0 p-0">
				<LatestChange project={project} />
				<SidebarMenu className="border-t p-2">
					{footerNavLinks.map((item) => (
						<SidebarMenuItem key={item.title}>
							<SidebarMenuButton className="text-muted-foreground" isActive={item.isActive} size="sm" render={<RouterLink href={item.path} />}>{item.icon}<span>{item.title}</span></SidebarMenuButton>
						</SidebarMenuItem>
					))}
				</SidebarMenu>
				<NavUser />
			</SidebarFooter>
		</Sidebar>
	);
}
