import { RouterLink } from "@/components/router-link";
import { cn } from "@/lib/utils";
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
import { ProjectSwitcher } from "@/components/project-switcher";

export function AppSidebar({ navGroups, footerNavLinks, project }: { navGroups: SidebarNavGroup[]; footerNavLinks: SidebarNavItem[]; project: Project | null }) {
	return (
		<Sidebar
			className={cn(
				"*:data-[slot=sidebar-inner]:bg-background",
				"*:data-[slot=sidebar-inner]:dark:bg-[radial-gradient(60%_18%_at_10%_0%,--theme(--color-foreground/.08),transparent)]",
				"**:data-[slot=sidebar-menu-button]:[&>span]:text-foreground/75"
			)}
			collapsible="icon"
			variant="sidebar"
		>
			<SidebarHeader className="h-14 justify-center border-b px-2">
				<SidebarMenuButton render={<RouterLink href="#/" aria-label="AgileFlow projects" />}><Logo /></SidebarMenuButton>
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
				<div className="px-4 pt-4 pb-2 transition-opacity group-data-[collapsible=icon]:pointer-events-none group-data-[collapsible=icon]:opacity-0">
					<p className="text-nowrap text-[9px] text-muted-foreground">
						AgileFlow connected service
					</p>
				</div>
			</SidebarFooter>
		</Sidebar>
	);
}
