"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, Settings, Bell } from "lucide-react";
import { KanbanBoard, Story } from "@/components/board";

// Sample data for demonstration
const SAMPLE_STORIES: Story[] = [
  {
    id: "US-0042",
    title: "Implement user authentication with OAuth",
    status: "in_progress",
    owner: "AG-UI",
    epicName: "EP-005 Auth",
    priority: "high",
    estimate: 3,
    tags: ["auth", "security"],
    createdAt: "2026-02-01",
    updatedAt: "2026-02-04",
  },
  {
    id: "US-0043",
    title: "Add Google OAuth provider",
    status: "in_progress",
    owner: "AG-API",
    epicName: "EP-005 Auth",
    priority: "medium",
    estimate: 2,
    tags: ["auth", "google"],
    createdAt: "2026-02-02",
  },
  {
    id: "US-0044",
    title: "Create login page UI",
    status: "review",
    owner: "AG-UI",
    epicName: "EP-005 Auth",
    priority: "medium",
    estimate: 1,
    tags: ["ui"],
    createdAt: "2026-02-01",
  },
  {
    id: "US-0045",
    title: "Set up session management",
    status: "backlog",
    epicName: "EP-005 Auth",
    priority: "high",
    estimate: 2,
    tags: ["auth", "session"],
    createdAt: "2026-02-03",
  },
  {
    id: "US-0046",
    title: "Add password reset flow",
    status: "backlog",
    priority: "low",
    epicName: "EP-005 Auth",
    estimate: 2,
    tags: ["auth"],
    createdAt: "2026-02-03",
  },
  {
    id: "US-0047",
    title: "Implement rate limiting",
    status: "backlog",
    epicName: "EP-006 Security",
    priority: "medium",
    estimate: 1,
    createdAt: "2026-02-02",
  },
  {
    id: "US-0048",
    title: "Add CSRF protection",
    status: "done",
    owner: "AG-API",
    epicName: "EP-006 Security",
    priority: "critical",
    estimate: 1,
    tags: ["security"],
    createdAt: "2026-01-28",
    updatedAt: "2026-02-01",
  },
  {
    id: "US-0049",
    title: "Set up input validation",
    status: "done",
    owner: "AG-API",
    epicName: "EP-006 Security",
    priority: "high",
    estimate: 2,
    createdAt: "2026-01-29",
    updatedAt: "2026-02-02",
  },
  {
    id: "US-0050",
    title: "Add API documentation",
    status: "in_progress",
    owner: "AG-DOCS",
    epicName: "EP-007 Docs",
    priority: "low",
    estimate: 3,
    tags: ["docs"],
    createdAt: "2026-02-01",
  },
];

export default function BoardPage() {
  const [stories, setStories] = useState<Story[]>(SAMPLE_STORIES);
  const [isLoading, setIsLoading] = useState(false);

  const handleStoryClick = (story: Story) => {
    console.log("Story clicked:", story.id);
    // TODO: Open story detail modal
  };

  const handleStoryStatusChange = (storyId: string, newStatus: string) => {
    setStories((prev) =>
      prev.map((s) =>
        s.id === storyId
          ? { ...s, status: newStatus as Story["status"], updatedAt: new Date().toISOString() }
          : s
      )
    );
  };

  const handleAddStory = (status: string) => {
    console.log("Add story in column:", status);
    // TODO: Open new story modal
  };

  const handleRefresh = async () => {
    setIsLoading(true);
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setIsLoading(false);
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="text-sm">Back to Chat</span>
          </Link>
          <div className="flex items-center gap-2">
            <Image
              src="/banner.png"
              alt="AgileFlow"
              width={120}
              height={24}
              className="h-6 w-auto"
            />
            <span className="text-muted-foreground">/</span>
            <span className="font-medium">Kanban Board</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="p-2 hover:bg-muted rounded-lg transition-colors">
            <Bell className="h-5 w-5 text-muted-foreground" />
          </button>
          <button className="p-2 hover:bg-muted rounded-lg transition-colors">
            <Settings className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>
      </header>

      {/* Kanban Board */}
      <main className="flex-1 overflow-hidden">
        <KanbanBoard
          stories={stories}
          onStoryClick={handleStoryClick}
          onStoryStatusChange={handleStoryStatusChange}
          onAddStory={handleAddStory}
          onRefresh={handleRefresh}
          isLoading={isLoading}
        />
      </main>
    </div>
  );
}
