"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronRightIcon,
  Trophy,
  Target,
  Clock,
  Zap,
  TrendingUp,
  TrendingDown,
  Minus,
  HelpCircle,
} from "lucide-react";
import { ReviewHeader } from "./ReviewHeader";

type PeriodType = "day" | "week" | "month";

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
  progressDelivered: number;
  openTaskCount: number;
  openTasksByStage: Record<string, number>;
  lastActivityAt: string | null;
  prevCommits: number;
  prevMrsMerged: number;
  prevIssuesClosed: number;
  prevTotalEvents: number;
  performanceScore: number;
  performanceGrade: "A" | "B" | "C" | "D" | "F";
  performanceRole: "developer" | "coordinator" | "mixed";
  avgCycleTimeHours: number | null;
  avgFirstResponseHours: number | null;
  consistency: number;
  daysActive: number;
  totalDays: number;
}

function getWeekStart(d: Date): Date {
  const nd = new Date(d);
  const day = nd.getDay();
  const diff = nd.getDate() - day + (day === 0 ? -6 : 1);
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
  if (type === "week") {
    const from = getWeekStart(anchor);
    const to = new Date(from);
    to.setDate(to.getDate() + 7);
    return { from, to };
  }
  const from = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const to = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1);
  return { from, to };
}

function formatHours(hours: number | null): string {
  if (hours === null) return "—";
  if (hours < 24) return `${Math.round(hours)}h`;
  const d = Math.floor(hours / 24);
  const h = Math.round(hours % 24);
  return h > 0 ? `${d}d ${h}h` : `${d}d`;
}

const GRADE_COLORS: Record<string, string> = {
  A: "bg-emerald-100 text-emerald-800 border-emerald-300",
  B: "bg-blue-100 text-blue-800 border-blue-300",
  C: "bg-yellow-100 text-yellow-800 border-yellow-300",
  D: "bg-orange-100 text-orange-800 border-orange-300",
  F: "bg-red-100 text-red-800 border-red-300",
};

const ROLE_LABELS: Record<string, string> = {
  developer: "DEV",
  coordinator: "BIZ",
  mixed: "MIX",
};

const ROLE_COLORS: Record<string, string> = {
  developer: "bg-emerald-50 text-emerald-700 border-emerald-200",
  coordinator: "bg-blue-50 text-blue-700 border-blue-200",
  mixed: "bg-gray-50 text-gray-600 border-gray-200",
};

