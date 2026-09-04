"use client";

import { useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { WORKFLOW_STAGES, getStageProgress, type ReviewIssue } from "./review/types";
import { Progress } from "@/components/ui/progress";
import {
  ExternalLink,
  Clock,
  MessageSquare,
  Users,
  Calendar,
  GitBranch,
  Flag,
  UsersRound,
  Tag,
  FolderGit2,
  TrendingUp,
  Hammer,
  FlaskConical,
  Link2,
} from "lucide-react";

interface IssueDetailViewProps {
  issue: ReviewIssue;
  onBack: () => void;
}

const STAGE_COLORS: Record<string, string> = {
  Backlog: "bg-gray-500",
  Refinement: "bg-slate-500",
  "Ready for Dev": "bg-cyan-500",
  "In Progress": "bg-blue-500",
  "Peer Review": "bg-yellow-500",
  "Testing/QA": "bg-orange-500",
  Completed: "bg-lime-500",
  Done: "bg-green-600",
};

export function IssueDetailView({
  issue,
  onBack,
}: IssueDetailViewProps) {
  const formatHours = (hours: number | null): string => {
    if (hours === null) return "N/A";
    if (hours < 24) return `${Math.round(hours)}h`;
    const days = Math.floor(hours / 24);
    const rem = Math.round(hours % 24);
    return rem > 0 ? `${days}d ${rem}h` : `${days}d`;
  };

  const formatDate = (date: string | null): string =>
    date ? new Date(date).toLocaleString() : "N/A";

  const ageHours = Math.floor(
    (Date.now() - new Date(issue.createdAt).getTime()) / 3_600_000
  );

  const stageDurationHours = issue.stageEnteredAt
    ? Math.floor((Date.now() - new Date(issue.stageEnteredAt).getTime()) / 3_600_000)
    : ageHours;

  const commenterCount = issue.uniqueCommenters
    ? issue.uniqueCommenters.split(",").filter((c) => c.trim()).length
    : 0;

  const formatWeight = (hours: number): string => {
    if (hours < 8) return `${hours}h`;
    const days = hours / 8;
    return `${Math.round(days * 10) / 10}d`;
  };

  const getWeightColor = (hours: number): string => {
    if (hours <= 8) return "text-green-600";      // 🟢 Up to 1 day
    if (hours <= 24) return "text-yellow-600";     // 🟡 1-3 days
    if (hours <= 40) return "text-orange-600";     // 🟠 3-5 days
    return "text-red-600";                          // 🔴 1+ weeks
  };

  // Collect all people involved: author, assignees, commenters, task assignees, linked issue assignees
  const linkedAssignees = useMemo(() => {
    const set = new Set<string>();
    for (const child of issue.linkedIssues) {
      if (child.assigneeUsernames) {
        for (const a of child.assigneeUsernames.split(",")) {
          const t = a.trim();
          if (t) set.add(t);
        }
      }
    }
    return Array.from(set);
  }, [issue.linkedIssues]);

  // People who performed any tracked action (create, close, comment, commit)
  const activityActors = useMemo(() => {
    if (!issue.activityActors) return [];
    return issue.activityActors.split(",").map((a) => a.trim()).filter(Boolean);
  }, [issue.activityActors]);

  // Rollup across linked child issues: closed ratio + average known progress
  const linkedRollupLabel = (() => {
    const total = issue.linkedIssues.length;
    const closed = issue.linkedIssues.filter((c) => c.state === "closed").length;
    const progressValues = issue.linkedIssues.flatMap((c) =>
      [c.devProgress, c.qaProgress].filter((v): v is number => v !== null)
    );
    const avg =
      progressValues.length > 0
        ? Math.round(progressValues.reduce((a, b) => a + b, 0) / progressValues.length)
        : null;
    return `${closed}/${total} closed${avg !== null ? ` · avg progress ${avg}%` : ""}`;
  })();

  // Aggregate progress across linked child issues
  const linkedDevValues = issue.linkedIssues
    .map((c) => c.devProgress)
    .filter((v): v is number => v !== null);
  const linkedQaValues = issue.linkedIssues
    .map((c) => c.qaProgress)
    .filter((v): v is number => v !== null);
  const linkedAvgDev = linkedDevValues.length > 0
    ? Math.round(linkedDevValues.reduce((a, b) => a + b, 0) / linkedDevValues.length)
    : null;
  const linkedAvgQa = linkedQaValues.length > 0
    ? Math.round(linkedQaValues.reduce((a, b) => a + b, 0) / linkedQaValues.length)
    : null;
  const linkedDevComplete = linkedDevValues.filter((v) => v === 100).length;
  const linkedQaComplete = linkedQaValues.filter((v) => v === 100).length;
  const linkedOpenCount = issue.linkedIssues.filter((c) => c.state !== "closed").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Button variant="ghost" size="sm" onClick={onBack} className="mb-2 -ml-2">
          ← Back to tracker
        </Button>
        <div className="flex items-start gap-3 flex-wrap">
          <span className="text-muted-foreground font-mono text-lg mt-0.5">
            #{issue.issueIid}
          </span>
          <h2 className="text-2xl font-bold leading-tight flex-1 min-w-[200px]">
            {issue.issueTitle || `Issue #${issue.issueIid}`}
          </h2>
          {issue.issueUrl && (
            <a href={issue.issueUrl} target="_blank" rel="noopener noreferrer" className="shrink-0">
              <Button variant="outline" size="sm">
                Open in GitLab
                <ExternalLink className="h-3.5 w-3.5 ml-2" />
              </Button>
            </a>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-3">
          <Badge variant={issue.state === "open" ? "default" : "secondary"}>
            {issue.state}
          </Badge>
          <Badge variant="outline" className="gap-1">
            <FolderGit2 className="h-3 w-3" />
            {issue.projectName || `Project ${issue.gitlabProjectId}`}
          </Badge>
          <Badge variant="outline" className="gap-1">
            <UsersRound className="h-3 w-3" />
            {issue.authorName} (@{issue.authorUsername})
          </Badge>
          {issue.priority && (
            <Badge variant={issue.priority === "P0" ? "destructive" : "secondary"} className="gap-1">
              <Flag className="h-3 w-3" />
              {issue.priority}
            </Badge>
          )}
          {issue.weight && (
            <Badge variant="outline" className={`gap-1 ${getWeightColor(issue.weight)}`}>
              {formatWeight(issue.weight)}
            </Badge>
          )}
          {issue.team && (
            <Badge variant="outline" className="gap-1">
              <UsersRound className="h-3 w-3" />
              {issue.team}
            </Badge>
          )}
          {issue.type && (
            <Badge variant="outline" className="gap-1">
              <Tag className="h-3 w-3" />
              {issue.type}
            </Badge>
          )}
        </div>
      </div>

      {/* Workflow position stepper */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <GitBranch className="h-4 w-4" />
            Where it sits on the board
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-1 overflow-x-auto pt-2 pb-1">
            {WORKFLOW_STAGES.map((stage, idx) => {
              const currentIdx = WORKFLOW_STAGES.indexOf(
                issue.boardStage as (typeof WORKFLOW_STAGES)[number]
              );
              const isDone = issue.state === "closed";
              const isCurrent = !isDone && stage === issue.boardStage;
              const isPassed = isDone || (currentIdx >= 0 && idx < currentIdx);

              return (
                <div key={stage} className="flex items-center gap-1 flex-1 min-w-fit">
                  <div className="flex flex-col items-center gap-1 min-w-[70px]">
                    <div
                      className={`w-3.5 h-3.5 rounded-full ${
                        isDone
                          ? "bg-green-600"
                          : isCurrent
                            ? `${STAGE_COLORS[stage]} ring-4 ring-primary/20`
                            : isPassed
                              ? `${STAGE_COLORS[stage]} opacity-60`
                              : "bg-muted border border-border"
                      }`}
                    />
                    <span
                      className={`text-[10px] text-center leading-tight ${
                        isCurrent ? "font-bold text-foreground" : "text-muted-foreground"
                      }`}
                    >
                      {stage}
                    </span>
                  </div>
                  {idx < WORKFLOW_STAGES.length - 1 && (
                    <div
                      className={`h-px flex-1 min-w-[8px] ${
                        isPassed || isDone ? "bg-primary/40" : "bg-border"
                      }`}
                    />
                  )}
                </div>
              );
            })}
          </div>
          {issue.state === "open" && (
            <p className="text-sm text-muted-foreground mt-3">
              Currently in{" "}
              <strong className="text-foreground">{issue.boardStage}</strong> for{" "}
              {formatHours(stageDurationHours)}
              {issue.boardStage === "In Progress" && " — actively being worked on"}
              {issue.boardStage === "Peer Review" && " — waiting on reviewers"}
              {issue.boardStage === "Testing/QA" && " — waiting on QA validation"}
            </p>
          )}

          {/* Pipeline progression */}
          {(() => {
            const pct = getStageProgress(issue.boardStage);
            if (pct === null) return null;
            return (
              <div className="flex items-center gap-3 mt-4">
                <Progress
                  value={pct}
                  className={`h-2.5 flex-1 ${pct === 100 ? "[&>div]:bg-green-600" : ""}`}
                />
                <span
                  className={`text-sm font-semibold shrink-0 ${
                    pct === 100 ? "text-green-600" : ""
                  }`}
                >
                  ~{pct}% through the workflow
                </span>
              </div>
            );
          })()}
        </CardContent>
      </Card>

      {/* Work progress (set via GitLab comment commands) */}
      {(() => {
        const devRelevant =
          issue.devProgress !== null ||
          ["In Progress", "Peer Review", "Testing/QA", "Completed"].includes(issue.boardStage);
        const qaRelevant =
          issue.qaProgress !== null ||
          ["Testing/QA", "Completed"].includes(issue.boardStage);
        if (!devRelevant && !qaRelevant) return null;
        return (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Hammer className="h-4 w-4" />
                Work Progress
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {devRelevant && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="flex items-center gap-1.5 text-sm font-medium">
                      <Hammer className="h-3.5 w-3.5 text-blue-500" />
                      Development
                    </span>
                    <span
                      className={`text-sm font-semibold ${
                        issue.devProgress === 100 ? "text-green-600" : ""
                      }`}
                    >
                      {issue.devProgress !== null ? `${issue.devProgress}%` : "Not set"}
                    </span>
                  </div>
                  {issue.devProgress !== null && (
                    <Progress
                      value={issue.devProgress}
                      className={`h-2 ${issue.devProgress === 100 ? "[&>div]:bg-green-600" : ""}`}
                    />
                  )}
                </div>
              )}
              {qaRelevant && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="flex items-center gap-1.5 text-sm font-medium">
                      <FlaskConical className="h-3.5 w-3.5 text-orange-500" />
                      QA / Testing
                    </span>
                    <span
                      className={`text-sm font-semibold ${
                        issue.qaProgress === 100 ? "text-green-600" : ""
                      }`}
                    >
                      {issue.qaProgress !== null ? `${issue.qaProgress}%` : "Not set"}
                    </span>
                  </div>
                  {issue.qaProgress !== null && (
                    <Progress
                      value={issue.qaProgress}
                      className={`h-2 ${issue.qaProgress === 100 ? "[&>div]:bg-green-600" : ""}`}
                    />
                  )}
                </div>
              )}
              <p className="text-xs text-muted-foreground pt-1 border-t border-border">
                Updated via GitLab comments: developers comment{" "}
                <code className="px-1 py-0.5 rounded bg-muted">/dev 60</code>, QA comments{" "}
                <code className="px-1 py-0.5 rounded bg-muted">/test 30</code> or{" "}
                <code className="px-1 py-0.5 rounded bg-muted">/uat 35%</code>, then sync.
              </p>
            </CardContent>
          </Card>
        );
      })()}

      {/* Aggregate work progress from linked child issues */}
      {issue.linkedIssues.length > 0 && (linkedAvgDev !== null || linkedAvgQa !== null) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4" />
              Work Progress
            </CardTitle>
            <CardDescription>
              Aggregate progress across {issue.linkedIssues.length} linked child issue{issue.linkedIssues.length !== 1 ? "s" : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {linkedAvgDev !== null && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    <Hammer className="h-3.5 w-3.5 text-blue-500" />
                    Development
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {linkedDevComplete}/{linkedDevValues.length} complete · avg {linkedAvgDev}%
                  </span>
                </div>
                <Progress
                  value={linkedAvgDev}
                  className={`h-2 ${linkedAvgDev === 100 ? "[&>div]:bg-green-600" : ""}`}
                />
              </div>
            )}
            {linkedAvgQa !== null && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    <FlaskConical className="h-3.5 w-3.5 text-orange-500" />
                    QA / Testing
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {linkedQaComplete}/{linkedQaValues.length} complete · avg {linkedAvgQa}%
                  </span>
                </div>
                <Progress
                  value={linkedAvgQa}
                  className={`h-2 ${linkedAvgQa === 100 ? "[&>div]:bg-green-600" : ""}`}
                />
              </div>
            )}
            {linkedOpenCount > 0 && (
              <p className="text-xs text-muted-foreground">
                {linkedOpenCount} child issue{linkedOpenCount !== 1 ? "s" : ""} still open
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Linked child issues from other projects */}
      {issue.linkedIssues.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Link2 className="h-4 w-4" />
              Linked Issues
            </CardTitle>
            <CardDescription>{linkedRollupLabel}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {issue.linkedIssues.map((child) => {
              const closed = child.state === "closed";
              return (
                <div
                  key={`${child.gitlabProjectId}#${child.issueIid}`}
                  className="flex items-center gap-3 rounded-lg border p-2.5"
                >
                  <Badge variant={closed ? "secondary" : "outline"} className="text-xs shrink-0">
                    {closed ? "closed" : child.state === "unknown" ? "?" : "open"}
                  </Badge>
                  {child.weight && (
                    <span className={`text-xs font-medium shrink-0 ${getWeightColor(child.weight)}`}>
                      {formatWeight(child.weight)}
                    </span>
                  )}
                  <span className="font-mono text-xs text-muted-foreground shrink-0">
                    #{child.issueIid}
                  </span>
                  {child.issueUrl ? (
                    <a
                      href={child.issueUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm truncate flex-1 hover:underline"
                    >
                      {child.title || `Issue #${child.issueIid}`}
                    </a>
                  ) : (
                    <span className="text-sm truncate flex-1">
                      {child.title || `Issue #${child.issueIid}`}
                    </span>
                  )}
                  {child.assigneeUsernames && (
                    <span className="text-xs text-muted-foreground shrink-0">
                      @{child.assigneeUsernames.split(",")[0].trim()}
                    </span>
                  )}
                  <div className="flex items-center gap-3 shrink-0">
                    {child.devProgress !== null && (
                      <div className="flex items-center gap-1.5">
                        <Hammer className="h-3 w-3 text-blue-500 shrink-0" />
                        <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${child.devProgress === 100 ? "bg-green-600" : "bg-blue-500"}`}
                            style={{ width: `${child.devProgress}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground w-7 text-right">{child.devProgress}%</span>
                      </div>
                    )}
                    {child.qaProgress !== null && (
                      <div className="flex items-center gap-1.5">
                        <FlaskConical className="h-3 w-3 text-orange-500 shrink-0" />
                        <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${child.qaProgress === 100 ? "bg-green-600" : "bg-orange-500"}`}
                            style={{ width: `${child.qaProgress}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground w-7 text-right">{child.qaProgress}%</span>
                      </div>
                    )}
                    {child.devProgress === null && child.qaProgress === null && (
                      <span className="text-xs text-muted-foreground">No progress set</span>
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Key metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-5">
            <Clock className="h-4 w-4 text-blue-500" />
            <div className="text-xl font-bold mt-1">
              {formatHours(issue.timeToFirstResponseHours)}
            </div>
            <p className="text-xs text-muted-foreground">First Response</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <Clock className="h-4 w-4 text-green-600" />
            <div className="text-xl font-bold mt-1">
              {issue.state === "closed"
                ? formatHours(issue.timeToCloseHours)
                : formatHours(ageHours)}
            </div>
            <p className="text-xs text-muted-foreground">
              {issue.state === "closed" ? "Cycle Time" : "Age (open)"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <MessageSquare className="h-4 w-4 text-purple-500" />
            <div className="text-xl font-bold mt-1">{issue.commentCount || 0}</div>
            <p className="text-xs text-muted-foreground">Comments</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <Users className="h-4 w-4 text-orange-500" />
            <div className="text-xl font-bold mt-1">{commenterCount}</div>
            <p className="text-xs text-muted-foreground">Collaborators</p>
          </CardContent>
        </Card>
      </div>

      {/* Timeline + Comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Calendar className="h-4 w-4" />
              Timeline
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-3 h-3 rounded-full bg-blue-500 shrink-0" />
                <div>
                  <div className="font-medium text-sm">Created</div>
                  <div className="text-xs text-muted-foreground">
                    {formatDate(issue.createdAt)}
                  </div>
                </div>
              </div>
              {issue.firstResponseAt && (
                <div className="flex items-center gap-4">
                  <div className="w-3 h-3 rounded-full bg-yellow-500 shrink-0" />
                  <div>
                    <div className="font-medium text-sm">First Response</div>
                    <div className="text-xs text-muted-foreground">
                      {formatDate(issue.firstResponseAt)} · after{" "}
                      {formatHours(issue.timeToFirstResponseHours)}
                    </div>
                  </div>
                </div>
              )}
              {issue.closedAt ? (
                <div className="flex items-center gap-4">
                  <div className="w-3 h-3 rounded-full bg-green-600 shrink-0" />
                  <div>
                    <div className="font-medium text-sm">Closed</div>
                    <div className="text-xs text-muted-foreground">
                      {formatDate(issue.closedAt)} · {formatHours(issue.timeToCloseHours)} total
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-4">
                  <div className="w-3 h-3 rounded-full bg-orange-500 animate-pulse shrink-0" />
                  <div>
                    <div className="font-medium text-sm">Still open</div>
                    <div className="text-xs text-muted-foreground">
                      {formatHours(ageHours)} and counting
                    </div>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* People Involved */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4" />
            People Involved
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {/* Author */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10">
              <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center">
                <span className="text-xs font-medium">
                  {issue.authorName.charAt(0).toUpperCase()}
                </span>
              </div>
              <span className="text-sm font-medium">{issue.authorName}</span>
              <Badge variant="secondary" className="text-[10px]">
                author
              </Badge>
            </div>
            {/* Assignees */}
            {issue.assigneeUsernames &&
              issue.assigneeUsernames
                .split(",")
                .map((a) => a.trim())
                .filter(Boolean)
                .filter((a) => a !== issue.authorUsername)
                .map((assignee, i) => (
                  <div key={`assignee-${i}`} className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 border border-blue-200">
                    <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center">
                      <span className="text-xs font-medium">
                        {assignee.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <span className="text-sm">@{assignee}</span>
                    <Badge variant="secondary" className="text-[10px] bg-blue-100 text-blue-700">
                      assignee
                    </Badge>
                  </div>
                ))}
            {/* Commenters */}
            {issue.uniqueCommenters &&
              issue.uniqueCommenters
                .split(",")
                .filter((c) => c.trim() && c.trim() !== issue.authorUsername)
                .filter((c) => {
                  // Don't duplicate assignees
                  const assignees = (issue.assigneeUsernames || "").split(",").map((a) => a.trim());
                  return !assignees.includes(c.trim());
                })
                .map((commenter, i) => (
                  <div key={`commenter-${i}`} className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted">
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="text-xs font-medium">
                        {commenter.trim().charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <span className="text-sm">@{commenter.trim()}</span>
                    <Badge variant="outline" className="text-[10px]">
                      commenter
                    </Badge>
                  </div>
                ))}
            {/* Task assignees from checklist items */}
            {issue.taskAssignees &&
              issue.taskAssignees
                .filter((a) => {
                  // Don't duplicate author, assignees, or commenters
                  const assignees = (issue.assigneeUsernames || "").split(",").map((u) => u.trim());
                  const commenters = (issue.uniqueCommenters || "").split(",").map((u) => u.trim());
                  return a !== issue.authorUsername && !assignees.includes(a) && !commenters.includes(a);
                })
                .map((taskUser, i) => (
                  <div key={`task-${i}`} className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-purple-50 border border-purple-200">
                    <div className="w-6 h-6 rounded-full bg-purple-100 flex items-center justify-center">
                      <span className="text-xs font-medium">
                        {taskUser.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <span className="text-sm">@{taskUser}</span>
                    <Badge variant="secondary" className="text-[10px] bg-purple-100 text-purple-700">
                      task assignee
                    </Badge>
                  </div>
                ))}
            {/* Linked issue assignees */}
            {linkedAssignees
              .filter((a) => {
                const assignees = (issue.assigneeUsernames || "").split(",").map((u) => u.trim());
                const commenters = (issue.uniqueCommenters || "").split(",").map((u) => u.trim());
                const tasks = issue.taskAssignees || [];
                return a !== issue.authorUsername && !assignees.includes(a) && !commenters.includes(a) && !tasks.includes(a);
              })
              .map((childAssignee, i) => (
                <div key={`child-${i}`} className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-50 border border-amber-200">
                  <div className="w-6 h-6 rounded-full bg-amber-100 flex items-center justify-center">
                    <span className="text-xs font-medium">
                      {childAssignee.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <span className="text-sm">@{childAssignee}</span>
                  <Badge variant="secondary" className="text-[10px] bg-amber-100 text-amber-700">
                    child assignee
                  </Badge>
                </div>
              ))}
            {/* Activity actors (created, closed, commented, committed) */}
            {activityActors
              .filter((a) => {
                const assignees = (issue.assigneeUsernames || "").split(",").map((u) => u.trim());
                const commenters = (issue.uniqueCommenters || "").split(",").map((u) => u.trim());
                const tasks = issue.taskAssignees || [];
                return a !== issue.authorUsername && !assignees.includes(a) && !commenters.includes(a) && !tasks.includes(a) && !linkedAssignees.includes(a);
              })
              .map((actor, i) => (
                <div key={`actor-${i}`} className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-teal-50 border border-teal-200">
                  <div className="w-6 h-6 rounded-full bg-teal-100 flex items-center justify-center">
                    <span className="text-xs font-medium">
                      {actor.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <span className="text-sm">@{actor}</span>
                  <Badge variant="secondary" className="text-[10px] bg-teal-100 text-teal-700">
                    contributor
                  </Badge>
                </div>
              ))}
          </div>
        </CardContent>
      </Card>

      {/* Labels */}
      {issue.labels && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Tag className="h-4 w-4" />
              All Labels
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {issue.labels
                .split(",")
                .filter((l) => l.trim())
                .map((label, i) => (
                  <Badge key={i} variant="outline">
                    {label.trim()}
                  </Badge>
                ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
