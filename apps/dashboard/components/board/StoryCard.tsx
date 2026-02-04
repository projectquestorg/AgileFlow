"use client";

import { useMemo } from "react";
import { GripVertical, User, Clock, Tag } from "lucide-react";

export interface Story {
  id: string;
  title: string;
  description?: string;
  status: "backlog" | "in_progress" | "review" | "done";
  owner?: string;
  epicId?: string;
  epicName?: string;
  estimate?: number;
  priority?: "low" | "medium" | "high" | "critical";
  tags?: string[];
  createdAt?: string;
  updatedAt?: string;
}

interface StoryCardProps {
  story: Story;
  isDragging?: boolean;
  onClick?: (story: Story) => void;
}

const priorityColors: Record<string, string> = {
  critical: "bg-red-500",
  high: "bg-orange-500",
  medium: "bg-yellow-500",
  low: "bg-blue-500",
};

const ownerColors = [
  "bg-primary",
  "bg-green-500",
  "bg-blue-500",
  "bg-purple-500",
  "bg-pink-500",
  "bg-teal-500",
];

function getOwnerColor(owner: string): string {
  let hash = 0;
  for (let i = 0; i < owner.length; i++) {
    hash = owner.charCodeAt(i) + ((hash << 5) - hash);
  }
  return ownerColors[Math.abs(hash) % ownerColors.length];
}

function getOwnerInitials(owner: string): string {
  const parts = owner.split(/[-_\s]/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return owner.substring(0, 2).toUpperCase();
}

export function StoryCard({ story, isDragging, onClick }: StoryCardProps) {
  const ownerColor = useMemo(
    () => (story.owner ? getOwnerColor(story.owner) : "bg-muted"),
    [story.owner]
  );

  const ownerInitials = useMemo(
    () => (story.owner ? getOwnerInitials(story.owner) : "?"),
    [story.owner]
  );

  return (
    <div
      className={`
        group relative bg-card border border-border rounded-lg p-3 cursor-pointer
        hover:border-primary/50 hover:shadow-md transition-all
        ${isDragging ? "opacity-50 rotate-2 shadow-lg" : ""}
      `}
      onClick={() => onClick?.(story)}
      draggable
    >
      {/* Drag handle */}
      <div className="absolute left-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-50 transition-opacity">
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </div>

      {/* Priority indicator */}
      {story.priority && (
        <div
          className={`absolute top-0 left-3 w-8 h-1 rounded-b ${priorityColors[story.priority]}`}
          title={`Priority: ${story.priority}`}
        />
      )}

      {/* Story ID and Epic */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-mono text-primary">{story.id}</span>
        {story.epicName && (
          <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
            {story.epicName}
          </span>
        )}
      </div>

      {/* Title */}
      <h4 className="text-sm font-medium text-foreground mb-2 line-clamp-2">
        {story.title}
      </h4>

      {/* Tags */}
      {story.tags && story.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {story.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-0.5 text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded"
            >
              <Tag className="h-2 w-2" />
              {tag}
            </span>
          ))}
          {story.tags.length > 3 && (
            <span className="text-[10px] text-muted-foreground">
              +{story.tags.length - 3}
            </span>
          )}
        </div>
      )}

      {/* Footer: Owner and Estimate */}
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-border">
        {/* Owner */}
        <div className="flex items-center gap-1.5">
          {story.owner ? (
            <div
              className={`w-5 h-5 rounded-full ${ownerColor} flex items-center justify-center`}
              title={story.owner}
            >
              <span className="text-[9px] font-bold text-white">
                {ownerInitials}
              </span>
            </div>
          ) : (
            <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center">
              <User className="h-3 w-3 text-muted-foreground" />
            </div>
          )}
          <span className="text-[10px] text-muted-foreground truncate max-w-[80px]">
            {story.owner || "Unassigned"}
          </span>
        </div>

        {/* Estimate */}
        {story.estimate !== undefined && (
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>{story.estimate}d</span>
          </div>
        )}
      </div>
    </div>
  );
}