export function PerformanceReview() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const repo = searchParams.get("repo");

  const [people, setPeople] = useState<PersonWeek[]>([]);
  const [loading, setLoading] = useState(true);
  const [periodType, setPeriodType] = useState<PeriodType>("week");
  const [anchor, setAnchor] = useState(new Date());
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"score" | "name" | "events" | "openTasks">("score");
  const [sortAsc, setSortAsc] = useState(false);
  const [syncKey, setSyncKey] = useState(0);
  const [showLegend, setShowLegend] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { from, to } = getRange(periodType, anchor);
      const params = new URLSearchParams({
        from: from.toISOString(),
        to: to.toISOString(),
        period: periodType,
      });
      if (repo) params.set("repo", repo);
      const res = await fetch(`/api/tracker/team-week?${params}`);
      const data = await res.json();
      if (!data.error) setPeople(data.people || []);
    } catch (e) {
      console.error("Failed to fetch performance data:", e);
    } finally {
      setLoading(false);
    }
  }, [periodType, anchor, repo]);

  useEffect(() => {
    fetchData();
  }, [fetchData, syncKey]);

  const sorted = useMemo(() => {
    return [...people].sort((a, b) => {
      switch (sortBy) {
        case "name":
          return sortAsc ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
        case "events":
          return sortAsc ? a.totalEvents - b.totalEvents : b.totalEvents - a.totalEvents;
        case "openTasks":
          return sortAsc ? a.openTaskCount - b.openTaskCount : b.openTaskCount - a.openTaskCount;
        case "score":
        default:
          return sortAsc ? a.performanceScore - b.performanceScore : b.performanceScore - a.performanceScore;
      }
    });
  }, [people, sortBy, sortAsc]);

  const filtered = useMemo(() => {
    if (!search) return sorted;
    const q = search.toLowerCase();
    return sorted.filter(
      (p) => p.name.toLowerCase().includes(q) || p.username.toLowerCase().includes(q)
    );
  }, [sorted, search]);

  const teamStats = useMemo(() => {
    if (people.length === 0) return null;
    const avgScore = Math.round(people.reduce((s, p) => s + p.performanceScore, 0) / people.length);
    const avgConsistency = Math.round(people.reduce((s, p) => s + p.consistency, 0) / people.length);
    const totalClosed = people.reduce((s, p) => s + p.issuesClosed, 0);
    const totalCommits = people.reduce((s, p) => s + p.commits, 0);
    const totalMrs = people.reduce((s, p) => s + p.mrsMerged, 0);
    const gradeDist = { A: 0, B: 0, C: 0, D: 0, F: 0 };
    for (const p of people) gradeDist[p.performanceGrade]++;
    return { avgScore, avgConsistency, totalClosed, totalCommits, totalMrs, gradeDist, count: people.length };
  }, [people]);

  const handleSort = (field: typeof sortBy) => {
    if (sortBy === field) setSortAsc((v) => !v);
    else { setSortBy(field); setSortAsc(false); }
  };

  const navigate = (delta: number) => {
    const d = new Date(anchor);
    if (periodType === "day") d.setDate(d.getDate() + delta);
    else if (periodType === "week") d.setDate(d.getDate() + delta * 7);
    else d.setMonth(d.getMonth() + delta);
    setAnchor(d);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-6 pb-0">
        <ReviewHeader
          title="Performance"
          subtitle="Team performance scores and rankings across all repos"
          onSynced={() => setSyncKey((k) => k + 1)}
        >
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border overflow-hidden">
              {(["day", "week", "month"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setPeriodType(t)}
                  className={`px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                    periodType === t ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setAnchor(new Date())}>
              Now
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </ReviewHeader>
      </div>

      <div className="flex-1 overflow-auto px-6 pb-6 space-y-6">
        {/* Legend toggle */}
        <div className="pt-2">
          <button
            onClick={() => setShowLegend(!showLegend)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <HelpCircle className="h-3.5 w-3.5" />
            {showLegend ? <ChevronDown className="h-3 w-3" /> : <ChevronRightIcon className="h-3 w-3" />}
            What do these values mean?
          </button>
          {showLegend && (
            <Card className="mt-2">
              <CardContent className="pt-4 pb-3">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3 text-xs">
                  <div>
                    <span className="font-semibold">Score</span>{" "}
                    <span className="text-muted-foreground">(0–100)</span> — Weighted performance score combining code output, delivery, workload, quality, and consistency. Higher is better.
                  </div>
                  <div>
                    <span className="font-semibold">Grade</span>{" "}
                    <span className="text-muted-foreground">(A/B/C/D/F)</span> — Letter grade derived from score: A ≥ 90, B ≥ 80, C ≥ 70, D ≥ 60, F &lt; 60.
                  </div>
                  <div>
                    <span className="font-semibold">Role</span>{" "}
                    <span className="text-muted-foreground">(DEV / BIZ / MIX)</span> — Auto-detected from activity patterns. <b>DEV</b> = writes code or closes issues. <b>BIZ</b> = creates issues without coding. <b>MIX</b> = balanced or inactive.
                  </div>
                  <div>
                    <span className="font-semibold">Activity</span> — Total GitLab events this period (commits + MRs + issues closed + comments). Measures output volume, not quality.
                  </div>
                  <div>
                    <span className="font-semibold">Open</span> — Number of issues currently assigned to this person and still open. More assigned work = higher workload score.
                  </div>
                  <div>
                    <span className="font-semibold">Closed</span> — Issues closed (resolved) by this person during the period. Primary delivery signal.
                  </div>
                  <div>
                    <span className="font-semibold">Commits</span> — Git commits pushed to any tracked repo during the period. Feeds into the Code dimension of the score.
                  </div>
                  <div>
                    <span className="font-semibold">MRs</span> — Merge requests merged during the period. Weighted higher than commits (1 MR ≈ 3 commits).
                  </div>
                  <div>
                    <span className="font-semibold">Consistency</span> — Percentage of days in the period where this person had any GitLab activity. 100% = active every day. Measures regularity.
                  </div>
                  <div>
                    <span className="font-semibold">Cycle Time</span> — Average hours from issue creation to closure. Lower is better. Indicates how fast work flows through.
                  </div>
                  <div>
                    <span className="font-semibold">1st Response</span> — Average hours from issue creation to first comment by the assignee. Lower is better. Indicates responsiveness.
                  </div>
                  <div>
                    <span className="font-semibold">Rework</span> — Number of issues that were reopened after being closed. Signals quality issues. Reopened issues reduce the quality score.
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
        {loading ? (
          <p className="text-center py-12 text-muted-foreground">Loading performance data...</p>
        ) : people.length === 0 ? (
          <div className="text-center py-12 space-y-2">
            <p className="text-muted-foreground">No activity for this period.</p>
            <p className="text-sm text-muted-foreground">Try a different time range or sync data first.</p>
          </div>
        ) : (
          <>
            {/* Team Summary Cards */}
            {teamStats && (
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription className="flex items-center gap-1.5">
                      <Trophy className="h-3.5 w-3.5 text-yellow-500" /> Team Score
                    </CardDescription>
                    <CardTitle className="text-3xl">{teamStats.avgScore}</CardTitle>
                  </CardHeader>
                  <CardContent className="text-xs text-muted-foreground">
                    avg across {teamStats.count} members
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription className="flex items-center gap-1.5">
                      <Target className="h-3.5 w-3.5 text-blue-500" /> Consistency
                    </CardDescription>
                    <CardTitle className="text-3xl">{teamStats.avgConsistency}%</CardTitle>
                  </CardHeader>
                  <CardContent className="text-xs text-muted-foreground">
                    avg days active
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription className="flex items-center gap-1.5">
                      <Zap className="h-3.5 w-3.5 text-emerald-500" /> Issues Closed
                    </CardDescription>
                    <CardTitle className="text-3xl text-emerald-700">{teamStats.totalClosed}</CardTitle>
                  </CardHeader>
                  <CardContent className="text-xs text-muted-foreground">
                    this period
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-teal-500" /> MRs Merged
                    </CardDescription>
                    <CardTitle className="text-3xl text-teal-700">{teamStats.totalMrs}</CardTitle>
                  </CardHeader>
                  <CardContent className="text-xs text-muted-foreground">
                    this period
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Grade Distribution</CardDescription>
                  </CardHeader>
                  <CardContent className="flex gap-1">
                    {(["A", "B", "C", "D", "F"] as const).map((g) => (
                      <div key={g} className="flex flex-col items-center">
                        <span className={`text-lg font-bold ${g === "A" ? "text-emerald-600" : g === "B" ? "text-blue-600" : g === "C" ? "text-yellow-600" : g === "D" ? "text-orange-600" : "text-red-600"}`}>
                          {teamStats.gradeDist[g]}
                        </span>
                        <span className="text-[10px] text-muted-foreground">{g}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Leaderboard */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-yellow-500" /> Team Leaderboard
                </CardTitle>
                <CardDescription>Ranked by performance score · click column headers to sort</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="pb-3">
                  <Input
                    placeholder="Search by name or username…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="max-w-xs"
                  />
                </div>
                <div className="border rounded-lg overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">#</TableHead>
                        <TableHead>
                          <button onClick={() => handleSort("name")} className="text-xs font-medium hover:text-foreground">
                            Name {sortBy === "name" ? (sortAsc ? "↑" : "↓") : ""}
                          </button>
                        </TableHead>
                        <TableHead>
                          <button onClick={() => handleSort("score")} className="text-xs font-medium hover:text-foreground">
                            Score {sortBy === "score" ? (sortAsc ? "↑" : "↓") : ""}
                          </button>
                        </TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead className="text-right">
                          <button onClick={() => handleSort("events")} className="text-xs font-medium hover:text-foreground">
                            Activity {sortBy === "events" ? (sortAsc ? "↑" : "↓") : ""}
                          </button>
                        </TableHead>
                        <TableHead className="text-right">
                          <button onClick={() => handleSort("openTasks")} className="text-xs font-medium hover:text-foreground">
                            Open {sortBy === "openTasks" ? (sortAsc ? "↑" : "↓") : ""}
                          </button>
                        </TableHead>
                        <TableHead className="text-right">Closed</TableHead>
                        <TableHead className="text-right">Commits</TableHead>
                        <TableHead className="text-right">MRs</TableHead>
                        <TableHead className="text-right">Consistency</TableHead>
                        <TableHead className="text-right">Cycle Time</TableHead>
                        <TableHead className="text-right">1st Response</TableHead>
                        <TableHead className="text-right">Rework</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((p, i) => (
                        <TableRow
                          key={p.username}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => router.push(`/review/people/${encodeURIComponent(p.username)}`)}
                        >
                          <TableCell className="font-medium text-muted-foreground">{i + 1}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                <span className="text-xs font-medium">{p.name.charAt(0).toUpperCase()}</span>
                              </div>
                              <div>
                                <div className="font-medium text-sm">{p.name}</div>
                                <div className="text-[10px] text-muted-foreground">@{p.username}</div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg border text-sm font-bold ${GRADE_COLORS[p.performanceGrade] || "bg-gray-100"}`}>
                                {p.performanceGrade}
                              </span>
                              <span className="text-xs text-muted-foreground">{p.performanceScore}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium ${ROLE_COLORS[p.performanceRole] || ""}`}>
                              {ROLE_LABELS[p.performanceRole] || p.performanceRole}
                            </span>
                          </TableCell>
                          <TableCell className="text-right text-sm font-medium">{p.totalEvents}</TableCell>
                          <TableCell className="text-right text-sm">{p.openTaskCount}</TableCell>
                          <TableCell className="text-right text-sm text-emerald-700">{p.issuesClosed}</TableCell>
                          <TableCell className="text-right text-sm">{p.commits}</TableCell>
                          <TableCell className="text-right text-sm text-teal-700">{p.mrsMerged}</TableCell>
                          <TableCell className="text-right text-sm">
                            <span className={p.consistency >= 70 ? "text-emerald-600" : p.consistency >= 40 ? "text-yellow-600" : "text-red-500"}>
                              {p.consistency}%
                            </span>
                          </TableCell>
                          <TableCell className="text-right text-sm">{formatHours(p.avgCycleTimeHours)}</TableCell>
                          <TableCell className="text-right text-sm">{formatHours(p.avgFirstResponseHours)}</TableCell>
                          <TableCell className="text-right text-sm">
                            {p.issuesReopened > 0 ? (
                              <span className="text-orange-600">{p.issuesReopened}×</span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {/* Performance Breakdown Cards */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {filtered.slice(0, 10).map((p) => {
                const delta = p.totalEvents - p.prevTotalEvents;
                const deltaPct = p.prevTotalEvents > 0 ? Math.round((delta / p.prevTotalEvents) * 100) : null;
                return (
                  <Card key={p.username} className="hover:shadow-md transition-shadow">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                            <span className="text-sm font-medium">{p.name.charAt(0).toUpperCase()}</span>
                          </div>
                          <div>
                            <CardTitle className="text-base">{p.name}</CardTitle>
                            <CardDescription>@{p.username}</CardDescription>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex items-center justify-center w-10 h-10 rounded-lg border text-lg font-bold ${GRADE_COLORS[p.performanceGrade] || ""}`}>
                            {p.performanceGrade}
                          </span>
                          <span className="text-2xl font-bold">{p.performanceScore}</span>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {/* Score breakdown bar */}
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                          <span className="w-16">Code</span>
                          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className="bg-emerald-500 h-full"
                              style={{ width: `${p.performanceScore}%` }}
                            />
                          </div>
                          <span className="w-8 text-right">{p.commits}c {p.mrsMerged}mr</span>
                        </div>
                      </div>

                      {/* Key metrics */}
                      <div className="grid grid-cols-4 gap-2 text-center">
                        <div>
                          <div className="text-lg font-bold text-blue-600">{p.openTaskCount}</div>
                          <div className="text-[10px] text-muted-foreground">Open Tasks</div>
                        </div>
                        <div>
                          <div className="text-lg font-bold text-emerald-600">{p.issuesClosed}</div>
                          <div className="text-[10px] text-muted-foreground">Closed</div>
                        </div>
                        <div>
                          <div className="text-lg font-bold text-teal-600">{p.mrsMerged}</div>
                          <div className="text-[10px] text-muted-foreground">MRs Merged</div>
                        </div>
                        <div>
                          <div className="text-lg font-bold">{p.consistency}%</div>
                          <div className="text-[10px] text-muted-foreground">Consistent</div>
                        </div>
                      </div>

                      {/* Quality metrics */}
                      <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
                        <span>Cycle: {formatHours(p.avgCycleTimeHours)}</span>
                        <span>1st Response: {formatHours(p.avgFirstResponseHours)}</span>
                        <span>Rework: {p.issuesReopened > 0 ? `${p.issuesReopened}×` : "—"}</span>
                        <span className={`flex items-center gap-0.5 ${delta > 0 ? "text-emerald-600" : delta < 0 ? "text-red-500" : ""}`}>
                          {delta > 0 ? <TrendingUp className="h-3 w-3" /> : delta < 0 ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                          {deltaPct !== null ? `${deltaPct > 0 ? "+" : ""}${deltaPct}%` : "new"}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
