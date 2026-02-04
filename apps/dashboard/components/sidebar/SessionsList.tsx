"use client";

import { useState } from "react";
import {
  Plus,
  Monitor,
  GitBranch,
  Cloud,
  MoreHorizontal,
  Trash2,
  Edit2,
} from "lucide-react";

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

interface SessionsListProps {
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
      return "bg-green-500 animate-pulse";
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
      return <Monitor className="h-3 w-3" />;
    case "worktree":
      return <GitBranch className="h-3 w-3" />;
    case "cloud":
      return <Cloud className="h-3 w-3" />;
  }
}

function getTypeLabel(type: SessionType) {
  switch (type) {
    case "local":
      return "Local";
    case "worktree":
      return "Worktree";
    case "cloud":
      return "Cloud";
  }
}

// Utility function for formatting last activity time
// Currently unused but will be used for showing activity time in session items
// function formatLastActivity(timestamp: string): string {
//   const now = new Date();
//   const then = new Date(timestamp);
//   const diff = now.getTime() - then.getTime();
//
//   if (diff < 60000) return "Just now";
//   if (diff < 3600000) return `${Math.round(diff / 60000)}m ago`;
//   if (diff < 86400000) return `${Math.round(diff / 3600000)}h ago`;
//   if (diff < 604800000) return `${Math.round(diff / 86400000)}d ago`;
//
//   return then.toLocaleDateString(undefined, { month: "short", day: "numeric" });
// }

export function SessionsList({
  sessions,
  activeSessionId,
  onSelect,
  onCreate,
  onDelete,
  onRename,
}: SessionsListProps) {
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const handleStartEdit = (session: Session) => {
    setEditingId(session.id);
    setEditName(session.name);
    setMenuOpenId(null);
  };

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

  // Group sessions by status
  const activeSessions = sessions.filter((s) => s.status === "active");
  const idleSessions = sessions.filter((s) => s.status === "idle");
  const closedSessions = sessions.filter((s) => s.status === "closed" || s.status === "error");

  const renderSession = (session: Session) => {
    const isActive = session.id === activeSessionId;
    const isEditing = editingId === session.id;

    return (
      <div
        key={session.id}
        className={`group relative flex items-center gap-3 px-3 py-2.5 text-sm rounded-lg transition-all cursor-pointer ${
          isActive
            ? "bg-primary/10 border border-primary/20"
            : "hover:bg-muted/50 border border-transparent"
        }`}
        onClick={() => !isEditing && onSelect(session.id)}
      >
        {/* Status indicator */}
        <span className={`h-2 w-2 rounded-full flex-shrink-0 ${getStatusColor(session.status)}`} />

        {/* Content */}
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={() => handleSaveEdit(session.id)}
              onKeyDown={(e) => handleKeyDown(e, session.id)}
              onClick={(e) => e.stopPropagation()}
              className="w-full bg-background border border-border px-2 py-0.5 text-sm rounded focus:outline-none focus:ring-1 focus:ring-primary"
              autoFocus
            />
          ) : (
            <>
              <span className={`block truncate ${isActive ? "font-medium" : ""}`}>
                {session.name}
              </span>
              {session.storyId && (
                <span className="text-[10px] text-muted-foreground">
                  {session.storyId}
                </span>
              )}
            </>
          )}
        </div>

        {/* Type badge */}
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
          {getTypeIcon(session.type)}
          <span className="hidden sm:inline">{getTypeLabel(session.type)}</span>
        </span>

        {/* Menu button */}
        {(onDelete || onRename) && (
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpenId(menuOpenId === session.id ? null : session.id);
              }}
              className="opacity-0 group-hover:opacity-100 p-1 hover:bg-muted rounded transition-all"
            >
              <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
            </button>

            {/* Dropdown menu */}
            {menuOpenId === session.id && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setMenuOpenId(null)}
                />
                <div className="absolute right-0 top-full mt-1 z-50 bg-card border border-border rounded-lg shadow-lg py-1 w-32">
                  {onRename && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStartEdit(session);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted transition-colors"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                      Rename
                    </button>
                  )}
                  {onDelete && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(session.id);
                        setMenuOpenId(null);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-red-500 hover:bg-red-500/10 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    );
  };

  if (sessions.length === 0) {
    return (
      <div className="space-y-3">
        <div className="text-center py-6">
          <div className="bg-muted/30 rounded-full p-3 w-fit mx-auto mb-2">
            <Monitor className="h-5 w-5 text-muted-foreground/50" />
          </div>
          <p className="text-xs text-muted-foreground">No sessions</p>
          <p className="text-[10px] text-muted-foreground/70 mt-0.5">
            Start a new session to begin
          </p>
        </div>
        <button
          onClick={onCreate}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
        >
          <Plus className="h-4 w-4" />
          New Session
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {/* Active sessions */}
      {activeSessions.map(renderSession)}

      {/* Idle sessions */}
      {idleSessions.length > 0 && (
        <>
          {activeSessions.length > 0 && (
            <div className="pt-2 pb-1">
              <span className="text-[10px] uppercase text-muted-foreground/70 font-semibold tracking-wide px-1">
                Idle
              </span>
            </div>
          )}
          {idleSessions.map(renderSession)}
        </>
      )}

      {/* Closed sessions */}
      {closedSessions.length > 0 && (
        <>
          <div className="pt-2 pb-1">
            <span className="text-[10px] uppercase text-muted-foreground/70 font-semibold tracking-wide px-1">
              Closed
            </span>
          </div>
          {closedSessions.map(renderSession)}
        </>
      )}
    </div>
  );
}
