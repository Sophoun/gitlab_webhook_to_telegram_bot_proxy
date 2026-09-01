"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { WORKFLOW_STAGES, STAGE_BADGE_CLASS } from "./types";

const STALE_DAYS = 14;

interface OpenTask {
  gitlabProjectId: number;
  issueIid: number;
  issueTitle: string | null;
  issueUrl: string | null;
  projectName: string;
  boardStage: string;
  isAssignee: boolean;
  createdAt: string | null;
}

interface AssignedTask {
  gitlabProjectId: number;
  issueIid: number;
  taskText: string;
  isCompleted: boolean;
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
  openTasks: OpenTask[];
  assignedTasks: AssignedTask[];
}

/** Lookback window for the activity summary (days) */
const PERIOD_DAYS = 30;

function isoDaysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getPerformanceSummary(
  name: string,
  openCount: number,
  closedCount: number,
  commits: number,
  mrs: number,
): string {
  const parts: string[] = [];
  parts.push(`${name} has ${openCount} open issue${openCount !== 1 ? "s" : ""} assigned.`);
  if (closedCount > 0) parts.push(`Resolved ${closedCount} issues in the last 30 days.`);
  if (commits > 0 || mrs > 0) {
    const codeParts: string[] = [];
    if (mrs > 0) codeParts.push(`${mrs} MR${mrs !== 1 ? "s" : ""} merged`);
    if (commits > 0) codeParts.push(`${commits} commit${commits !== 1 ? "s" : ""}`);
    parts.push(`Code output: ${codeParts.join(" and ")}.`);
  }
  if (closedCount === 0 && commits === 0 && mrs === 0) {
    parts.push("No activity recorded in the last 30 days.");
  }
  return parts.join(" ");
}

/**
 * Person profile — simplified for HR: name, summary, and open tasks by stage.
 */
export function PersonProfile({ username }: { username: string }) {
  const router = useRouter();
  const [report, setReport] = useState<PersonReportData | null>(null);
  const [loading, setLoading] = useState(true);

  const from = isoDaysAgo(PERIOD_DAYS);
  const to = new Date();

  const fetchAll = useCallback(async () => {
    try {
      const reportQs = `from=${from.toISOString()}&to=${to.toISOString()}`;
      const reportRes = await fetch(
        `/api/tracker/person-report?user=${encodeURIComponent(username)}&${reportQs}`,
      );
      const reportData = await reportRes.json();
      if (!reportRes.ok || reportData.error) {
        setReport(null);
      } else {
        setReport(reportData);
      }
    } catch (error) {
      console.error("Failed to fetch person profile:", error);
      setReport(null);
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
        <Button variant="outline" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back
        </Button>
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No data found for @{username}. Try syncing first.
          </CardContent>
        </Card>
      </div>
    );
  }

  const summary = getPerformanceSummary(
    report.user.name,
    report.openTasks.length,
    report.summary.issuesClosed,
    report.summary.commits,
    report.summary.mrsMerged,
  );

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="outline"
          size="icon"
          onClick={() => router.back()}
          aria-label="Go back"
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

      {/* Summary */}
      <p className="text-sm text-muted-foreground leading-relaxed">{summary}</p>

      {/* Stage summary strip */}
      {report.openTasks.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {tasksByStage.map((g) => (
            <span
              key={g.stage}
              className={`inline-flex items-center rounded border px-2 py-1 text-xs font-medium ${STAGE_BADGE_CLASS[g.stage] || "border-border text-muted-foreground"}`}
            >
              {g.items.length}× {g.stage}
            </span>
          ))}
        </div>
      )}

      {/* Workload by project */}
      {report.openTasks.length > 0 && (() => {
        const byProject = new Map<string, number>();
        for (const t of report.openTasks) {
          byProject.set(t.projectName, (byProject.get(t.projectName) || 0) + 1);
        }
        const sorted = [...byProject.entries()].sort((a, b) => b[1] - a[1]);
        return (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Workload by Project</CardTitle>
              <CardDescription>Where their open issues are</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {sorted.map(([project, count]) => (
                  <div key={project} className="flex items-center gap-3">
                    <span className="text-sm truncate min-w-0 flex-1">{project}</span>
                    <div className="flex-1 max-w-[200px] bg-muted rounded-full h-2 overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full"
                        style={{ width: `${(count / report.openTasks.length) * 100}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium w-8 text-right">{count}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* Stale issues alert */}
      {(() => {
        const now = new Date();
        const stale = report.openTasks.filter((t) => {
          if (!t.createdAt) return false;
          const created = new Date(t.createdAt);
          const days = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
          return days >= STALE_DAYS;
        });
        if (stale.length === 0) return null;
        return (
          <Card className="border-orange-200 bg-orange-50/50">
            <CardHeader>
              <CardTitle className="text-base text-orange-700">
                ⚠ {stale.length} Stale Issue{stale.length !== 1 ? "s" : ""}
              </CardTitle>
              <CardDescription className="text-orange-600">
                Open for more than {STALE_DAYS} days — may need attention
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {stale.map((t) => {
                  const days = Math.floor(
                    (now.getTime() - new Date(t.createdAt!).getTime()) / (1000 * 60 * 60 * 24),
                  );
                  return (
                    <div key={`${t.gitlabProjectId}-${t.issueIid}`} className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground text-xs">#{t.issueIid}</span>
                      <span className="truncate flex-1">{t.issueTitle}</span>
                      <span className="text-orange-600 text-xs shrink-0">{days}d</span>
                      <span className="text-[10px] text-muted-foreground shrink-0">{t.projectName}</span>
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
                  );
                })}
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* Assigned checklist tasks */}
      {report.assignedTasks && report.assignedTasks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Assigned Tasks ({report.assignedTasks.filter((t) => !t.isCompleted).length} open / {report.assignedTasks.length} total)
            </CardTitle>
            <CardDescription>Checklist items assigned to this person in issue descriptions</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {report.assignedTasks.map((task, i) => (
                <div
                  key={`${task.gitlabProjectId}-${task.issueIid}-${i}`}
                  className="flex items-center gap-2 text-sm"
                >
                  <span className={`shrink-0 ${task.isCompleted ? "text-green-600" : "text-muted-foreground"}`}>
                    {task.isCompleted ? "☑" : "☐"}
                  </span>
                  <span className={task.isCompleted ? "line-through text-muted-foreground" : ""}>
                    {task.taskText}
                  </span>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    #{task.issueIid}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Open tasks by stage */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Open Tasks Across All Projects</CardTitle>
          <CardDescription>Grouped by board stage</CardDescription>
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
    </div>
  );
}
