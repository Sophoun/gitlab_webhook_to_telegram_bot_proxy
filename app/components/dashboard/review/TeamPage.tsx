"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ReviewHeader } from "./ReviewHeader";
import { TeamWeekSection } from "./TeamWeekSection";
import { WIP_LIMIT, type ReviewData } from "./types";
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
      const repoQs = repoParam ? `&repo=${repoParam}` : "";
      const res = await fetch(
        `/api/tracker/team-week?from=${fromIso}&to=${toIso}&period=${periodType}${repoQs}`
      );
      const data = await res.json();
      setPeople(data.error ? [] : data.people || []);
    } catch (error) {
      console.error("Failed to fetch team activity:", error);
      setPeople([]);
    } finally {
      setTeamLoading(false);
    }
  }, [fromIso, toIso, repoParam, periodType]);

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

      // Fetch assigned issues for each person (in parallel, batched)
      const issueRows: Array<{
        Person: string;
        "Issue #": number;
        Title: string | null;
        Project: string;
        Stage: string;
        URL: string;
      }> = [];

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
              }> = data.openTasks || [];
              return tasks.map((t) => ({
                Person: p.name,
                "Issue #": t.issueIid,
                Title: t.issueTitle,
                Project: t.projectName,
                Stage: t.boardStage,
                URL: t.issueUrl || "",
              }));
            } catch {
              return [];
            }
          })
        );
        for (const r of results) issueRows.push(...r);
      }

      const issueSheet = XLSX.utils.json_to_sheet(issueRows);
      issueSheet["!cols"] = [
        { wch: 20 }, { wch: 10 }, { wch: 40 }, { wch: 25 }, { wch: 16 }, { wch: 60 },
      ];
      // Enable auto-filter on the header row
      if (issueRows.length > 0) {
        issueSheet["!autofilter"] = {
          ref: `A1:F${issueRows.length + 1}`,
        };
      }

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, issueSheet, "Assigned Issues");
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
