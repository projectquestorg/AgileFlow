"use client";

import { useState } from "react";
import {
  ChevronRight,
  Plus,
  Minus,
  Loader2,
  RotateCcw,
} from "lucide-react";
import { FileChange } from "@/hooks/useDashboard";

interface FileChangeRowProps {
  file: FileChange;
  isSelected: boolean;
  isLoading: boolean;
  isStaged: boolean;
  onSelect: () => void;
  onStage?: () => void;
  onUnstage?: () => void;
  onRevert?: () => void;
}

// Get color classes for status
function getStatusColors(status: FileChange["status"], isStaged: boolean) {
  if (isStaged) {
    return {
      bg: "bg-green-500/10 hover:bg-green-500/15",
      border: "border-green-500/20",
      text: "text-green-500",
      icon: "text-green-500",
    };
  }

  switch (status) {
    case "added":
    case "untracked":
      return {
        bg: "bg-green-500/5 hover:bg-green-500/10",
        border: "border-green-500/10 hover:border-green-500/20",
        text: "text-green-400",
        icon: "text-green-500",
      };
    case "deleted":
      return {
        bg: "bg-red-500/5 hover:bg-red-500/10",
        border: "border-red-500/10 hover:border-red-500/20",
        text: "text-red-400",
        icon: "text-red-500",
      };
    default:
      return {
        bg: "bg-yellow-500/5 hover:bg-yellow-500/10",
        border: "border-yellow-500/10 hover:border-yellow-500/20",
        text: "text-yellow-400",
        icon: "text-yellow-500",
      };
  }
}

// Get status indicator character
function getStatusChar(status: FileChange["status"]) {
  switch (status) {
    case "added":
      return "A";
    case "untracked":
      return "?";
    case "deleted":
      return "D";
    case "modified":
      return "M";
    default:
      return "M";
  }
}

export function FileChangeRow({
  file,
  isSelected,
  isLoading,
  isStaged,
  onSelect,
  onStage,
  onUnstage,
  onRevert,
}: FileChangeRowProps) {
  const [showActions, setShowActions] = useState(false);
  const colors = getStatusColors(file.status, isStaged);

  // Extract filename from path
  const fileName = file.path.split("/").pop() || file.path;
  const dirPath = file.path.slice(0, file.path.length - fileName.length);

  return (
    <div
      className={`
        group relative rounded-lg border transition-all duration-150 cursor-pointer
        ${colors.bg} ${colors.border}
        ${isSelected ? "ring-2 ring-primary/50" : ""}
      `}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Main row content */}
      <button
        onClick={onSelect}
        className="w-full flex items-center gap-2 px-3 py-2 text-left"
      >
        {/* Expand indicator */}
        <ChevronRight
          className={`h-3.5 w-3.5 text-muted-foreground/50 transition-transform flex-shrink-0 ${
            isSelected ? "rotate-90" : ""
          }`}
        />

        {/* Status character */}
        <span
          className={`font-mono font-bold text-xs w-4 text-center ${colors.icon}`}
        >
          {getStatusChar(file.status)}
        </span>

        {/* File path */}
        <div className="flex-1 min-w-0 flex items-center gap-1">
          <span className="text-muted-foreground/50 text-xs font-mono truncate">
            {dirPath}
          </span>
          <span className="text-foreground text-xs font-mono font-medium truncate">
            {fileName}
          </span>
        </div>

        {/* Stats */}
        {(file.additions !== undefined || file.deletions !== undefined) && (
          <div className="flex items-center gap-1 text-[10px] font-mono flex-shrink-0">
            {file.additions !== undefined && file.additions > 0 && (
              <span className="text-green-500 flex items-center">
                <Plus className="h-2.5 w-2.5" />
                {file.additions}
              </span>
            )}
            {file.deletions !== undefined && file.deletions > 0 && (
              <span className="text-red-500 flex items-center">
                <Minus className="h-2.5 w-2.5" />
                {file.deletions}
              </span>
            )}
          </div>
        )}

        {/* Loading indicator */}
        {isLoading && (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary flex-shrink-0" />
        )}
      </button>

      {/* Action buttons (shown on hover) */}
      {showActions && !isLoading && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 bg-card/90 backdrop-blur-sm rounded px-1 py-0.5 border border-border shadow-sm">
          {isStaged ? (
            <>
              {onUnstage && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onUnstage();
                  }}
                  className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground transition-colors"
                  title="Unstage"
                >
                  <Minus className="h-3 w-3" />
                </button>
              )}
            </>
          ) : (
            <>
              {onStage && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onStage();
                  }}
                  className="p-1 hover:bg-green-500/20 rounded text-muted-foreground hover:text-green-500 transition-colors"
                  title="Stage"
                >
                  <Plus className="h-3 w-3" />
                </button>
              )}
              {onRevert && file.status !== "untracked" && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRevert();
                  }}
                  className="p-1 hover:bg-red-500/20 rounded text-muted-foreground hover:text-red-500 transition-colors"
                  title="Revert changes"
                >
                  <RotateCcw className="h-3 w-3" />
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
