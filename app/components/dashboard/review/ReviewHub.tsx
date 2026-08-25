"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SyncDialog } from "../SyncDialog";
import { IssueDetailView } from "../IssueDetailView";
import { IssuesTable } from "./IssuesTable";
import { TeamWeekSection } from "./TeamWeekSection";
import { BoardOverview } from "./BoardOverview";
import { WIP_LIMIT, type ReviewData, type ReviewIssue } from "./types";
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

  const fetchTeam = useCallback(async () => {
    setTeamLoading(true);
    try {
      const res = await fetch(`/api/tracker/team-week?from=${fromIso}&to=${toIso}`);
      const data = await res.json();
      setPeople(data.error ? [] : data.people || []);
    } catch (error) {
      console.error("Failed to fetch team activity:", error);
      setPeople([]);
    } finally {
      setTeamLoading(false);
    }
  }, [fromIso, toIso]);

  const fetchIssues = useCallback(async () => {
    setIssuesLoading(true);
    try {
      const res = await fetch("/api/tracker/review");
      const data = await res.json();
      setReview(data.error ? null : data);
    } catch (error) {
      console.error("Failed to fetch issues:", error);
      setReview(null);
    } finally {
      setIssuesLoading(false);
    }
  }, []);

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
      const issues = review?.issues || [];

      const teamSheet = XLSX.utils.json_to_sheet(
        people.map((p) => ({
          Name: p.name,
          Username: p.username,
          "Issues Created": p.issuesCreated,
          "Issues Closed": p.issuesClosed,
          Comments: p.comments,
          "Total Events": p.totalEvents,
          WIP: wipMap[p.username] || 0,
        }))
      );

      const issueSheet = XLSX.utils.json_to_sheet(
        issues.map((i) => ({
          IID: i.issueIid,
          Title: i.issueTitle || "",
          Project: i.projectName || "",
          Author: i.authorName,
          Status: i.state,
          "Board Stage": i.boardStage,
          Priority: i.priority || "",
          Team: i.team || "",
          Type: i.type || "",
          Created: i.createdAt ? new Date(i.createdAt).toLocaleString() : "",
          Closed: i.closedAt ? new Date(i.closedAt).toLocaleString() : "",
          "Cycle Time (hours)": i.timeToCloseHours ?? "",
          Comments: i.commentCount ?? 0,
          URL: i.issueUrl || "",
        }))
      );

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, teamSheet, "Team Activity");
      XLSX.utils.book_append_sheet(wb, issueSheet, "All Issues");

      if (review) {
        const boardSheet = XLSX.utils.json_to_sheet(
          review.boardDistribution.map((s) => ({ Stage: s.stage, Issues: s.count }))
        );
        XLSX.utils.book_append_sheet(wb, boardSheet, "Board Summary");
      }

      XLSX.writeFile(
        wb,
        `issue-review-${periodType}-${new Date().toISOString().slice(0, 10)}.xlsx`
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
            Team activity and issue tracking for the main project
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
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
        />
      )}

      {/* Section 1: Team activity for the selected period */}
      <TeamWeekSection
        people={people}
        loading={teamLoading}
        subtitle={`${rangeLabel(periodType, anchor)} · click a person to see what they worked on`}
        wipMap={wipMap}
        wipLimit={wipLimit}
        from={fromIso}
        to={toIso}
      />

      {/* Section 2: All issues */}
      {selectedIssue ? (
        <IssueDetailView issue={selectedIssue} onBack={() => setSelectedIssue(null)} />
      ) : (
        <Card>
          <CardContent className="pt-6">
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
