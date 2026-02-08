"use client";

import {
  Monitor,
  GitBranch,
  Cloud,
  MoreHorizontal,
  Plus,
  ChevronDown,
  ChevronRight,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { useState } from "react";
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
import type { SessionInfo } from "@/hooks/useDashboard";

export type SessionType = "local" | "worktree" | "cloud";
export type SessionStatus = "active" | "idle" | "closed" | "error";

export interface Session {
  id: string;
  name: string;
  type: SessionType;
  status: SessionStatus;
  branch?: string;
  storyId?: string;
  messageCount: number;
  lastActivity: string;
}

interface NavSessionsProps {
  sessions: Session[];
  activeSessionId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete?: (id: string) => void;
  onRename?: (id: string, newName: string) => void;
  sessionList?: SessionInfo[];
}

function getStatusColor(status: SessionStatus) {
  switch (status) {
    case "active":
      return "bg-green-500";
    case "idle":
      return "bg-yellow-500";
    case "error":
      return "bg-red-500";
    default:
      return "bg-muted-foreground/50";
  }
}

function getTypeIcon(type: SessionType) {
  switch (type) {
    case "local":
      return Monitor;
    case "worktree":
      return GitBranch;
    case "cloud":
      return Cloud;
  }
}

function getSyncColor(syncStatus?: string) {
  switch (syncStatus) {
    case "synced":
      return "text-green-500";
    case "ahead":
    case "behind":
      return "text-yellow-500";
    case "diverged":
      return "text-red-500";
    default:
      return "text-muted-foreground/50";
  }
}

function getSyncDotColor(syncStatus?: string) {
  switch (syncStatus) {
    case "synced":
      return "bg-green-500";
    case "ahead":
    case "behind":
      return "bg-yellow-500";
    case "diverged":
      return "bg-red-500";
    default:
      return "bg-muted-foreground/30";
  }
}

function SyncIndicator({ info }: { info?: SessionInfo }) {
  if (!info) return null;

  return (
    <div className="flex items-center gap-1 text-[10px]">
      <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${getSyncDotColor(info.syncStatus)}`} />
      {(info.ahead > 0 || info.behind > 0) && (
        <span className={`flex items-center gap-0.5 ${getSyncColor(info.syncStatus)}`}>
          {info.ahead > 0 && (
            <span className="flex items-center">
              <ArrowUp className="h-2.5 w-2.5" />
              {info.ahead}
            </span>
          )}
          {info.behind > 0 && (
            <span className="flex items-center">
              <ArrowDown className="h-2.5 w-2.5" />
              {info.behind}
            </span>
          )}
        </span>
      )}
    </div>
  );
}

function SessionRow({
  session,
  isActive,
  isEditing,
  editName,
  syncInfo,
  isLast,
  onSelect,
  onEditName,
  onSaveEdit,
  onKeyDown,
  onDelete,
  onRename,
}: {
  session: Session;
  isActive: boolean;
  isEditing: boolean;
  editName: string;
  syncInfo?: SessionInfo;
  isLast: boolean;
  onSelect: () => void;
  onEditName: (name: string) => void;
  onSaveEdit: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onDelete?: () => void;
  onRename?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const TypeIcon = getTypeIcon(session.type);
  const showTree = session.type === "worktree" || session.type === "cloud";

  return (
    <SidebarMenuItem>
      {isEditing ? (
        <div className="flex items-center gap-2 px-2 py-1.5">
          <input
            type="text"
            value={editName}
            onChange={(e) => onEditName(e.target.value)}
            onBlur={onSaveEdit}
            onKeyDown={onKeyDown}
            className="flex-1 bg-background border border-border px-2 py-1 text-sm rounded focus:outline-none focus:ring-1 focus:ring-primary"
            autoFocus
          />
        </div>
      ) : (
        <>
          <div className="flex items-center">
            {/* Tree connector line */}
            <div className="w-4 flex-shrink-0 flex items-center justify-center relative">
              <div className={`absolute top-0 left-1/2 w-px bg-border ${isLast ? "h-1/2" : "h-full"}`} />
              <div className="absolute top-1/2 left-1/2 w-2 h-px bg-border" />
            </div>
            <SidebarMenuButton
              isActive={isActive}
              onClick={onSelect}
              tooltip={session.name}
              className="flex-1"
            >
              <span
                className={`h-2 w-2 rounded-full flex-shrink-0 ${getStatusColor(session.status)} ${
                  session.status === "active" ? "animate-pulse" : ""
                }`}
              />
              <span className="flex-1 truncate text-xs">{session.name}</span>
              <SyncIndicator info={syncInfo} />
              <TypeIcon className="size-3 text-muted-foreground flex-shrink-0" />
              {showTree && (
                <button
                  onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
                  className="p-0.5 -mr-1 hover:bg-muted rounded"
                >
                  {expanded ? (
                    <ChevronDown className="size-3 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="size-3 text-muted-foreground" />
                  )}
                </button>
              )}
            </SidebarMenuButton>
            {(onDelete || onRename) && (
              <SidebarMenuAction showOnHover>
                <MoreHorizontal className="size-4" />
                <span className="sr-only">More</span>
              </SidebarMenuAction>
            )}
          </div>

          {/* Expanded details */}
          {expanded && (
            <div className="ml-8 pl-2 border-l border-border text-[10px] text-muted-foreground py-1 space-y-0.5">
              {session.branch && (
                <div className="flex items-center gap-1">
                  <GitBranch className="h-2.5 w-2.5" />
                  <span className="font-mono">{session.branch}</span>
                </div>
              )}
              {session.storyId && (
                <div className="flex items-center gap-1">
                  <span>Story: {session.storyId}</span>
                </div>
              )}
              {syncInfo && (
                <div className="flex items-center gap-1">
                  <span>Sync: {syncInfo.syncStatus}</span>
                  {syncInfo.ahead > 0 && <span className="text-yellow-500">({syncInfo.ahead} ahead)</span>}
                  {syncInfo.behind > 0 && <span className="text-yellow-500">({syncInfo.behind} behind)</span>}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </SidebarMenuItem>
  );
}

export function NavSessions({
  sessions,
  activeSessionId,
  onSelect,
  onCreate,
  onDelete,
  onRename,
  sessionList,
}: NavSessionsProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const handleSaveEdit = (id: string) => {
    if (onRename && editName.trim()) {
      onRename(id, editName.trim());
    }
    setEditingId(null);
    setEditName("");
  };

  const handleKeyDown = (e: React.KeyboardEvent, id: string) => {
    if (e.key === "Enter") {
      handleSaveEdit(id);
    } else if (e.key === "Escape") {
      setEditingId(null);
      setEditName("");
    }
  };

  // Build sync info lookup from sessionList
  const syncInfoMap = new Map<string, SessionInfo>();
  if (sessionList) {
    for (const info of sessionList) {
      syncInfoMap.set(info.id, info);
    }
  }

  // Group sessions by type for tree visualization
  const localSessions = sessions.filter(s => s.type === "local");
  const worktreeSessions = sessions.filter(s => s.type === "worktree");
  const cloudSessions = sessions.filter(s => s.type === "cloud");
  const allGrouped = [...localSessions, ...worktreeSessions, ...cloudSessions];

  return (
    <Collapsible defaultOpen className="group/collapsible">
      <SidebarGroup>
        <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-md px-2 h-8 text-sidebar-foreground/70 text-xs hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors">
          <span className="flex-1 text-left">Sessions</span>
          {sessions.length > 0 && (
            <Badge variant="secondary" className="h-5 min-w-5 px-1.5 text-[10px]">
              {sessions.length}
            </Badge>
          )}
          <ChevronDown className="size-4 transition-transform group-data-[state=open]/collapsible:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarGroupContent>
            <SidebarMenu>
              {/* New Session Button */}
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={onCreate}
                  className="text-sidebar-foreground/70"
                >
                  <Plus className="size-4" />
                  <span>New Session</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {sessions.length === 0 ? (
                <SidebarMenuItem>
                  <div className="text-center py-4 px-2">
                    <Monitor className="h-5 w-5 mx-auto mb-1.5 text-muted-foreground/50" />
                    <p className="text-xs text-muted-foreground">No sessions</p>
                  </div>
                </SidebarMenuItem>
              ) : (
                allGrouped.map((session, idx) => {
                  const isActive = session.id === activeSessionId;
                  const isEditing = editingId === session.id;
                  const syncInfo = syncInfoMap.get(session.id);
                  const isLast = idx === allGrouped.length - 1;

                  return (
                    <SessionRow
                      key={session.id}
                      session={session}
                      isActive={isActive}
                      isEditing={isEditing}
                      editName={editName}
                      syncInfo={syncInfo}
                      isLast={isLast}
                      onSelect={() => onSelect(session.id)}
                      onEditName={setEditName}
                      onSaveEdit={() => handleSaveEdit(session.id)}
                      onKeyDown={(e) => handleKeyDown(e, session.id)}
                      onDelete={onDelete ? () => onDelete(session.id) : undefined}
                      onRename={onRename ? () => {
                        setEditingId(session.id);
                        setEditName(session.name);
                      } : undefined}
                    />
                  );
                })
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  );
}
