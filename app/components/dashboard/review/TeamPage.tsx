"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ReviewHeader } from "./ReviewHeader";
import { TeamWeekSection } from "./TeamWeekSection";
import { WIP_LIMIT, priorityLabel, type ReviewData, type ReviewIssue } from "./types";
import { ageDays, categorizeAttention } from "./attention";
import { Download, ChevronLeft, ChevronRight } from "lucide-react";

interface PersonWeek {
  username: string;
  name: string;
  issuesCreated: number;
  issuesClosed: number;
  issuesReopened: number;
  mrsCreated: number;
  mrsMerged: number;
  commits: number;
  totalComments: number;
  totalEvents: number;
  /** Progress % added via /dev + /test + /uat commands in the period */
  progressDelivered: number;
  /** Open issues authored or assigned, across ALL synced repos */
  openTaskCount: number;
  /** Open task count per board stage (workflow stages only) */
  openTasksByStage: Record<string, number>;
  /** ISO timestamp of most recent activity in the period */
  lastActivityAt: string | null;
  /** Previous period values for delta comparison */
  prevCommits: number;
  prevMrsMerged: number;
  prevIssuesClosed: number;
  prevTotalEvents: number;
  /** Performance scoring */
  performanceScore: number;
  performanceGrade: "A" | "B" | "C" | "D" | "F";
  performanceRole: "developer" | "coordinator" | "mixed";
  /** Quality metrics */
  avgCycleTimeHours: number | null;
  avgFirstResponseHours: number | null;
  /** Consistency */
  consistency: number;
  daysActive: number;
  totalDays: number;
}

type PeriodType = "day" | "week" | "month" | "custom";

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

/**
 * Who Did What page — per-person activity for a selected period, cross-project
 * open workload, and long-range trend charts.
 */
