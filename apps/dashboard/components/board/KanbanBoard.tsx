"use client";

import { useState, useMemo } from "react";
import { Filter, SortAsc, LayoutGrid, RefreshCw } from "lucide-react";
import { Story } from "./StoryCard";
import { KanbanColumn, ColumnConfig } from "./KanbanColumn";

// Default column configuration
const DEFAULT_COLUMNS: ColumnConfig[] = [
  { id: "backlog", title: "Backlog", color: "bg-gray-500" },
  { id: "in_progress", title: "In Progress", color: "bg-blue-500", wipLimit: 3 },
  { id: "review", title: "Review", color: "bg-yellow-500", wipLimit: 2 },
  { id: "done", title: "Done", color: "bg-green-500" },
];

interface KanbanBoardProps {
  stories?: Story[];
  columns?: ColumnConfig[];
  onStoryClick?: (story: Story) => void;
  onStoryStatusChange?: (storyId: string, newStatus: string) => void;
  onAddStory?: (status: string) => void;
  onRefresh?: () => void;
  isLoading?: boolean;
}

type FilterType = "all" | "mine" | "unassigned";
type SortType = "priority" | "created" | "updated" | "id";

export function KanbanBoard({
  stories = [],
  columns = DEFAULT_COLUMNS,
  onStoryClick,
  onStoryStatusChange,
  onAddStory,
  onRefresh,
  isLoading,
}: KanbanBoardProps) {
  const [filter, setFilter] = useState<FilterType>("all");
  const [sortBy, setSortBy] = useState<SortType>("priority");
  const [selectedEpic, setSelectedEpic] = useState<string | null>(null);

  // Get unique epics for filtering
  const epics = useMemo(() => {
    const epicSet = new Set<string>();
    stories.forEach((story) => {
      if (story.epicName) epicSet.add(story.epicName);
    });
    return Array.from(epicSet);
  }, [stories]);

  // Filter and sort stories
  const filteredStories = useMemo(() => {
    let result = [...stories];

    // Apply epic filter
    if (selectedEpic) {
      result = result.filter((s) => s.epicName === selectedEpic);
    }

    // Apply ownership filter
    if (filter === "mine") {
      // In a real app, this would use the current user
      result = result.filter((s) => s.owner);
    } else if (filter === "unassigned") {
      result = result.filter((s) => !s.owner);
    }

    // Sort
    result.sort((a, b) => {
      switch (sortBy) {
        case "priority": {
          const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
          const aPriority = a.priority ? priorityOrder[a.priority] : 4;
          const bPriority = b.priority ? priorityOrder[b.priority] : 4;
          return aPriority - bPriority;
        }
        case "created":
          return (b.createdAt || "").localeCompare(a.createdAt || "");
        case "updated":
          return (b.updatedAt || "").localeCompare(a.updatedAt || "");
        case "id":
          return a.id.localeCompare(b.id);
        default:
          return 0;
      }
    });

    return result;
  }, [stories, filter, sortBy, selectedEpic]);

  // Group stories by status
  const storiesByColumn = useMemo(() => {
    const grouped: Record<string, Story[]> = {};
    columns.forEach((col) => {
      grouped[col.id] = filteredStories.filter((s) => s.status === col.id);
    });
    return grouped;
  }, [filteredStories, columns]);

  // Statistics
  const stats = useMemo(() => {
    const total = stories.length;
    const done = stories.filter((s) => s.status === "done").length;
    const inProgress = stories.filter((s) => s.status === "in_progress").length;
    return { total, done, inProgress, completion: total > 0 ? Math.round((done / total) * 100) : 0 };
  }, [stories]);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
        <div className="flex items-center gap-4">
          {/* Filter by Epic */}
          <div className="flex items-center gap-2">
            <LayoutGrid className="h-4 w-4 text-muted-foreground" />
            <select
              className="text-sm bg-transparent border-none text-foreground focus:outline-none cursor-pointer"
              value={selectedEpic || ""}
              onChange={(e) => setSelectedEpic(e.target.value || null)}
            >
              <option value="">All Epics</option>
              {epics.map((epic) => (
                <option key={epic} value={epic}>
                  {epic}
                </option>
              ))}
            </select>
          </div>

          {/* Filter by Assignment */}
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <select
              className="text-sm bg-transparent border-none text-foreground focus:outline-none cursor-pointer"
              value={filter}
              onChange={(e) => setFilter(e.target.value as FilterType)}
            >
              <option value="all">All Stories</option>
              <option value="mine">Assigned</option>
              <option value="unassigned">Unassigned</option>
            </select>
          </div>

          {/* Sort */}
          <div className="flex items-center gap-2">
            <SortAsc className="h-4 w-4 text-muted-foreground" />
            <select
              className="text-sm bg-transparent border-none text-foreground focus:outline-none cursor-pointer"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortType)}
            >
              <option value="priority">Priority</option>
              <option value="created">Created</option>
              <option value="updated">Updated</option>
              <option value="id">ID</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Stats */}
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>
              <span className="font-medium text-foreground">{stats.total}</span> total
            </span>
            <span>
              <span className="font-medium text-blue-500">{stats.inProgress}</span> in progress
            </span>
            <span>
              <span className="font-medium text-green-500">{stats.done}</span> done
            </span>
            <div className="flex items-center gap-1">
              <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 transition-all"
                  style={{ width: `${stats.completion}%` }}
                />
              </div>
              <span className="font-medium text-foreground">{stats.completion}%</span>
            </div>
          </div>

          {/* Refresh */}
          <button
            className={`p-1.5 hover:bg-muted rounded transition-colors ${isLoading ? "animate-spin" : ""}`}
            onClick={onRefresh}
            disabled={isLoading}
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Board */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden p-4">
        <div className="flex gap-4 h-full">
          {columns.map((column) => (
            <KanbanColumn
              key={column.id}
              config={column}
              stories={storiesByColumn[column.id] || []}
              onStoryClick={onStoryClick}
              onStoryDrop={onStoryStatusChange}
              onAddStory={onAddStory}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
