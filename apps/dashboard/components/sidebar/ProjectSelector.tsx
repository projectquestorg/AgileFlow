"use client";

import { useState } from "react";
import { ChevronDown, FolderOpen, Plus, Check } from "lucide-react";
import { useProjects } from "@/hooks/useProjects";
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar";

export function ProjectSelector() {
  const { projects, activeProject, loading, setDefault, createProject } = useProjects();
  const [showMenu, setShowMenu] = useState(false);

  if (loading) return null;

  // No projects yet — show a create prompt
  if (projects.length === 0) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            tooltip="Create project"
            onClick={async () => {
              await createProject({ name: "My Project" });
            }}
          >
            <Plus className="size-4" />
            <span className="text-sm">Create a project</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <div className="relative">
          <SidebarMenuButton
            tooltip={activeProject?.name ?? "Select project"}
            onClick={() => setShowMenu(!showMenu)}
          >
            <FolderOpen className="size-4" />
            <span className="truncate text-sm font-medium">
              {activeProject?.name ?? "Select project"}
            </span>
            {projects.length > 1 && (
              <ChevronDown
                className={`ml-auto size-3 transition-transform ${showMenu ? "rotate-180" : ""}`}
              />
            )}
          </SidebarMenuButton>

          {showMenu && projects.length > 1 && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowMenu(false)}
              />
              <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-popover border border-border rounded-lg shadow-lg overflow-hidden">
                {projects.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setDefault(p.id);
                      setShowMenu(false);
                    }}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent transition-colors ${
                      p.id === activeProject?.id ? "bg-accent" : ""
                    }`}
                  >
                    <FolderOpen className="size-3.5 shrink-0" />
                    <span className="truncate">{p.name}</span>
                    {p.id === activeProject?.id && (
                      <Check className="size-3.5 ml-auto text-primary" />
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
