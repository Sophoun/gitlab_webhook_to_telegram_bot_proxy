"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ReviewHeader } from "./ReviewHeader";
import { IssuesTable } from "./IssuesTable";
import { IssueDetailView } from "../IssueDetailView";
import type { ReviewData, ReviewIssue } from "./types";

/**
 * Issue Tracker page — the full issue list with search & filters, and the
 * deep-linkable issue detail view (?issue=<gitlabProjectId>:<iid>).
 */
export function TrackerPage() {
  const searchParams = useSearchParams();
  const repoParamRaw = searchParams.get("repo");
  const repoParam = repoParamRaw && !isNaN(parseInt(repoParamRaw)) ? repoParamRaw : null;
  const issueParam = searchParams.get("issue");

  const [review, setReview] = useState<ReviewData | null>(null);
  const [loading, setLoading] = useState(true);
  /** Issue clicked in the table (not deep-linked) */
  const [clickedIssue, setClickedIssue] = useState<ReviewIssue | null>(null);

  const fetchIssues = useCallback(async () => {
    try {
      const repoQs = repoParam ? `?repo=${repoParam}` : "";
      const res = await fetch(`/api/tracker/review${repoQs}`);
      const data = await res.json();
      setReview(data.error ? null : data);
    } catch (error) {
      console.error("Failed to fetch issues:", error);
      setReview(null);
    } finally {
      setLoading(false);
    }
  }, [repoParam]);

  useEffect(() => {
    fetchIssues();
  }, [fetchIssues]);

  const issues = review?.issues || [];

  // Deep link: ?issue=<gitlabProjectId>:<iid> — derived during render (no
  // effect) so the URL is the single source of truth.
  let deepLinkedIssue: ReviewIssue | null = null;
  if (issueParam && review) {
    const [projectIdStr, iidStr] = issueParam.split(":");
    const projectId = parseInt(projectIdStr);
    const iid = parseInt(iidStr);
    if (!isNaN(projectId) && !isNaN(iid)) {
      deepLinkedIssue =
        issues.find((i) => i.gitlabProjectId === projectId && i.issueIid === iid) ?? null;
    }
  }

  // Clicked issue takes priority over deep link; clearing either shows the list
  const selectedIssue = clickedIssue || deepLinkedIssue;

  const handleBack = () => {
    setClickedIssue(null);
  };

  return (
    <div className="p-6 space-y-6">
      <ReviewHeader
        title="Issue Tracker"
        subtitle="All issues across the board — search, filter, and drill into any task"
      />

      {selectedIssue ? (
        <IssueDetailView
          issue={selectedIssue}
          onBack={handleBack}
          teamAvgCycleTime={review?.kpis.avgCycleTime ?? null}
          teamAvgFirstResponse={review?.kpis.avgFirstResponse ?? null}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Issues</CardTitle>
            <CardDescription>
              {loading
                ? "Loading issues…"
                : `${issues.length} issues · click any issue for its full story (timeline, collaborators, performance)`}
            </CardDescription>
            <CardDescription className="text-[11px] text-muted-foreground/70">
              Stage chips show each issue's Kanban stage · status = Open/Closed · click a row to see the full detail
            </CardDescription>
          </CardHeader>
          <CardContent>
            <IssuesTable issues={issues} onSelectIssue={(issue) => setClickedIssue(issue)} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
