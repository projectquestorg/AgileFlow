"use client";

import { ChevronDown } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import type { ProjectStatus, EpicSummary } from "@/hooks/useDashboard";

interface NavStatusProps {
  status: ProjectStatus | null;
}

function EpicRow({ epic }: { epic: EpicSummary }) {
  const pct = epic.storyCount > 0
    ? Math.round((epic.doneCount / epic.storyCount) * 100)
    : 0;

  return (
    <div className="px-2 py-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="truncate flex-1 font-medium">{epic.id}: {epic.title}</span>
        <span className="text-muted-foreground ml-2 flex-shrink-0 text-[10px]">
          {epic.doneCount}/{epic.storyCount}
        </span>
      </div>
      <div className="mt-1 h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function NavStatus({ status }: NavStatusProps) {
  if (!status) return null;

  const pct = status.total > 0
    ? Math.round((status.done / status.total) * 100)
    : 0;

  return (
    <Collapsible defaultOpen className="group/collapsible">
      <SidebarGroup>
        <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-md px-2 h-8 text-sidebar-foreground/70 text-xs hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors">
          <span className="flex-1 text-left">Project Status</span>
          <Badge variant="secondary" className="h-5 min-w-5 px-1.5 text-[10px]">
            {pct}%
          </Badge>
          <ChevronDown className="size-4 transition-transform group-data-[state=open]/collapsible:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarGroupContent>
            <SidebarMenu>
              {/* Progress bar */}
              <SidebarMenuItem>
                <div className="px-2 py-2">
                  <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              </SidebarMenuItem>

              {/* Stats row */}
              <SidebarMenuItem>
                <div className="px-2 py-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span className="text-green-500 font-medium">{status.done} done</span>
                  <span>|</span>
                  {status.inProgress > 0 && (
                    <>
                      <span className="text-yellow-500 font-medium">{status.inProgress} WIP</span>
                      <span>|</span>
                    </>
                  )}
                  <span>{status.ready} ready</span>
                  {status.blocked > 0 && (
                    <>
                      <span>|</span>
                      <span className="text-red-500 font-medium">{status.blocked} blocked</span>
                    </>
                  )}
                </div>
              </SidebarMenuItem>

              {/* Epic list */}
              {status.epics.length > 0 && (
                <>
                  <SidebarMenuItem>
                    <div className="px-2 pt-2 pb-1 text-[10px] uppercase text-muted-foreground/60 font-medium tracking-wider">
                      Epics
                    </div>
                  </SidebarMenuItem>
                  {status.epics.map((epic) => (
                    <SidebarMenuItem key={epic.id}>
                      <EpicRow epic={epic} />
                    </SidebarMenuItem>
                  ))}
                </>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  );
}
