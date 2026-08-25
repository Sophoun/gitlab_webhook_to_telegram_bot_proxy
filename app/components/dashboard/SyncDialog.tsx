"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface GitLabProject {
  id: number;
  name: string;
  path_with_namespace: string;
  web_url: string;
  configId: number;
  configName: string;
}

interface SyncDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSync: (gitlabProjectIds?: number[]) => void;
  syncing: boolean;
}

export function SyncDialog({
  open,
  onOpenChange,
  onSync,
  syncing,
}: SyncDialogProps) {
  const [gitlabProjects, setGitlabProjects] = useState<GitLabProject[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [selectedProjectIds, setSelectedProjectIds] = useState<number[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  // Fetch GitLab projects when dialog opens
  useEffect(() => {
    if (open) {
      fetchGitLabProjects();
      setSelectedProjectIds([]);
      setSearchQuery("");
    }
  }, [open]);

  async function fetchGitLabProjects() {
    try {
      setLoadingProjects(true);
      const res = await fetch("/api/tracker/gitlab-projects");
      const data = await res.json();
      setGitlabProjects(data.projects || []);
    } catch (error) {
      console.error("Failed to fetch GitLab projects:", error);
    } finally {
      setLoadingProjects(false);
    }
  }

  function toggleProject(projectId: number) {
    setSelectedProjectIds((prev) =>
      prev.includes(projectId)
        ? prev.filter((id) => id !== projectId)
        : [...prev, projectId]
    );
  }

  function selectAll() {
    const filteredIds = filteredProjects.map((p) => p.id);
    setSelectedProjectIds((prev) => [...new Set([...prev, ...filteredIds])]);
  }

  function clearSelection() {
    setSelectedProjectIds([]);
  }

  function handleSync() {
    onSync(selectedProjectIds.length > 0 ? selectedProjectIds : undefined);
  }

  // Filter projects by search query
  const filteredProjects = gitlabProjects.filter(
    (p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.path_with_namespace.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Sync GitLab Projects</DialogTitle>
          <DialogDescription>
            Select which GitLab projects to sync. These are all projects accessible
            with your configured Personal Access Tokens.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search */}
          <div>
            <input
              type="text"
              placeholder="Search projects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3 py-2 border rounded-md bg-background text-sm"
              disabled={syncing || loadingProjects}
            />
          </div>

          {/* Project selection */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium">
                {loadingProjects
                  ? "Loading projects..."
                  : `${filteredProjects.length} GitLab project(s)`}
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={selectAll}
                  className="text-xs text-primary hover:underline"
                  disabled={syncing || loadingProjects}
                >
                  Select Filtered
                </button>
                <span className="text-muted-foreground">|</span>
                <button
                  type="button"
                  onClick={clearSelection}
                  className="text-xs text-muted-foreground hover:underline"
                  disabled={syncing}
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="border rounded-md max-h-64 overflow-y-auto">
              {loadingProjects ? (
                <div className="px-3 py-4 text-sm text-muted-foreground text-center">
                  Fetching GitLab projects...
                </div>
              ) : filteredProjects.length === 0 ? (
                <div className="px-3 py-4 text-sm text-muted-foreground text-center">
                  {gitlabProjects.length === 0
                    ? "No GitLab projects found. Check your PAT configuration."
                    : "No projects match your search."}
                </div>
              ) : (
                filteredProjects.map((project) => (
                  <label
                    key={project.id}
                    className="flex items-start gap-2 px-3 py-2 hover:bg-muted cursor-pointer border-b last:border-b-0"
                  >
                    <input
                      type="checkbox"
                      checked={selectedProjectIds.includes(project.id)}
                      onChange={() => toggleProject(project.id)}
                      disabled={syncing}
                      className="rounded mt-0.5"
                    />
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">
                        {project.path_with_namespace}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Config: {project.configName}
                      </div>
                    </div>
                  </label>
                ))
              )}
            </div>

            <p className="text-xs text-muted-foreground mt-1">
              {selectedProjectIds.length === 0
                ? "No projects selected - will sync ALL projects"
                : `${selectedProjectIds.length} project(s) selected`}
            </p>
          </div>

          <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
            <p className="text-xs text-blue-600 dark:text-blue-400">
              <strong>Tip:</strong> Use the search to filter by name. Select specific
              projects to sync only those, or leave empty to sync all.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={syncing}
          >
            Cancel
          </Button>
          <Button onClick={handleSync} disabled={syncing || loadingProjects}>
            {syncing ? "Syncing..." : "Start Sync"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
