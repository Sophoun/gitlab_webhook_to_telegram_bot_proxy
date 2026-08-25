"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SyncDialog } from "../SyncDialog";
import { IssueDetailView } from "../IssueDetailView";
import { IssuesTable } from "./IssuesTable";
import { TeamWeekSection } from "./TeamWeekSection";
import { BoardOverview } from "./BoardOverview";
import { NeedsAttention } from "./NeedsAttention";
import { WIP_LIMIT, type ReviewData, type ReviewIssue } from "./types";
import { ageDays, categorizeAttention } from "./attention";
import {
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Download,
} from "lucide-react";

interface PersonWeek {
  username: string;
  name: string;
  issuesCreated: number;
  issuesClosed: number;
  comments: number;
  mrsCreated: number;
  mrsMerged: number;
  commits: number;
  totalEvents: number;
  /** Progress % added via /dev + /test + /uat commands in the period */
  progressDelivered: number;
}

type PeriodType = "day" | "week" | "month";

function getWeekStart(d: Date): Date {
  const nd = new Date(d);
  const day = nd.getDay();
  const diff = nd.getDate() - day + (day === 0 ? -6 : 1); // Monday
  nd.setDate(diff);
  nd.setHours(0, 0, 0, 0);
  return nd;
}

function getRange(type: PeriodType, anchor: Date): { from: Date; to: Date } {
  if (type === "day") {
    const from = new Date(anchor);
    from.setHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setDate(to.getDate() + 1);
    return { from, to };
  }
  if (type === "month") {
    const from = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const to = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1);
    return { from, to };
  }
  const from = getWeekStart(anchor);
  const to = new Date(from);
  to.setDate(from.getDate() + 7);
  return { from, to };
}

function currentAnchor(type: PeriodType): Date {
  return type === "week" ? getWeekStart(new Date()) : new Date();
}

function shiftAnchor(type: PeriodType, anchor: Date, delta: number): Date {
  const nd = new Date(anchor);
  if (type === "day") nd.setDate(nd.getDate() + delta);
  else if (type === "week") nd.setDate(nd.getDate() + delta * 7);
  else nd.setMonth(nd.getMonth() + delta);
  return nd;
}

