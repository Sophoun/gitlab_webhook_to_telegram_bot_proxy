"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import type { RepoInfo } from "./types";

interface ProjectInfo {
  id: number;
  name: string;
  mgmtId: string;
}

interface ReviewHeaderProps {
  title: string;
  subtitle: string;
  /** Extra page-specific controls (period nav, export, …) rendered beside the repo selector */
  children?: React.ReactNode;
}

/**
 * Shared header across the Issue Review pages: project config + repo scope
 * selectors (persisted in URL params so they survive navigation).
 */
export function ReviewHeader({ title, subtitle, children }: ReviewHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const selectedProject = searchParams.get("project") || "";
  const selectedRepo = searchParams.get("repo") || "";
  const repoParam = selectedRepo && !isNaN(parseInt(selectedRepo)) ? selectedRepo : null;

  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [repos, setRepos] = useState<RepoInfo[]>([]);

  const fetchFacets = useCallback(async () => {
    try {
      const res = await fetch("/api/tracker/review");
      const data = await res.json();
      if (!data.error) {
        setProjects(data.facets?.projects || []);
        setRepos(data.facets?.repos || []);
      }
    } catch (error) {
      console.error("Failed to fetch facets:", error);
    }
  }, []);

  useEffect(() => {
    fetchFacets();
  }, [fetchFacets]);

  const setProject = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set("project", value);
    else params.delete("project");
    // Clear repo selection when switching projects
    params.delete("repo");
    router.replace(`${pathname}?${params.toString()}`);
  };

  const setRepo = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set("repo", value);
    else params.delete("repo");
    router.replace(`${pathname}?${params.toString()}`);
  };

  // Filter repos: Main Board + dpi-group repos only
  const filteredRepos = repos.filter((r) => {
    if (r.isMain) return true;
    return r.pathWithNamespace.startsWith("dpi-group/");
  });

  const selectedRepoInfo = repoParam
    ? repos.find((r) => String(r.id) === repoParam)
    : null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        <p className="text-muted-foreground mt-1">
          {selectedRepoInfo
            ? `Scoped to ${selectedRepoInfo.pathWithNamespace}`
            : subtitle}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {/* Project config selector */}
        {projects.length > 1 && (
          <select
            value={selectedProject}
            onChange={(e) => setProject(e.target.value)}
            className="h-9 rounded-md border bg-background px-3 text-sm"
            aria-label="Project scope"
          >
            <option value="">All Projects</option>
            {projects.map((p) => (
              <option key={p.id} value={String(p.id)}>
                {p.name}
              </option>
            ))}
          </select>
        )}

        {/* Repo selector */}
        <select
          value={selectedRepo}
          onChange={(e) => setRepo(e.target.value)}
          className="h-9 rounded-md border bg-background px-3 text-sm"
          aria-label="Repository scope"
        >
          <option value="">Main Board</option>
          {filteredRepos
            .filter((r) => !r.isMain)
            .map((r) => (
              <option key={r.id} value={String(r.id)}>
                {r.pathWithNamespace}
              </option>
            ))}
        </select>

        {children}
      </div>
    </div>
  );
}
