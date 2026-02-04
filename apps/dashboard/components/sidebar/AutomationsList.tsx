"use client";

import { Play, Square, Clock, AlertCircle, CheckCircle, Loader2, Calendar, RefreshCw } from "lucide-react";
import { Automation } from "@/hooks/useDashboard";

interface AutomationsListProps {
  automations: Automation[];
  onRun: (id: string) => void;
  onStop: (id: string) => void;
}

function formatSchedule(schedule?: Automation["schedule"]): string {
  if (!schedule) return "Manual";

  switch (schedule.type) {
    case "on_session":
      return "Every session";
    case "daily":
      return `Daily${schedule.hour !== undefined ? ` at ${schedule.hour}:00` : ""}`;
    case "weekly": {
      const day = typeof schedule.day === "string"
        ? schedule.day.charAt(0).toUpperCase() + schedule.day.slice(1)
        : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][schedule.day || 0];
      return `${day}${schedule.hour !== undefined ? ` at ${schedule.hour}:00` : ""}`;
    }
    case "monthly":
      return `${schedule.date || 1}${getOrdinalSuffix(schedule.date || 1)} of month`;
    case "interval":
      return `Every ${schedule.hours || 24}h`;
    default:
      return "Manual";
  }
}

function getOrdinalSuffix(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

function formatNextRun(nextRun?: string | null): string {
  if (!nextRun) return "";

  // Handle non-date strings like "Every session" or "Every 24 hours"
  if (nextRun.includes("Every") || !nextRun.includes("T")) {
    return nextRun;
  }

  try {
    const date = new Date(nextRun);
    const now = new Date();
    const diff = date.getTime() - now.getTime();

    if (diff < 0) return "Due";
    if (diff < 3600000) return `${Math.round(diff / 60000)}m`;
    if (diff < 86400000) return `${Math.round(diff / 3600000)}h`;
    if (diff < 604800000) return `${Math.round(diff / 86400000)}d`;

    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return nextRun;
  }
}

function StatusIcon({ status }: { status: Automation["status"] }) {
  switch (status) {
    case "running":
      return <Loader2 className="h-3.5 w-3.5 text-primary animate-spin" />;
    case "error":
      return <AlertCircle className="h-3.5 w-3.5 text-red-500" />;
    case "disabled":
      return <Square className="h-3.5 w-3.5 text-muted-foreground/50" />;
    default:
      return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
  }
}

export function AutomationsList({ automations, onRun, onStop }: AutomationsListProps) {
  if (automations.length === 0) {
    return (
      <div className="text-center py-4">
        <div className="bg-muted/30 rounded-full p-2.5 w-fit mx-auto mb-2">
          <RefreshCw className="h-4 w-4 text-muted-foreground/50" />
        </div>
        <p className="text-xs text-muted-foreground">No automations</p>
        <p className="text-[10px] text-muted-foreground/70 mt-0.5">
          Configure with <code className="bg-muted px-1 rounded">/automate</code>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {automations.map((automation) => (
        <div
          key={automation.id}
          className={`group flex items-center gap-2 px-3 py-2.5 text-sm rounded-lg transition-colors ${
            automation.status === "running"
              ? "bg-primary/10 border border-primary/20"
              : automation.status === "error"
              ? "bg-red-500/10 border border-red-500/20"
              : "hover:bg-muted/50 border border-transparent"
          }`}
        >
          <StatusIcon status={automation.status} />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className={`truncate font-medium ${
                automation.status === "disabled" ? "text-muted-foreground/70" : ""
              }`}>
                {automation.name}
              </span>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-0.5">
                <Calendar className="h-2.5 w-2.5" />
                {formatSchedule(automation.schedule)}
              </span>
              {automation.nextRun && automation.status !== "disabled" && (
                <>
                  <span>•</span>
                  <span className={automation.nextRun === "Due" ? "text-primary" : ""}>
                    {formatNextRun(automation.nextRun)}
                  </span>
                </>
              )}
              {automation.lastRun && (
                <>
                  <span>•</span>
                  <span className="flex items-center gap-0.5">
                    {automation.lastRunSuccess !== false ? (
                      <CheckCircle className="h-2.5 w-2.5 text-green-500" />
                    ) : (
                      <AlertCircle className="h-2.5 w-2.5 text-red-500" />
                    )}
                  </span>
                </>
              )}
            </div>
          </div>

          {automation.status === "running" ? (
            <button
              onClick={() => onStop(automation.id)}
              className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-500/20 rounded transition-all"
              title="Stop automation"
            >
              <Square className="h-3.5 w-3.5 text-red-500" />
            </button>
          ) : (
            <button
              onClick={() => onRun(automation.id)}
              disabled={automation.status === "disabled"}
              className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-primary/20 rounded transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              title="Run now"
            >
              <Play className="h-3.5 w-3.5 text-primary" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
