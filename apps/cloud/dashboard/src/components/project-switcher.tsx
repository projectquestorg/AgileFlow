import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronsUpDownIcon, FolderKanbanIcon } from "lucide-react";
import { useApp, type Project } from "@/lib/app-context";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { SidebarGroup, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";

/** Workspace project switcher (Popover + Command). */
export function ProjectSwitcher({ current }: { current: Project | null }) {
	const { me } = useApp();
	const navigate = useNavigate();
	const [open, setOpen] = useState(false);
	if (!me.workspace) return null;
	return (
		<SidebarGroup>
			<SidebarMenu>
				<SidebarMenuItem>
					<Popover open={open} onOpenChange={setOpen}>
						<PopoverTrigger
							render={
								<SidebarMenuButton size="lg" className="border" />
							}
						>
							<FolderKanbanIcon />
							<span className="flex min-w-0 flex-col text-left leading-tight">
								<span className="truncate text-xs text-muted-foreground">{me.workspace.name}</span>
								<span className="truncate font-medium text-foreground">{current?.name ?? "All projects"}</span>
							</span>
							<ChevronsUpDownIcon className="ml-auto" />
						</PopoverTrigger>
						<PopoverContent align="start" className="w-64 p-0">
							<Command>
								<CommandInput placeholder="Find a project" />
								<CommandList>
									<CommandEmpty>No projects found.</CommandEmpty>
									<CommandGroup heading="Workspace">
										<CommandItem value="__all__ All projects" onSelect={() => { setOpen(false); navigate("/"); }}>
											All projects
										</CommandItem>
									</CommandGroup>
									{me.projects.length ? (
										<CommandGroup heading="Projects">
											{me.projects.map((p) => (
												<CommandItem key={p.id} value={`${p.name} ${p.id}`} data-checked={p.id === current?.id} onSelect={() => { setOpen(false); navigate(`/p/${encodeURIComponent(p.id)}/overview`); }}>
													<span className="truncate">{p.name}</span>
													{p.archived ? <span className="text-xs text-muted-foreground">archived</span> : null}
												</CommandItem>
											))}
										</CommandGroup>
									) : null}
								</CommandList>
							</Command>
						</PopoverContent>
					</Popover>
				</SidebarMenuItem>
			</SidebarMenu>
		</SidebarGroup>
	);
}