export function TeamPage() {
  const searchParams = useSearchParams();
  const repoParamRaw = searchParams.get("repo");
  const repoParam = repoParamRaw && !isNaN(parseInt(repoParamRaw)) ? repoParamRaw : null;
  const projectParam = searchParams.get("project") || "";

  // Period state
  const [periodType, setPeriodType] = useState<PeriodType>("week");
  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");
  const isCustom = periodType === "custom";

  const [people, setPeople] = useState<PersonWeek[]>([]);
  const [teamLoading, setTeamLoading] = useState(true);
  const [review, setReview] = useState<ReviewData | null>(null);
  const [exporting, setExporting] = useState(false);

  // Use custom dates when in custom mode, otherwise compute from period
  const range = isCustom && customFrom && customTo
    ? { from: new Date(customFrom), to: new Date(customTo) }
    : getRange(periodType, anchor);
  const fromIso = range.from.toISOString();
  const toIso = range.to.toISOString();
  const isCurrent = isCustom
    ? false
    : rangeLabel(periodType, anchor) === rangeLabel(periodType, currentAnchor(periodType));

  const wipMap: Record<string, number> = {};
  for (const p of review?.people || []) wipMap[p.username] = p.wipCount;
  const wipLimit = review ? WIP_LIMIT : 2;

  const fetchTeam = useCallback(async () => {
    try {
      // "Who Did What" scoped by project or repo if selected
      const params = new URLSearchParams();
      params.set("from", fromIso);
      params.set("to", toIso);
      params.set("period", periodType);
      if (repoParam) params.set("repo", repoParam);
      else if (projectParam) params.set("project", projectParam);
      const res = await fetch(`/api/tracker/team-week?${params.toString()}`);
      const data = await res.json();
      setPeople(data.error ? [] : data.people || []);
    } catch (error) {
      console.error("Failed to fetch team activity:", error);
      setPeople([]);
    } finally {
      setTeamLoading(false);
    }
  }, [fromIso, toIso, periodType, repoParam, projectParam]);

  // WIP counts come from the review endpoint (main board In Progress per person)
  const fetchReview = useCallback(async () => {
    try {
      const repoQs = repoParam ? `?repo=${repoParam}` : "";
      const res = await fetch(`/api/tracker/review${repoQs}`);
      const data = await res.json();
      setReview(data.error ? null : data);
    } catch (error) {
      console.error("Failed to fetch review:", error);
      setReview(null);
    }
  }, [repoParam]);

  useEffect(() => {
    fetchTeam();
  }, [fetchTeam]);

  useEffect(() => {
    fetchReview();
  }, [fetchReview]);

  const exportExcel = async () => {
    setExporting(true);
    try {
      const XLSX = await import("xlsx");

      // Fetch each person's open tasks + assigned checklist tasks (batched)
      const issueRows: Array<Record<string, string | number>> = [];
      const attentionRows: Array<Record<string, string | number>> = [];
      const perPersonIssues = new Map<string, ReviewIssue[]>();

      const assigneeList = (raw: string | null): string =>
        (raw || "")
          .split(",")
          .map((a) => a.trim())
          .filter(Boolean)
          .join(", ");

      const fmtDate = (v: string | number | null): string => {
        if (v == null) return "";
        // Handle UNIX timestamps (all digits) — convert to ISO
        const ts = typeof v === "string" && /^\d+$/.test(v) ? Number(v) * 1000 : undefined;
        const d = ts ? new Date(ts) : new Date(v);
        return isNaN(d.getTime()) ? "" : d.toLocaleDateString();
      };

      const batchSize = 10;
      for (let i = 0; i < people.length; i += batchSize) {
        const batch = people.slice(i, i + batchSize);
        const results = await Promise.all(
          batch.map(async (p) => {
            try {
              const repoQs = repoParam ? `&repo=${repoParam}` : "";
              const res = await fetch(
                `/api/tracker/person-report?user=${encodeURIComponent(p.username)}&from=${fromIso}&to=${toIso}${repoQs}`
              );
              if (!res.ok) return [];
              const data = await res.json();
              if (data.error) return [];
              const tasks: Array<{
                gitlabProjectId: number;
                issueIid: number;
                issueTitle: string | null;
                issueUrl: string | null;
                projectName: string;
                boardStage: string;
                priority: string;
                labels: string | null;
                assigneeUsernames: string | null;
                authorName: string;
                team: string | null;
                type: string | null;
                market: string | null;
                devProgress: number | null;
                qaProgress: number | null;
                commentCount: number | null;
                createdAt: string | null;
                weight: number | null;
                inProgressAt: number | null;
              }> = data.openTasks || [];

              // Same columns as the Board Review "All Issues" sheet (+ Person)
              const rows = tasks.map((t) => ({
                Person: p.name,
                IID: t.issueIid,
                Title: t.issueTitle || "",
                Project: t.projectName,
                Author: t.authorName,
                Assignees: assigneeList(t.assigneeUsernames),
                Status: "open",
                "Board Stage": t.boardStage,
                "Start Date": t.inProgressAt
                  ? new Date(t.inProgressAt).toLocaleDateString()
                  : "",
                "Dev Progress (%)": t.devProgress ?? "",
                "QA Progress (%)": t.qaProgress ?? "",
                Priority: t.priority ? `${t.priority} - ${priorityLabel(t.priority)}` : "",
                Team: t.team || "",
                Type: t.type || "",
                Market: t.market || "",
                Created: t.createdAt ? new Date(t.createdAt).toLocaleDateString() : "",
                Closed: "",
                "Age (days)": t.createdAt ? ageDays(t.createdAt) : "",
                "Cycle Time (hours)": "",
                Comments: t.commentCount ?? 0,
                URL: t.issueUrl || "",
              }));

              // ReviewIssue-shaped objects for the shared attention categorizer
              const reviewIssues: ReviewIssue[] = tasks
                .filter((t) => t.createdAt != null)
                .map((t) => ({
                  id: 0,
                  projectId: 0,
                  projectName: t.projectName,
                  gitlabProjectId: t.gitlabProjectId,
                  issueIid: t.issueIid,
                  issueTitle: t.issueTitle,
                  issueUrl: t.issueUrl,
                  authorUsername: "",
                  authorName: t.authorName,
                  assigneeUsernames: t.assigneeUsernames,
                  state: "open",
                  labels: t.labels,
                  createdAt: t.createdAt as string,
                  closedAt: null,
                  firstResponseAt: null,
                  timeToCloseHours: null,
                  timeToFirstResponseHours: null,
                  commentCount: t.commentCount,
                  uniqueCommenters: null,
                  devProgress: t.devProgress,
                  qaProgress: t.qaProgress,
                  boardStage: t.boardStage,
                  priority: t.priority || null,
                  team: t.team,
                  type: t.type,
                  market: t.market,
                  linkedIssues: [],
                  activityActors: null,
                  weight: t.weight,
                  startDate: t.inProgressAt,
                }));
              perPersonIssues.set(p.username, reviewIssues);
              return rows;
            } catch {
              return [];
            }
          })
        );
        for (const r of results) issueRows.push(...r);
      }

      // Needs Attention — same categorization as the Board Review export
      for (const p of people) {
        const issues = perPersonIssues.get(p.username) || [];
        for (const cat of categorizeAttention(issues)) {
          for (const i of cat.issues) {
            attentionRows.push({
              Person: p.name,
              Category: cat.title,
              IID: i.issueIid,
              Title: i.issueTitle || "",
              Author: i.authorName,
              Assignees: assigneeList(i.assigneeUsernames),
              Stage: i.boardStage,
              "Dev Progress (%)": i.devProgress ?? "",
              "QA Progress (%)": i.qaProgress ?? "",
              Priority: i.priority ? `${i.priority} - ${priorityLabel(i.priority)}` : "",
              "Age (days)": ageDays(i.createdAt),
              URL: i.issueUrl || "",
            });
          }
        }
      }

      const wb = XLSX.utils.book_new();

      // Sheet: Needs Attention (same layout as Board Review)
      if (attentionRows.length > 0) {
        const attentionSheet = XLSX.utils.json_to_sheet(attentionRows);
        attentionSheet["!cols"] = [
          { wch: 20 }, { wch: 24 }, { wch: 8 }, { wch: 50 }, { wch: 20 }, { wch: 20 },
          { wch: 14 }, { wch: 15 }, { wch: 15 }, { wch: 10 }, { wch: 12 }, { wch: 40 },
        ];
        XLSX.utils.book_append_sheet(wb, attentionSheet, "Needs Attention");
      }

      // Sheet: Assigned Issues (Board Review "All Issues" columns + Person)
      const issueSheet = XLSX.utils.json_to_sheet(issueRows);
      issueSheet["!cols"] = [
        { wch: 20 }, { wch: 8 }, { wch: 50 }, { wch: 16 }, { wch: 20 }, { wch: 20 },
        { wch: 9 }, { wch: 14 }, { wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 10 },
        { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 11 },
        { wch: 11 }, { wch: 10 }, { wch: 40 },
      ];
      XLSX.utils.book_append_sheet(wb, issueSheet, "Assigned Issues");

      // Sheet: Team Summary (AOA layout like the Board Review "Board Summary")
      const periodText = isCustom
        ? customFrom && customTo
          ? `${customFrom} – ${customTo}`
          : "Custom range"
        : rangeLabel(periodType, anchor);
      const roleLabel = (r: PersonWeek["performanceRole"]): string =>
        r === "developer" ? "Developer" : r === "coordinator" ? "Coordinator" : "Contributor";

      const summaryAoa: Array<Array<string | number>> = [];
      summaryAoa.push(["Who Did What Export"]);
      summaryAoa.push(["Generated", new Date().toLocaleString()]);
      summaryAoa.push(["Period", periodText]);
      summaryAoa.push([]);
      summaryAoa.push(["TEAM ACTIVITIES"]);
      summaryAoa.push([
        "Name", "Username", "Role", "Issues Created", "Issues Closed", "Issues Reopened",
        "MRs Created", "MRs Merged", "Commits", "Comments", "Total Events",
        "Progress Delivered (%)", "Assigned Open", "Score", "Grade",
        "Consistency (%)", "Days Active", "Last Active",
      ]);
      for (const p of people) {
        summaryAoa.push([
          p.name, `@${p.username}`, roleLabel(p.performanceRole),
          p.issuesCreated, p.issuesClosed, p.issuesReopened,
          p.mrsCreated, p.mrsMerged, p.commits, p.totalComments, p.totalEvents,
          p.progressDelivered, p.openTaskCount, p.performanceScore, p.performanceGrade,
          p.consistency, p.daysActive, fmtDate(p.lastActivityAt),
        ]);
      }
      summaryAoa.push([]);
      summaryAoa.push(["OPEN TASKS BY STAGE"]);
      summaryAoa.push(["Stage", "Tasks"]);
      const stageTotals = new Map<string, number>();
      for (const p of people) {
        for (const [stage, count] of Object.entries(p.openTasksByStage)) {
          stageTotals.set(stage, (stageTotals.get(stage) || 0) + count);
        }
      }
      for (const [stage, count] of [...stageTotals.entries()].sort((a, b) => b[1] - a[1])) {
        summaryAoa.push([stage, count]);
      }
      const wipViolators = people.filter((p) => (wipMap[p.username] || 0) > wipLimit);
      if (wipViolators.length > 0) {
        summaryAoa.push([]);
        summaryAoa.push([`WIP VIOLATIONS (over ${wipLimit} In Progress)`]);
        summaryAoa.push(["Name", "Username", "In Progress"]);
        for (const p of wipViolators) {
          summaryAoa.push([p.name, `@${p.username}`, wipMap[p.username]]);
        }
      }
      const summarySheet = XLSX.utils.aoa_to_sheet(summaryAoa);
      summarySheet["!cols"] = [
        { wch: 22 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 13 }, { wch: 15 },
        { wch: 12 }, { wch: 11 }, { wch: 9 }, { wch: 10 }, { wch: 12 }, { wch: 18 },
        { wch: 13 }, { wch: 8 }, { wch: 8 }, { wch: 14 }, { wch: 11 }, { wch: 14 },
      ];
      XLSX.utils.book_append_sheet(wb, summarySheet, "Team Summary");

      XLSX.writeFile(
        wb,
        `team-activity_${periodType}_${range.from.toISOString().slice(0, 10)}.xlsx`
      );
    } catch (error) {
      console.error("Export failed:", error);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <ReviewHeader
        title="Who Did What"
        subtitle="Team activity across all repositories"
      >
        {/* Period selector */}
        <div className="flex items-center rounded-lg border overflow-hidden">
          {(["day", "week", "month"] as PeriodType[]).map((t) => (
            <button
              key={t}
              onClick={() => {
                setPeriodType(t);
                setAnchor(currentAnchor(t));
                setCustomFrom("");
                setCustomTo("");
              }}
              className={`px-3 py-2 text-sm font-medium transition-colors ${
                !isCustom && periodType === t
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted"
              }`}
            >
              {t === "day" ? "Today" : t === "week" ? "This Week" : "This Month"}
            </button>
          ))}
          <button
            onClick={() => {
              if (!isCustom) {
                // Switch to custom: pre-fill with current range
                const r = getRange(periodType, anchor);
                setCustomFrom(r.from.toISOString().slice(0, 10));
                setCustomTo(r.to.toISOString().slice(0, 10));
                setPeriodType("custom" as PeriodType);
              }
            }}
            className={`px-3 py-2 text-sm font-medium transition-colors ${
              isCustom ? "bg-primary text-primary-foreground" : "hover:bg-muted"
            }`}
          >
            Custom
          </button>
        </div>

        {/* Custom date range inputs */}
        {isCustom && (
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="w-[150px]"
            />
            <span className="text-muted-foreground">–</span>
            <Input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="w-[150px]"
            />
          </div>
        )}

        {/* Range navigation (hidden in custom mode) */}
        {!isCustom && (
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
        )}

        <span className="text-sm font-medium px-1 min-w-[150px]">
          {isCustom
            ? customFrom && customTo
              ? `${new Date(customFrom).toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${new Date(customTo).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`
              : "Select dates"
            : rangeLabel(periodType, anchor)}
        </span>

        <Button variant="outline" onClick={exportExcel} disabled={exporting || people.length === 0}>
          <Download className={`h-4 w-4 mr-2 ${exporting ? "animate-pulse" : ""}`} />
          Excel
        </Button>
      </ReviewHeader>

      <TeamWeekSection
        people={people}
        loading={teamLoading}
        subtitle={`${isCustom ? "Custom range" : rangeLabel(periodType, anchor)} · click a person to see what they worked on`}
        wipMap={wipMap}
        wipLimit={wipLimit}
        from={fromIso}
        to={toIso}
        repo={repoParam}
      />
    </div>
  );
}
