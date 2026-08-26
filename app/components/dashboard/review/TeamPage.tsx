"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ReviewHeader } from "./ReviewHeader";
import { TeamWeekSection } from "./TeamWeekSection";
import { TrendCharts } from "./TrendCharts";
import { WIP_LIMIT, type ReviewData } from "./types";
import { Download, ChevronLeft, ChevronRight } from "lucide-react";

interface PersonWeek {
  username: string;
  name: string;
  issuesCreated: number;
  issuesClosed: number;
  mrsCreated: number;
  mrsMerged: number;
  commits: number;
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

  const [people, setPeople] = useState<PersonWeek[]>([]);
  const [teamLoading, setTeamLoading] = useState(true);
  const [review, setReview] = useState<ReviewData | null>(null);
  const [exporting, setExporting] = useState(false);

  const range = getRange(periodType, anchor);
  // Stable primitive deps — Date objects change identity every render
  const fromIso = range.from.toISOString();
  const toIso = range.to.toISOString();
  const isCurrent =
    rangeLabel(periodType, anchor) === rangeLabel(periodType, currentAnchor(periodType));

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
      const teamSheet = XLSX.utils.json_to_sheet(
        people.map((p) => {
          const coordination = p.issuesCreated;
          const delivery = p.issuesClosed;
          const code = p.commits + p.mrsMerged + p.mrsCreated;
          const total = coordination + delivery + code;
          let focus = "No activity";
          if (total > 0) {
            const share = (n: number) => n / total;
            if (share(code) >= 0.6) focus = "Code";
            else if (share(coordination) >= 0.6) focus = "Coordination";
            else if (share(delivery) >= 0.6) focus = "Delivery";
            else focus = "Mixed";
          }
          return {
            Name: p.name,
            Username: p.username,
            Status: p.totalEvents > 0 ? "Active" : "No activity",
            Focus: focus,
            "Open Tasks": p.openTaskCount ?? 0,
            "MRs Merged": p.mrsMerged,
            Commits: p.commits,
            Total: p.totalEvents,
            "Progress Delivered (%)": p.progressDelivered ?? 0,
            WIP: wipMap[p.username] || 0,
            "Last Active": p.lastActivityAt
              ? new Date(p.lastActivityAt).toLocaleString()
              : "—",
          };
        })
      );
      teamSheet["!cols"] = [
        { wch: 22 }, { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 12 },
        { wch: 10 }, { wch: 20 }, { wch: 13 }, { wch: 8 },
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, teamSheet, "Team Activity");
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
        onSynced={() => {
          fetchTeam();
          fetchReview();
        }}
      >
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
                periodType === t ? "bg-primary text-primary-foreground" : "hover:bg-muted"
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

        <Button variant="outline" onClick={exportExcel} disabled={exporting || people.length === 0}>
          <Download className={`h-4 w-4 mr-2 ${exporting ? "animate-pulse" : ""}`} />
          Excel
        </Button>
      </ReviewHeader>

      <TrendCharts repoParam={repoParam} />

      <TeamWeekSection
        people={people}
        loading={teamLoading}
        subtitle={`${rangeLabel(periodType, anchor)} · click a person to see what they worked on`}
        wipMap={wipMap}
        wipLimit={wipLimit}
        from={fromIso}
        to={toIso}
        repo={repoParam}
      />
    </div>
  );
}
