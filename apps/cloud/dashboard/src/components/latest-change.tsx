import { RouterLink } from "@/components/router-link";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { Project } from "@/lib/app-context";
import { XIcon } from "lucide-react";

/** Sidebar status card: project policy state, or a prompt to connect an agent. */
export function LatestChange({ project }: { project: Project | null }) {
	const [isOpen, setIsOpen] = useState(true);

	const latestChange = project?.clientWritesPaused
		? { badge: "PROJECT POLICY", title: "Client changes paused", description: "Agents and CLI can only read.", readMore: { href: `#/p/${encodeURIComponent(project.id)}/controls`, label: "Project controls" } }
		: project?.archived
			? { badge: "PROJECT STATE", title: "Archived project", description: "This project is read-only.", readMore: { href: `#/p/${encodeURIComponent(project.id)}/admin`, label: "Administration" } }
			: { badge: "CONNECT", title: "Connect an agent", description: "Claude Code, Codex, or Cursor.", readMore: { href: project ? `#/p/${encodeURIComponent(project.id)}/connect` : "#/connect", label: "Setup and diagnostics" } };

	if (!isOpen && !project?.clientWritesPaused) {
		return null;
	}

	return (
		<div
			className={cn(
				"group/latest-change size-full min-h-27 justify-center border-t",
				"relative flex size-full flex-col gap-1 overflow-hidden px-4 pt-3 pb-1 *:text-nowrap",
				"transition-opacity group-data-[collapsible=icon]:pointer-events-none group-data-[collapsible=icon]:opacity-0"
			)}
		>
			<span className="font-light font-mono text-[10px] text-muted-foreground">
				{latestChange.badge}
			</span>
			<p className="font-heading font-medium text-xs">{latestChange.title}</p>
			<span className="text-[10px] text-muted-foreground">
				{latestChange.description}
			</span>
			<Button className="w-max px-0 font-light text-xs" size="sm" variant="link" render={<RouterLink href={latestChange.readMore.href} />} nativeButton={false}>{latestChange.readMore.label}</Button>
			{!project?.clientWritesPaused ? (
				<Button
					aria-label="Dismiss"
					className="absolute top-2 right-2 z-10 size-6 rounded-full opacity-0 transition-opacity group-hover/latest-change:opacity-100 focus-visible:opacity-100"
					onClick={() => setIsOpen(false)}
					size="icon-sm"
					variant="ghost"
				>
					<XIcon className="text-muted-foreground" />
				</Button>
			) : null}
		</div>
	);
}
