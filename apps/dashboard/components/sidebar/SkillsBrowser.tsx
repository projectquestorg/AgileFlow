"use client";

import { useState, useMemo } from "react";
import {
  Search,
  Zap,
  GitCommit,
  Code,
  FileText,
  TestTube,
  Bug,
  Layers,
  FolderKanban,
  CheckSquare,
  BarChart3,
  Package,
  Settings,
  RefreshCw,
  ChevronRight,
} from "lucide-react";

export interface Skill {
  id: string;
  name: string;
  command: string;
  description: string;
  category: "workflow" | "git" | "testing" | "planning" | "analytics" | "system";
  icon?: React.ReactNode;
}

// Default AgileFlow skills
const DEFAULT_SKILLS: Skill[] = [
  // Workflow
  { id: "story", name: "Create Story", command: "/story", description: "Create a user story with acceptance criteria", category: "workflow", icon: <FileText className="h-3.5 w-3.5" /> },
  { id: "epic", name: "Create Epic", command: "/epic", description: "Create an epic with multiple stories", category: "workflow", icon: <FolderKanban className="h-3.5 w-3.5" /> },
  { id: "status", name: "Update Status", command: "/status", description: "Update story status and progress", category: "workflow", icon: <CheckSquare className="h-3.5 w-3.5" /> },
  { id: "board", name: "View Board", command: "/board", description: "Display visual kanban board", category: "workflow", icon: <Layers className="h-3.5 w-3.5" /> },

  // Git
  { id: "commit", name: "Commit", command: "/commit", description: "Create a commit with conventional message", category: "git", icon: <GitCommit className="h-3.5 w-3.5" /> },
  { id: "pr", name: "Create PR", command: "/pr", description: "Generate pull request from story", category: "git", icon: <Code className="h-3.5 w-3.5" /> },
  { id: "review", name: "Code Review", command: "/review", description: "AI-powered code review with suggestions", category: "git", icon: <Bug className="h-3.5 w-3.5" /> },

  // Testing
  { id: "verify", name: "Run Tests", command: "/verify", description: "Run tests and update story status", category: "testing", icon: <TestTube className="h-3.5 w-3.5" /> },
  { id: "audit", name: "Audit Story", command: "/audit", description: "Verify tests + acceptance criteria", category: "testing", icon: <CheckSquare className="h-3.5 w-3.5" /> },

  // Planning
  { id: "sprint", name: "Sprint Planning", command: "/sprint", description: "Data-driven sprint planning", category: "planning", icon: <BarChart3 className="h-3.5 w-3.5" /> },
  { id: "velocity", name: "Velocity", command: "/velocity", description: "Track velocity and forecast capacity", category: "planning", icon: <Zap className="h-3.5 w-3.5" /> },

  // Analytics
  { id: "metrics", name: "Metrics", command: "/metrics", description: "Analytics dashboard with cycle time", category: "analytics", icon: <BarChart3 className="h-3.5 w-3.5" /> },
  { id: "changelog", name: "Changelog", command: "/changelog", description: "Auto-generate changelog from commits", category: "analytics", icon: <FileText className="h-3.5 w-3.5" /> },

  // System
  { id: "packages", name: "Dependencies", command: "/packages", description: "Manage dependencies with audits", category: "system", icon: <Package className="h-3.5 w-3.5" /> },
  { id: "configure", name: "Configure", command: "/configure", description: "Configure AgileFlow features", category: "system", icon: <Settings className="h-3.5 w-3.5" /> },
  { id: "maintain", name: "Maintain", command: "/maintain", description: "Periodic maintenance tasks", category: "system", icon: <RefreshCw className="h-3.5 w-3.5" /> },
];

interface SkillsBrowserProps {
  onSelectSkill: (command: string) => void;
  skills?: Skill[];
  compact?: boolean;
}

const CATEGORY_LABELS: Record<string, string> = {
  workflow: "Workflow",
  git: "Git",
  testing: "Testing",
  planning: "Planning",
  analytics: "Analytics",
  system: "System",
};

export function SkillsBrowser({ onSelectSkill, skills = DEFAULT_SKILLS, compact = false }: SkillsBrowserProps) {
  const [search, setSearch] = useState("");
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  // Filter skills based on search
  const filteredSkills = useMemo(() => {
    if (!search.trim()) return skills;
    const query = search.toLowerCase();
    return skills.filter(
      (s) =>
        s.name.toLowerCase().includes(query) ||
        s.command.toLowerCase().includes(query) ||
        s.description.toLowerCase().includes(query)
    );
  }, [skills, search]);

  // Group skills by category
  const groupedSkills = useMemo(() => {
    const groups: Record<string, Skill[]> = {};
    for (const skill of filteredSkills) {
      if (!groups[skill.category]) {
        groups[skill.category] = [];
      }
      groups[skill.category].push(skill);
    }
    return groups;
  }, [filteredSkills]);

  const categories = Object.keys(groupedSkills);

  if (compact) {
    // Compact mode: horizontal scroll of skill chips
    return (
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        {filteredSkills.slice(0, 8).map((skill) => (
          <button
            key={skill.id}
            onClick={() => onSelectSkill(skill.command)}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-card border border-border rounded-full text-xs hover:border-primary/50 hover:bg-primary/5 transition-all whitespace-nowrap flex-shrink-0"
            title={skill.description}
          >
            {skill.icon}
            <span>{skill.name}</span>
          </button>
        ))}
        {filteredSkills.length > 8 && (
          <span className="text-xs text-muted-foreground px-2">+{filteredSkills.length - 8}</span>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search skills..."
          className="w-full bg-background border border-border pl-8 pr-3 py-2 text-xs rounded-lg focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground"
        />
      </div>

      {/* Skills list */}
      <div className="space-y-1">
        {categories.length === 0 ? (
          <div className="text-center py-4">
            <p className="text-xs text-muted-foreground">No skills found</p>
          </div>
        ) : (
          categories.map((category) => (
            <div key={category}>
              {/* Category header */}
              <button
                onClick={() => setExpandedCategory(expandedCategory === category ? null : category)}
                className="w-full flex items-center justify-between px-2 py-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              >
                <span className="uppercase tracking-wide font-semibold">
                  {CATEGORY_LABELS[category] || category}
                </span>
                <ChevronRight
                  className={`h-3 w-3 transition-transform ${
                    expandedCategory === category ? "rotate-90" : ""
                  }`}
                />
              </button>

              {/* Skills in category */}
              {(expandedCategory === category || search.trim()) && (
                <div className="space-y-0.5 ml-2">
                  {groupedSkills[category].map((skill) => (
                    <button
                      key={skill.id}
                      onClick={() => onSelectSkill(skill.command)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-muted/50 rounded-lg transition-colors group"
                    >
                      <span className="text-muted-foreground group-hover:text-primary transition-colors">
                        {skill.icon || <Zap className="h-3.5 w-3.5" />}
                      </span>
                      <div className="flex-1 min-w-0">
                        <span className="font-medium">{skill.name}</span>
                        <span className="text-muted-foreground ml-2 font-mono">
                          {skill.command}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
