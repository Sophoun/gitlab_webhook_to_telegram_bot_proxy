"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SyncDialog } from "../SyncDialog";
import { ReviewHeader } from "./ReviewHeader";
import { BoardOverview } from "./BoardOverview";
import { NeedsAttention } from "./NeedsAttention";
import { WIP_LIMIT, type ReviewData } from "./types";
import { ageDays, categorizeAttention } from "./attention";
import { Download, Trophy, ArrowRight } from "lucide-react";

interface TopPerformer {
  username: string;
  name: string;
  totalEvents: number;
  performanceScore: number;
  performanceGrade: "A" | "B" | "C" | "D" | "F";
  performanceRole: "developer" | "coordinator" | "mixed";
  issuesClosed: number;
  commits: number;
  mrsMerged: number;
}

const ROLE_LABELS: Record<string, string> = {
  developer: "Developer",
  coordinator: "Coordinator",
  mixed: "Contributor",
};

/**
 * Analytics Dashboard home — board health: Kanban stage distribution,
 * priorities, problem tickets, plus a top-performers snapshot.
 * Exports Needs Attention / All Issues / Board Summary.
 */
export function ReviewOverview() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const repoParamRaw = searchParams.get("repo");
  const repoParam = repoParamRaw && !isNaN(parseInt(repoParamRaw)) ? repoParamRaw : null;

  const [review, setReview] = useState<ReviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [topPerformers, setTopPerformers] = useState<TopPerformer[]>([]);

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

  const fetchTopPerformers = useCallback(async () => {
    try {
      // Current week range
      const now = new Date();
      const day = now.getDay();
      const from = new Date(now);
      from.setDate(now.getDate() - day + (day === 0 ? -6 : 1));
      from.setHours(0, 0, 0, 0);
      const to = new Date(from);
      to.setDate(from.getDate() + 7);
      const repoQs = repoParam ? `&repo=${repoParam}` : "";
      const res = await fetch(
        `/api/tracker/team-week?from=${from.toISOString()}&to=${to.toISOString()}&period=week${repoQs}`
      );
      const data = await res.json();
      if (!data.error) {
        const top = (data.people || [])
          .filter((p: TopPerformer) => p.totalEvents > 0)
          .sort((a: TopPerformer, b: TopPerformer) => b.totalEvents - a.totalEvents)
          .slice(0, 5);
        setTopPerformers(top);
      }
    } catch (error) {
      console.error("Failed to fetch top performers:", error);
    }
  }, [repoParam]);

  useEffect(() => {
    fetchIssues();
    fetchTopPerformers();
  }, [fetchIssues, fetchTopPerformers]);

  const issues = review?.issues || [];
  const attention = categorizeAttention(issues);

  const avgOf = (values: Array<number | null | undefined>): number | null => {
    const known = values.filter((v): v is number => typeof v === "number");
    if (known.length === 0) return null;
    return known.reduce((a, b) => a + b, 0) / known.length;
  };
  const avgDevProgress = avgOf(
    issues.filter((i) => i.state === "open" && i.boardStage === "In Progress").map((i) => i.devProgress)
  );
  const avgQaProgress = avgOf(
    issues.filter((i) => i.state === "open" && i.boardStage === "Testing/QA").map((i) => i.qaProgress)
  );

  const exportExcel = async () => {
    setExporting(true);
    try {
      const XLSX = await import("xlsx");

      // Sheet: Needs Attention
      const attentionRows: Array<Record<string, string | number>> = [];
      for (const cat of attention) {
        for (const i of cat.issues) {
          attentionRows.push({
            Category: cat.title,
            IID: i.issueIid,
            Title: i.issueTitle || "",
            Author: i.authorName,
            Assignees: (i.assigneeUsernames || "")
              .split(",")
              .map((a) => a.trim())
              .filter(Boolean)
              .join(", "),
            Stage: i.boardStage,
            "Dev Progress (%)": i.devProgress ?? "",
            "QA Progress (%)": i.qaProgress ?? "",
            Priority: i.priority || "",
            "Age (days)": ageDays(i.createdAt),
            URL: i.issueUrl || "",
          });
        }
      }
      const attentionSheet = XLSX.utils.json_to_sheet(attentionRows);
      attentionSheet["!cols"] = [
        { wch: 24 }, { wch: 8 }, { wch: 50 }, { wch: 20 }, { wch: 20 }, { wch: 14 },
        { wch: 15 }, { wch: 15 }, { wch: 10 }, { wch: 12 }, { wch: 40 },
      ];

      // Sheet: All Issues
      const issueSheet = XLSX.utils.json_to_sheet(
        issues.map((i) => ({
          IID: i.issueIid,
          Title: i.issueTitle || "",
          Project: i.projectName || "",
          Author: i.authorName,
          Assignees: (i.assigneeUsernames || "")
            .split(",")
            .map((a) => a.trim())
            .filter(Boolean)
            .join(", "),
          Status: i.state,
          "Board Stage": i.boardStage,
          "Dev Progress (%)": i.devProgress ?? "",
          "QA Progress (%)": i.qaProgress ?? "",
          Priority: i.priority || "",
          Team: i.team || "",
          Type: i.type || "",
          Created: i.createdAt ? new Date(i.createdAt).toLocaleDateString() : "",
          Closed: i.closedAt ? new Date(i.closedAt).toLocaleDateString() : "",
          "Age (days)": i.state === "open" ? ageDays(i.createdAt) : "",
          "Cycle Time (hours)": i.timeToCloseHours ?? "",
          Comments: i.commentCount ?? 0,
          URL: i.issueUrl || "",
        }))
      );
      issueSheet["!cols"] = [
        { wch: 8 }, { wch: 50 }, { wch: 16 }, { wch: 20 }, { wch: 20 }, { wch: 9 },
        { wch: 14 }, { wch: 15 }, { wch: 15 }, { wch: 10 }, { wch: 10 }, { wch: 12 },
        { wch: 12 }, { wch: 12 }, { wch: 11 }, { wch: 17 }, { wch: 10 }, { wch: 40 },
      ];

      const wb = XLSX.utils.book_new();
      if (attentionRows.length > 0) {
        XLSX.utils.book_append_sheet(wb, attentionSheet, "Needs Attention");
      }
      XLSX.utils.book_append_sheet(wb, issueSheet, "All Issues");

      // Sheet: Board Summary
      const summaryAoa: Array<Array<string | number>> = [];
      summaryAoa.push(["Issue Review Export"]);
      summaryAoa.push(["Generated", new Date().toLocaleString()]);
      summaryAoa.push([]);
      summaryAoa.push(["BOARD STAGES"]);
      summaryAoa.push(["Stage", "Issues"]);
      for (const s of review?.boardDistribution || []) {
        summaryAoa.push([s.stage, s.count]);
      }
      summaryAoa.push([]);
      summaryAoa.push(["OPEN BY PRIORITY"]);
      summaryAoa.push(["Priority", "Open Issues"]);
      for (const p of review?.priorityBreakdown || []) {
        summaryAoa.push([p.priority, p.openCount]);
      }
      summaryAoa.push([]);
      summaryAoa.push(["OPEN BY TEAM"]);
      summaryAoa.push(["Team", "Open Issues"]);
      for (const t of review?.teamBreakdown || []) {
        summaryAoa.push([t.team, t.openCount]);
      }
      if (avgDevProgress !== null || avgQaProgress !== null) {
        summaryAoa.push([]);
        summaryAoa.push(["AVERAGE WORK PROGRESS (from /dev, /test, /uat comment commands)"]);
        summaryAoa.push(["Metric", "Average"]);
        if (avgDevProgress !== null) {
          summaryAoa.push(["Avg Dev Progress (open In Progress)", `${Math.round(avgDevProgress)}%`]);
        }
        if (avgQaProgress !== null) {
          summaryAoa.push(["Avg QA Progress (open Testing/QA)", `${Math.round(avgQaProgress)}%`]);
        }
      }
      const wipViolators = (review?.people || []).filter((p) => p.wipCount > WIP_LIMIT);
      if (wipViolators.length > 0) {
        summaryAoa.push([]);
        summaryAoa.push([`WIP VIOLATIONS (over ${WIP_LIMIT} In Progress)`]);
        summaryAoa.push(["Name", "Username", "In Progress"]);
        for (const p of wipViolators) {
          summaryAoa.push([p.name, `@${p.username}`, p.wipCount]);
        }
      }
      const summarySheet = XLSX.utils.aoa_to_sheet(summaryAoa);
      summarySheet["!cols"] = [{ wch: 28 }, { wch: 30 }, { wch: 14 }];
      XLSX.utils.book_append_sheet(wb, summarySheet, "Board Summary");

      XLSX.writeFile(wb, `issue-review_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (error) {
      console.error("Export failed:", error);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <ReviewHeader
        title="Dashboard"
        subtitle="Board health across all repositories · top performers · issues needing attention"
      >
        <Button variant="outline" onClick={exportExcel} disabled={exporting || !review}>
          <Download className={`h-4 w-4 mr-2 ${exporting ? "animate-pulse" : ""}`} />
          Excel
        </Button>
        <Button variant="outline" onClick={() => setSyncDialogOpen(true)}>
          Selective Sync
        </Button>
      </ReviewHeader>

      {/* Health summary strip */}
      {!loading && review && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Open Issues</CardDescription>
              <CardTitle className="text-3xl">
                {review.issues.filter((i) => i.state === "open").length}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              Total open issues on the board
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Needs Attention</CardDescription>
              <CardTitle className="text-3xl text-orange-600">
                {attention.reduce((sum, c) => sum + c.issues.length, 0)}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              Blocked or slow-moving tickets
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Closed Issues</CardDescription>
              <CardTitle className="text-3xl text-emerald-700">
                {review.issues.filter((i) => i.state === "closed").length}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              Issues resolved on the board
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Active Members</CardDescription>
              <CardTitle className="text-3xl">
                {review.people.length}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              Team members with assigned issues
            </CardContent>
          </Card>
        </div>
      )}

      {loading ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Loading board…
          </CardContent>
        </Card>
      ) : (
        <>
          {review && (
            <BoardOverview
              boardDistribution={review.boardDistribution}
              priorityBreakdown={review.priorityBreakdown}
              teamBreakdown={review.teamBreakdown}
              avgDevProgress={avgDevProgress}
              avgQaProgress={avgQaProgress}
            />
          )}

          {/* Top Performers */}
          {topPerformers.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Trophy className="h-4 w-4 text-yellow-500" /> Top Performers
                </CardTitle>
                <CardDescription>
                  This week's most active contributors · click to view profile
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
                  {topPerformers.map((p, i) => (
                    <button
                      key={p.username}
                      onClick={() => router.push(`/review/people/${encodeURIComponent(p.username)}`)}
                      className="text-left rounded-lg border p-3 hover:shadow-md transition-shadow hover:bg-muted/50"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-muted-foreground">#{i + 1}</span>
                        <span
                          className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium ${
                            p.performanceRole === "developer"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : p.performanceRole === "coordinator"
                                ? "bg-blue-50 text-blue-700 border-blue-200"
                                : "bg-gray-50 text-gray-600 border-gray-200"
                          }`}
                        >
                          {ROLE_LABELS[p.performanceRole] || p.performanceRole}
                        </span>
                      </div>
                      <div className="font-medium text-sm truncate">{p.name}</div>
                      <div className="text-[10px] text-muted-foreground mb-2">@{p.username}</div>
                      <div className="flex justify-between text-[10px] text-muted-foreground mt-1.5 pt-1.5 border-t">
                        <span>{p.issuesClosed} closed</span>
                        <span>{p.commits} commits</span>
                        <span>{p.mrsMerged} MRs</span>
                      </div>
                    </button>
                  ))}
                </div>
                <div className="mt-3">
                  <Button variant="ghost" size="sm" onClick={() => router.push("/review/team")}>
                    View full leaderboard <ArrowRight className="h-3.5 w-3.5 ml-1" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <NeedsAttention
            issues={issues}
            onSelectIssue={(issue) => {
              // Deep-link into the Issue Tracker page with the issue pre-opened
              const params = new URLSearchParams(searchParams.toString());
              params.set("issue", `${issue.gitlabProjectId}:${issue.issueIid}`);
              router.push(`/review/tracker?${params.toString()}`);
            }}
          />
        </>
      )}

      <SyncDialog
        open={syncDialogOpen}
        onOpenChange={setSyncDialogOpen}
        onSync={async (gitlabProjectIds, clean) => {
          setSyncing(true);

          // Periodic refresh every 15s so the dashboard updates while sync is running
          const interval = setInterval(() => {
            fetchIssues();
            fetchTopPerformers();
          }, 15_000);

          // Stop polling after 30 minutes (full sync of 136+ repos)
          const timeout = setTimeout(() => clearInterval(interval), 30 * 60 * 1000);

          // Fire-and-forget: the sync processes 136+ repos and takes many minutes.
          // The server-side handler continues running regardless of client connection.
          try {
            const res = await fetch("/api/tracker/sync", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                gitlab_project_ids: gitlabProjectIds,
                clean: clean ?? false,
              }),
            });
            if (!res.ok) {
              const data = await res.json().catch(() => ({}));
              console.error("Sync failed:", data.error || res.statusText);
            }
          } catch {
            // "Failed to fetch" = sync already running or server busy
            console.warn("Sync request blocked — a sync may already be in progress");
          } finally {
            clearInterval(interval);
            clearTimeout(timeout);
            fetchIssues();
            fetchTopPerformers();
            setSyncing(false);
          }
        }}
        syncing={syncing}
      />
    </div>
  );
}