function rangeLabel(type: PeriodType, anchor: Date): string {
  if (type === "day") {
    return anchor.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }
  if (type === "month") {
    return anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  }
  const end = new Date(getWeekStart(anchor));
  end.setDate(end.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${fmt(getWeekStart(anchor))} – ${fmt(end)}, ${end.getFullYear()}`;
}

export function ReviewHub() {
  // Period state
  const [periodType, setPeriodType] = useState<PeriodType>("week");
  const [anchor, setAnchor] = useState<Date>(() => new Date());

  // Team data
  const [people, setPeople] = useState<PersonWeek[]>([]);
  const [teamLoading, setTeamLoading] = useState(true);

  // Issues data
  const [review, setReview] = useState<ReviewData | null>(null);
  const [issuesLoading, setIssuesLoading] = useState(true);
  const [selectedIssue, setSelectedIssue] = useState<ReviewIssue | null>(null);

  // Sync & export
  const [syncing, setSyncing] = useState(false);
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const range = getRange(periodType, anchor);
  // Stable primitive deps — Date objects change identity every render,
  // which would make useCallback/useEffect loop forever.
  const fromIso = range.from.toISOString();
  const toIso = range.to.toISOString();
  const isCurrent = rangeLabel(periodType, anchor) === rangeLabel(periodType, currentAnchor(periodType));

  const issues = review?.issues || [];
  const wipMap: Record<string, number> = {};
  for (const p of review?.people || []) wipMap[p.username] = p.wipCount;
  const wipLimit = review ? WIP_LIMIT : 2;

  // Average work progress across open issues that have progress set
  // (values come from /dev, /test, /uat comment commands)
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

  // Repo scoping: null = main project(s), otherwise a GitLab repo id.
  // Primitive string dep keeps useCallback/useEffect stable.
  const [selectedRepo, setSelectedRepo] = useState<string>("");
  const repoParam = selectedRepo && !isNaN(parseInt(selectedRepo)) ? selectedRepo : null;

  const fetchTeam = useCallback(async () => {
    setTeamLoading(true);
    try {
      const repoQs = repoParam ? `&repo=${repoParam}` : "";
      const res = await fetch(`/api/tracker/team-week?from=${fromIso}&to=${toIso}${repoQs}`);
      const data = await res.json();
      setPeople(data.error ? [] : data.people || []);
    } catch (error) {
      console.error("Failed to fetch team activity:", error);
      setPeople([]);
    } finally {
      setTeamLoading(false);
    }
  }, [fromIso, toIso, repoParam]);

  const fetchIssues = useCallback(async () => {
    setIssuesLoading(true);
    try {
      const repoQs = repoParam ? `?repo=${repoParam}` : "";
      const res = await fetch(`/api/tracker/review${repoQs}`);
      const data = await res.json();
      setReview(data.error ? null : data);
    } catch (error) {
      console.error("Failed to fetch issues:", error);
      setReview(null);
    } finally {
      setIssuesLoading(false);
    }
  }, [repoParam]);

  useEffect(() => {
    fetchTeam();
  }, [fetchTeam]);

  useEffect(() => {
    fetchIssues();
  }, [fetchIssues]);

  const handleSync = async (gitlabProjectIds?: number[]) => {
    setSyncing(true);
    try {
      await fetch("/api/tracker/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          gitlabProjectIds && gitlabProjectIds.length > 0
            ? { gitlab_project_ids: gitlabProjectIds }
            : {}
        ),
      });
      await Promise.all([fetchTeam(), fetchIssues()]);
    } catch (error) {
      console.error("Sync failed:", error);
    } finally {
      setSyncing(false);
    }
  };

  const exportExcel = async () => {
    setExporting(true);
    try {
      const XLSX = await import("xlsx");
      const allIssues = review?.issues || [];
      const attention = categorizeAttention(allIssues);

      // Sheet 1: Team Activity (selected period)
      const teamSheet = XLSX.utils.json_to_sheet(
        people.map((p) => ({
          Name: p.name,
          Username: p.username,
          "Issues Created": p.issuesCreated,
          "Issues Closed": p.issuesClosed,
          "Progress Delivered (%)": p.progressDelivered ?? 0,
          Comments: p.comments,
          "Total Events": p.totalEvents,
          WIP: wipMap[p.username] || 0,
        }))
      );
      teamSheet["!cols"] = [
        { wch: 22 }, { wch: 18 }, { wch: 15 }, { wch: 14 }, { wch: 20 }, { wch: 12 },
        { wch: 13 }, { wch: 8 },
      ];

      // Sheet 2: Needs Attention
      const attentionRows: Array<Record<string, string | number>> = [];
      for (const cat of attention) {
        for (const i of cat.issues) {
          attentionRows.push({
            Category: cat.title,
            IID: i.issueIid,
            Title: i.issueTitle || "",
            Author: i.authorName,
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
        { wch: 24 }, { wch: 8 }, { wch: 50 }, { wch: 20 }, { wch: 14 },
        { wch: 15 }, { wch: 15 }, { wch: 10 }, { wch: 12 }, { wch: 40 },
      ];

      // Sheet 3: All Issues
      const issueSheet = XLSX.utils.json_to_sheet(
        allIssues.map((i) => ({
          IID: i.issueIid,
          Title: i.issueTitle || "",
          Project: i.projectName || "",
          Author: i.authorName,
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
        { wch: 8 }, { wch: 50 }, { wch: 16 }, { wch: 20 }, { wch: 9 }, { wch: 14 },
        { wch: 15 }, { wch: 15 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 12 },
        { wch: 12 }, { wch: 11 }, { wch: 17 }, { wch: 10 }, { wch: 40 },
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, teamSheet, "Team Activity");
      if (attentionRows.length > 0) {
        XLSX.utils.book_append_sheet(wb, attentionSheet, "Needs Attention");
      }
      XLSX.utils.book_append_sheet(wb, issueSheet, "All Issues");

      // Sheet 4: Board Summary with report info block
      const summaryAoa: Array<Array<string | number>> = [];
      summaryAoa.push(["Issue Review Export"]);
      summaryAoa.push(["Generated", new Date().toLocaleString()]);
      summaryAoa.push(["Period", `${rangeLabel(periodType, anchor)} (${periodType})`]);
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

      XLSX.writeFile(
        wb,
        `issue-review_${periodType}_${range.from.toISOString().slice(0, 10)}.xlsx`
      );
    } catch (error) {
      console.error("Export failed:", error);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Issue Review</h1>
          <p className="text-muted-foreground mt-1">
            {repoParam
              ? `Scoped to ${review?.facets.repos.find((r) => String(r.id) === repoParam)?.pathWithNamespace ?? "selected repo"}`
              : "Team activity and issue tracking for the main project"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* Repo selector — main project or any synced child repo */}
          <select
            value={selectedRepo}
            onChange={(e) => {
              setSelectedRepo(e.target.value);
              setSelectedIssue(null);
            }}
            className="h-9 rounded-md border bg-background px-3 text-sm"
            aria-label="Repository scope"
          >
            <option value="">Main Project</option>
            {(review?.facets.repos || [])
              .filter((r) => !r.isMain)
              .map((r) => (
                <option key={r.id} value={String(r.id)}>
                  {r.pathWithNamespace}
                </option>
              ))}
          </select>

          {/* Period selector */}
          <div className="flex items-center rounded-lg border overflow-hidden">
            {(["day", "week", "month"] as PeriodType[]).map((t) => (
              <button
                key={t}
                onClick={() => {
                  setPeriodType(t);
                  setAnchor(currentAnchor(t));
                }}
                className={`px-3 py-2 text-sm font-medium transition-colors ${
                  periodType === t
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted"
                }`}
              >
                {t === "day" ? "Today" : t === "week" ? "This Week" : "This Month"}
              </button>
            ))}
          </div>

          {/* Range navigation */}
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setAnchor((a) => shiftAnchor(periodType, a, -1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={isCurrent}
              onClick={() => setAnchor(currentAnchor(periodType))}
            >
              Now
            </Button>
            <Button
              variant="outline"
              size="icon"
              disabled={isCurrent}
              onClick={() => setAnchor((a) => shiftAnchor(periodType, a, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <span className="text-sm font-medium px-1 min-w-[150px]">
            {rangeLabel(periodType, anchor)}
          </span>

          <Button
            variant="outline"
            onClick={exportExcel}
            disabled={exporting || (!review && people.length === 0)}
          >
            <Download className={`h-4 w-4 mr-2 ${exporting ? "animate-pulse" : ""}`} />
            Excel
          </Button>

          <Button variant="outline" onClick={() => setSyncDialogOpen(true)} disabled={syncing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing..." : "Sync"}
          </Button>
        </div>
      </div>

      {/* Section 0: Kanban board overview */}
      {review && (
        <BoardOverview
          boardDistribution={review.boardDistribution}
          priorityBreakdown={review.priorityBreakdown}
          teamBreakdown={review.teamBreakdown}
          avgDevProgress={avgDevProgress}
          avgQaProgress={avgQaProgress}
        />
      )}

      {/* Section 1: Problem tickets */}
      <NeedsAttention issues={issues} onSelectIssue={(issue) => setSelectedIssue(issue)} />

      {/* Section 2: Team activity for the selected period */}
      <TeamWeekSection
        people={people}
        loading={teamLoading}
        subtitle={`${rangeLabel(periodType, anchor)} · click a person to see what they worked on`}
        wipMap={wipMap}
        wipLimit={wipLimit}
        from={fromIso}
        to={toIso}
        issues={issues}
        repo={repoParam}
      />

      {/* Section 2: Issue tracker */}
      {selectedIssue ? (
        <IssueDetailView
          issue={selectedIssue}
          onBack={() => setSelectedIssue(null)}
          teamAvgCycleTime={review?.kpis.avgCycleTime ?? null}
          teamAvgFirstResponse={review?.kpis.avgFirstResponse ?? null}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Issue Tracker</CardTitle>
            <CardDescription>
              Open tasks by board stage — click any issue for its full story
              (timeline, collaborators, performance)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <IssuesTable issues={issues} onSelectIssue={(issue) => setSelectedIssue(issue)} />
          </CardContent>
        </Card>
      )}

      {/* Sync Dialog */}
      <SyncDialog
        open={syncDialogOpen}
        onOpenChange={setSyncDialogOpen}
        onSync={async (gitlabProjectIds) => {
          await handleSync(gitlabProjectIds);
        }}
        syncing={syncing}
      />
    </div>
  );
}
