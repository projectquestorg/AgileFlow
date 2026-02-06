"use client";

import {
  Play,
  Square,
  Clock,
  AlertCircle,
  Loader2,
  RefreshCw,
  ChevronDown,
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";

export interface AutomationSchedule {
  type: "on_session" | "daily" | "weekly" | "monthly" | "interval";
  hour?: number;
  day?: string | number;
  date?: number;
  hours?: number;
}

export interface Automation {
  id: string;
  name: string;
  status: "idle" | "running" | "error" | "disabled";
  schedule?: AutomationSchedule;
  nextRun?: string | null;
  lastRun?: string | null;
  lastRunSuccess?: boolean;
}

interface NavAutomationsProps {
  automations: Automation[];
  onRun: (id: string) => void;
  onStop: (id: string) => void;
}

function formatSchedule(schedule?: AutomationSchedule): string {
  if (!schedule) return "Manual";

  switch (schedule.type) {
    case "on_session":
      return "Every session";
    case "daily":
      return `Daily${schedule.hour !== undefined ? ` at ${schedule.hour}:00` : ""}`;
    case "weekly": {
      const day =
        typeof schedule.day === "string"
          ? schedule.day.charAt(0).toUpperCase() + schedule.day.slice(1)
          : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][schedule.day || 0];
      return `${day}${schedule.hour !== undefined ? ` at ${schedule.hour}:00` : ""}`;
    }
    case "interval":
      return `Every ${schedule.hours || 24}h`;
    default:
      return "Manual";
  }
}

function StatusIcon({ status }: { status: Automation["status"] }) {
  switch (status) {
    case "running":
      return <Loader2 className="size-4 text-primary animate-spin" />;
    case "error":
      return <AlertCircle className="size-4 text-destructive" />;
    case "disabled":
      return <Square className="size-4 text-muted-foreground/50" />;
    default:
      return <Clock className="size-4 text-muted-foreground" />;
  }
}

export function NavAutomations({
  automations,
  onRun,
  onStop,
}: NavAutomationsProps) {
  const runningCount = automations.filter((a) => a.status === "running").length;

  return (
    <Collapsible className="group/collapsible">
      <SidebarGroup>
        <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-md px-2 h-8 text-sidebar-foreground/70 text-xs hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors">
          <span className="flex-1 text-left">Automations</span>
          {runningCount > 0 && (
            <Badge className="h-5 min-w-5 px-1.5 text-[10px]">
              {runningCount}
            </Badge>
          )}
          <ChevronDown className="size-4 transition-transform group-data-[state=open]/collapsible:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarGroupContent>
            <SidebarMenu>
              {automations.length === 0 ? (
                <SidebarMenuItem>
                  <div className="text-center py-4 px-2">
                    <RefreshCw className="h-5 w-5 mx-auto mb-1.5 text-muted-foreground/50" />
                    <p className="text-xs text-muted-foreground">No automations</p>
                    <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                      Configure with <code className="bg-muted px-1 rounded">/automate</code>
                    </p>
                  </div>
                </SidebarMenuItem>
              ) : (
                automations.map((automation) => (
                  <SidebarMenuItem key={automation.id}>
                    <SidebarMenuButton
                      isActive={automation.status === "running"}
                      tooltip={`${automation.name} - ${formatSchedule(automation.schedule)}`}
                      className={
                        automation.status === "error"
                          ? "text-destructive"
                          : automation.status === "disabled"
                          ? "text-muted-foreground/50"
                          : ""
                      }
                    >
                      <StatusIcon status={automation.status} />
                      <span className="flex-1 truncate">{automation.name}</span>
                    </SidebarMenuButton>
                    <SidebarMenuAction
                      showOnHover
                      onClick={() =>
                        automation.status === "running"
                          ? onStop(automation.id)
                          : onRun(automation.id)
                      }
                    >
                      {automation.status === "running" ? (
                        <Square className="size-4 text-destructive" />
                      ) : (
                        <Play className="size-4 text-primary" />
                      )}
                      <span className="sr-only">
                        {automation.status === "running" ? "Stop" : "Run"}
                      </span>
                    </SidebarMenuAction>
                  </SidebarMenuItem>
                ))
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  );
}
