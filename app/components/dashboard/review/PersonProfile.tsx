"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ExternalLink, ListTodo, GitMerge, Code2, Gauge, CalendarDays, CheckCircle2 } from "lucide-react";
import { WORKFLOW_STAGES, STAGE_BADGE_CLASS } from "./types";

interface OpenTask {
  gitlabProjectId: number;
  issueIid: number;
  issueTitle: string | null;
  issueUrl: string | null;
  projectName: string;
  boardStage: string;
  isAuthor: boolean;
  isAssignee: boolean;
}

interface ItemRef {
  itemIid: number;
  itemTitle: string | null;
  itemUrl: string | null;
  projectName: string;
}

interface PersonReportData {
  user: { username: string; name: string };
  summary: {
    issuesCreated: number;
    issuesClosed: number;
    mrsCreated: number;
    mrsMerged: number;
    commits: number;
    totalEvents: number;
  };
  closedIssues: ItemRef[];
  createdIssues: ItemRef[];
  commentedOn: ItemRef[];
  openTasks: OpenTask[];
  authoredOpenIssues: OpenTask[];
  dailyActivity: Array<{ date: string; events: number }>;
}

interface TrendData {
  weeks: Array<{ weekStart: string; commits: number; mrsMerged: number }>;
  people: Array<{ username: string; name: string; commits: number[]; mrsMerged: number[] }>;
}

/** Lookback window for the activity summary (days) */
const PERIOD_DAYS = 30;

function isoDaysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Person profile — everything about one person across ALL repos: open tasks,
 * 30-day activity summary, weekly shipping trend, and a daily activity
 * heatmap-style strip.
 */
