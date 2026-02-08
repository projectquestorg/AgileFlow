"use client";

import { useState, useEffect, useCallback } from "react";
import type { Database } from "@/lib/supabase/database.types";

type Project = Database["public"]["Tables"]["projects"]["Row"];

export interface UseProjectsReturn {
  projects: Project[];
  activeProject: Project | null;
  loading: boolean;
  createProject: (data: { name: string; description?: string; websocket_url?: string; project_root?: string }) => Promise<Project | null>;
  updateProject: (id: string, data: Partial<Pick<Project, "name" | "description" | "websocket_url" | "project_root">>) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  setDefault: (id: string) => Promise<void>;
}

export function useProjects(): UseProjectsReturn {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch("/api/projects");
      if (res.ok) {
        const data = await res.json();
        setProjects(data.projects);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const activeProject = projects.find((p) => p.is_default) ?? projects[0] ?? null;

  const createProject = useCallback(
    async (data: { name: string; description?: string; websocket_url?: string; project_root?: string }) => {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const { project } = await res.json();
        await fetchProjects();
        return project as Project;
      }
      return null;
    },
    [fetchProjects],
  );

  const updateProject = useCallback(
    async (id: string, data: Partial<Pick<Project, "name" | "description" | "websocket_url" | "project_root">>) => {
      const res = await fetch(`/api/projects/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        await fetchProjects();
      }
    },
    [fetchProjects],
  );

  const deleteProject = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
      if (res.ok) {
        await fetchProjects();
      }
    },
    [fetchProjects],
  );

  const setDefault = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_default: true }),
      });
      if (res.ok) {
        await fetchProjects();
      }
    },
    [fetchProjects],
  );

  return {
    projects,
    activeProject,
    loading,
    createProject,
    updateProject,
    deleteProject,
    setDefault,
  };
}
