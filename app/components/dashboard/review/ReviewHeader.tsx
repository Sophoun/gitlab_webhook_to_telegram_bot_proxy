"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import type { RepoInfo } from "./types";

interface ReviewHeaderProps {
  title: string;
  subtitle: string;
  /** Extra page-specific controls (period nav, export, …) rendered beside the repo selector */
  children?: React.ReactNode;
  /** Called after a successful sync so the page can refetch its data */
  onSynced?: () => void;
}

/**
 * Shared header across the Issue Review pages: repo scope selector (persisted
 * in the ?repo= URL param so it survives navigation between pages) and the
 * Sync button.
 */
export function ReviewHeader({ title, subtitle, children, onSynced }: ReviewHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const selectedRepo = searchParams.get("repo") || "";
  const repoParam = selectedRepo && !isNaN(parseInt(selectedRepo)) ? selectedRepo : null;

  const [repos, setRepos] = useState<RepoInfo[]>([]);
  const [syncing, setSyncing] = useState(false);

  const fetchRepos = useCallback(async () => {
    try {
      const res = await fetch("/api/tracker/review");
      const data = await res.json();
      if (!data.error) setRepos(data.facets?.repos || []);
    } catch (error) {
      console.error("Failed to fetch repos:", error);
    }
  }, []);

  useEffect(() => {
    fetchRepos();
  }, [fetchRepos]);

  const setRepo = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set("repo", value);
    else params.delete("repo");
    router.replace(`${pathname}?${params.toString()}`);
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      await fetch("/api/tracker/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      await fetchRepos();
      onSynced?.();
    } catch (error) {
      console.error("Sync failed:", error);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        <p className="text-muted-foreground mt-1">
          {repoParam
            ? `Scoped to ${
                repos.find((r) => String(r.id) === repoParam)?.pathWithNamespace ?? "selected repo"
              }`
            : subtitle}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={selectedRepo}
          onChange={(e) => setRepo(e.target.value)}
          className="h-9 rounded-md border bg-background px-3 text-sm"
          aria-label="Repository scope"
        >
          <option value="">Main Project</option>
          {(repos || [])
            .filter((r) => !r.isMain)
            .map((r) => (
              <option key={r.id} value={String(r.id)}>
                {r.pathWithNamespace}
              </option>
            ))}
        </select>

        {children}

        <Button variant="outline" onClick={handleSync} disabled={syncing}>
          <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Syncing..." : "Sync"}
        </Button>
      </div>
    </div>
  );
}