export function PersonProfile({ username }: { username: string }) {
  const router = useRouter();
  const [report, setReport] = useState<PersonReportData | null>(null);
  const [trend, setTrend] = useState<TrendData | null>(null);
  const [loading, setLoading] = useState(true);

  const from = isoDaysAgo(PERIOD_DAYS);
  const to = new Date();

  const fetchAll = useCallback(async () => {
    try {
      const reportQs = `from=${from.toISOString()}&to=${to.toISOString()}`;
      const [reportRes, trendRes] = await Promise.all([
        fetch(`/api/tracker/person-report?user=${encodeURIComponent(username)}&${reportQs}`),
        fetch(`/api/tracker/trends?weeks=12&user=${encodeURIComponent(username)}`),
      ]);
      const reportData = await reportRes.json();
      const trendData = await trendRes.json();
      // Only set report if the report fetch succeeded (trend failure is non-fatal)
      if (!reportRes.ok || reportData.error) {
        setReport(null);
      } else {
        setReport(reportData);
      }
      setTrend(trendRes.ok && !trendData.error ? trendData : null);
    } catch (error) {
      console.error("Failed to fetch person profile:", error);
      setReport(null);
      setTrend(null);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const tasksByStage = WORKFLOW_STAGES.map((stage) => ({
    stage,
    items: (report?.openTasks || []).filter((t) => t.boardStage === stage),
  })).filter((g) => g.items.length > 0);

  const myTrend = trend?.people?.[0];
  const maxWeekly = myTrend ? Math.max(1, ...myTrend.commits, ...myTrend.mrsMerged) : 1;
  const maxDaily = Math.max(1, ...(report?.dailyActivity || []).map((d) => d.events));

  if (loading) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Loading profile…
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="p-6 space-y-4">
        <Button variant="outline" onClick={() => router.push("/review/team")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Who Did What
        </Button>
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No data found for @{username}. Try syncing first.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="outline"
          size="icon"
          onClick={() => router.push("/review/team")}
          aria-label="Back to Who Did What"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <span className="text-lg font-medium">
            {report.user.name.charAt(0).toUpperCase()}
          </span>
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{report.user.name}</h1>
          <p className="text-muted-foreground text-sm">@{report.user.username}</p>
        </div>
      </div>

      {/* Stat cards — last 30 days + current workload */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <ListTodo className="h-3.5 w-3.5 text-blue-500" /> Open Tasks
            </CardDescription>
            <CardTitle className="text-3xl text-blue-600">{report.openTasks.length}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            across {new Set(report.openTasks.map((t) => t.projectName)).size} repos
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <Code2 className="h-3.5 w-3.5 text-emerald-600" /> Commits
            </CardDescription>
            <CardTitle className="text-3xl text-emerald-700">{report.summary.commits}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">last {PERIOD_DAYS} days</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <GitMerge className="h-3.5 w-3.5 text-teal-600" /> MRs Merged
            </CardDescription>
            <CardTitle className="text-3xl text-teal-700">{report.summary.mrsMerged}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">last {PERIOD_DAYS} days</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> Issues Closed
            </CardDescription>
            <CardTitle className="text-3xl text-green-600">{report.summary.issuesClosed}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">last {PERIOD_DAYS} days</CardContent>
        </Card>
      </div>

      {/* Weekly shipping trend */}
      {myTrend && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Gauge className="h-4 w-4 text-orange-500" /> Shipping Trend
            </CardTitle>
            <CardDescription>Commits (green) and merged MRs (teal) · last 12 weeks</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-1.5 h-28">
              {myTrend.commits.map((c, i) => {
                const m = myTrend.mrsMerged[i];
                return (
                  <div key={i} className="flex-1 flex flex-col justify-end min-h-[2px]" title={`${c} commits, ${m} MRs`}>
                    {m > 0 && <div className="w-full bg-teal-600" style={{ height: `${(m / maxWeekly) * 100}%` }} />}
                    {c > 0 && <div className="w-full bg-emerald-500" style={{ height: `${(c / maxWeekly) * 100}%` }} />}
                    {c + m === 0 && <div className="w-full h-0.5 bg-muted" />}
                  </div>
                );
              })}
            </div>
            <div className="flex gap-1.5 mt-1">
              {(trend?.weeks || []).map((w) => (
                <span key={w.weekStart} className="flex-1 text-[9px] text-muted-foreground text-center">
                  {new Date(w.weekStart).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Open tasks by stage */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Open Tasks Across All Projects</CardTitle>
          <CardDescription>Authored or assigned · grouped by board stage</CardDescription>
        </CardHeader>
        <CardContent>
          {tasksByStage.length === 0 ? (
            <p className="text-muted-foreground text-sm">No open tasks right now.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {tasksByStage.map((group) => (
                <div
                  key={group.stage}
                  className={`rounded-lg border p-2.5 ${STAGE_BADGE_CLASS[group.stage] || "border-border"}`}
                >
                  <p className="text-xs font-semibold mb-1.5">
                    {group.stage} ({group.items.length})
                  </p>
                  <div className="space-y-1">
                    {group.items.map((t) => (
                      <div
                        key={`${t.gitlabProjectId}-${t.issueIid}`}
                        className="flex items-center gap-1.5 text-sm min-w-0"
                      >
                        <span className="text-muted-foreground shrink-0 text-xs">#{t.issueIid}</span>
                        <span className="truncate">{t.issueTitle}</span>
                        <span className="text-[10px] text-muted-foreground shrink-0 truncate max-w-[100px]">
                          {t.projectName}
                        </span>
                        {t.issueUrl && (
                          <a
                            href={t.issueUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-muted-foreground hover:text-foreground shrink-0"
                          >
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Authored open issues (not assigned to this person) */}
      {(report.authoredOpenIssues || []).length > 0 && (() => {
        const authored = report.authoredOpenIssues;
        const authGroups: Array<{ stage: string; items: typeof authored }> = [];
        for (const stage of WORKFLOW_STAGES) {
          const items = authored.filter((t) => t.boardStage === stage);
          if (items.length > 0) authGroups.push({ stage, items });
        }
        const authMatched = new Set(authGroups.flatMap((g) => g.items.map((t) => `${t.gitlabProjectId}-${t.issueIid}`)));
        const authUnmatched = authored.filter((t) => !authMatched.has(`${t.gitlabProjectId}-${t.issueIid}`));
        if (authUnmatched.length > 0) authGroups.push({ stage: "Opened", items: authUnmatched });

        return (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Authored Open Issues ({authored.length})</CardTitle>
              <CardDescription>Created but not assigned to you · grouped by board stage</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {authGroups.map((group) => (
                  <div
                    key={`auth-${group.stage}`}
                    className={`rounded-lg border p-2.5 ${STAGE_BADGE_CLASS[group.stage] || "border-border"}`}
                  >
                    <p className="text-xs font-semibold mb-1.5">
                      {group.stage} ({group.items.length})
                    </p>
                    <div className="space-y-1">
                      {group.items.map((t) => (
                        <div
                          key={`auth-${t.gitlabProjectId}-${t.issueIid}`}
                          className="flex items-center gap-1.5 text-sm min-w-0"
                        >
                          <span className="text-muted-foreground shrink-0 text-xs">#{t.issueIid}</span>
                          <span className="truncate">{t.issueTitle}</span>
                          <span className="text-[10px] text-muted-foreground shrink-0 truncate max-w-[100px]">
                            {t.projectName}
                          </span>
                          {t.issueUrl && (
                            <a
                              href={t.issueUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-muted-foreground hover:text-foreground shrink-0"
                            >
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* Daily activity + period lists */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarDays className="h-4 w-4 text-muted-foreground" /> Daily Activity
            </CardTitle>
            <CardDescription>Events per day · last {PERIOD_DAYS} days</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-1 h-24">
              {(report.dailyActivity || []).map((d) => (
                <div
                  key={d.date}
                  className="flex-1 bg-blue-500/80 rounded-t min-h-[2px]"
                  style={{ height: `${(d.events / maxDaily) * 100}%` }}
                  title={`${d.date}: ${d.events} events`}
                />
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Closed ({report.closedIssues.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <RefList items={report.closedIssues} empty="Nothing closed" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Created ({report.createdIssues.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <RefList items={report.createdIssues} empty="Nothing created" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function RefList({ items, empty }: { items: ItemRef[]; empty: string }) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="space-y-1 max-h-56 overflow-y-auto pr-1">
      {items.map((item, i) => (
        <div key={`${item.itemIid}-${i}`} className="flex items-center gap-2 text-sm min-w-0">
          <Badge variant="outline" className="text-[10px] shrink-0">
            #{item.itemIid}
          </Badge>
          <span className="truncate">{item.itemTitle || "Untitled"}</span>
          {item.projectName && (
            <span className="text-[10px] text-muted-foreground shrink-0 truncate max-w-[100px]">
              {item.projectName}
            </span>
          )}
          {item.itemUrl && (
            <a
              href={item.itemUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground shrink-0"
            >
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      ))}
    </div>
  );
}
