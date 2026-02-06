"use client";

import {
  Monitor,
  GitBranch,
  Cloud,
  MoreHorizontal,
  Plus,
  ChevronDown,
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

export function NavSessions({
  sessions,
  activeSessionId,
  onSelect,
  onCreate,
  onDelete,
  onRename,
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
                sessions.map((session) => {
                  const isActive = session.id === activeSessionId;
                  const isEditing = editingId === session.id;
                  const TypeIcon = getTypeIcon(session.type);

                  return (
                    <SidebarMenuItem key={session.id}>
                      {isEditing ? (
                        <div className="flex items-center gap-2 px-2 py-1.5">
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            onBlur={() => handleSaveEdit(session.id)}
                            onKeyDown={(e) => handleKeyDown(e, session.id)}
                            className="flex-1 bg-background border border-border px-2 py-1 text-sm rounded focus:outline-none focus:ring-1 focus:ring-primary"
                            autoFocus
                          />
                        </div>
                      ) : (
                        <>
                          <SidebarMenuButton
                            isActive={isActive}
                            onClick={() => onSelect(session.id)}
                            tooltip={session.name}
                          >
                            <span
                              className={`h-2 w-2 rounded-full flex-shrink-0 ${getStatusColor(session.status)} ${
                                session.status === "active" ? "animate-pulse" : ""
                              }`}
                            />
                            <span className="flex-1 truncate">{session.name}</span>
                            <TypeIcon className="size-3 text-muted-foreground" />
                          </SidebarMenuButton>
                          {(onDelete || onRename) && (
                            <SidebarMenuAction showOnHover>
                              <MoreHorizontal className="size-4" />
                              <span className="sr-only">More</span>
                            </SidebarMenuAction>
                          )}
                        </>
                      )}
                    </SidebarMenuItem>
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
