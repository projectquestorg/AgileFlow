"use client";

import { useState } from "react";
import { Plus, MoreHorizontal, AlertCircle } from "lucide-react";
import { Story, StoryCard } from "./StoryCard";

export interface ColumnConfig {
  id: string;
  title: string;
  color: string;
  wipLimit?: number;
}

interface KanbanColumnProps {
  config: ColumnConfig;
  stories: Story[];
  onStoryClick?: (story: Story) => void;
  onStoryDrop?: (storyId: string, newStatus: string) => void;
  onAddStory?: (status: string) => void;
}

export function KanbanColumn({
  config,
  stories,
  onStoryClick,
  onStoryDrop,
  onAddStory,
}: KanbanColumnProps) {
  const [isDragOver, setIsDragOver] = useState(false);

  const isOverWipLimit = config.wipLimit !== undefined && stories.length > config.wipLimit;
  const isAtWipLimit = config.wipLimit !== undefined && stories.length === config.wipLimit;

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const storyId = e.dataTransfer.getData("storyId");
    if (storyId && onStoryDrop) {
      onStoryDrop(storyId, config.id);
    }
  };

  const handleDragStart = (e: React.DragEvent, storyId: string) => {
    e.dataTransfer.setData("storyId", storyId);
  };

  return (
    <div
      className={`
        flex flex-col min-w-[280px] max-w-[320px] bg-muted/30 rounded-lg
        ${isDragOver ? "ring-2 ring-primary/50 bg-primary/5" : ""}
      `}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Column Header */}
      <div className="flex items-center justify-between p-3 border-b border-border">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${config.color}`} />
          <h3 className="text-sm font-semibold text-foreground">{config.title}</h3>
          <span
            className={`
              text-xs px-1.5 py-0.5 rounded-full
              ${isOverWipLimit
                ? "bg-red-500/20 text-red-500"
                : isAtWipLimit
                ? "bg-yellow-500/20 text-yellow-500"
                : "bg-muted text-muted-foreground"
              }
            `}
          >
            {stories.length}
            {config.wipLimit !== undefined && `/${config.wipLimit}`}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {isOverWipLimit && (
            <span title="WIP limit exceeded">
              <AlertCircle className="h-4 w-4 text-red-500" />
            </span>
          )}
          <button
            className="p-1 hover:bg-muted rounded transition-colors"
            onClick={() => onAddStory?.(config.id)}
            title="Add story"
          >
            <Plus className="h-4 w-4 text-muted-foreground" />
          </button>
          <button className="p-1 hover:bg-muted rounded transition-colors">
            <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* WIP Warning */}
      {isOverWipLimit && (
        <div className="mx-3 mt-2 px-2 py-1 bg-red-500/10 border border-red-500/20 rounded text-xs text-red-500">
          WIP limit exceeded ({stories.length}/{config.wipLimit})
        </div>
      )}

      {/* Stories */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {stories.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <span className="text-sm">No stories</span>
            <button
              className="mt-2 text-xs text-primary hover:underline"
              onClick={() => onAddStory?.(config.id)}
            >
              + Add story
            </button>
          </div>
        ) : (
          stories.map((story) => (
            <div
              key={story.id}
              draggable
              onDragStart={(e) => handleDragStart(e, story.id)}
            >
              <StoryCard story={story} onClick={onStoryClick} />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
