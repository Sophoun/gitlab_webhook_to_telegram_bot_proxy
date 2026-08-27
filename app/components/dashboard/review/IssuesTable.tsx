"use client";

import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ExternalLink, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { WORKFLOW_STAGES, getStageProgress, type ReviewIssue } from "./types";
import { Progress } from "@/components/ui/progress";

function SortHead({
  field,
  onSort,
  children,
}: {
  field: string;
  onSort: (field: string) => void;
  children: React.ReactNode;
}) {
  return (
    <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => onSort(field)}>
      {children}
      <ArrowUpDown className="ml-1 h-3 w-3" />
    </Button>
  );
}

interface IssuesTableProps {
  issues: ReviewIssue[];
  initialSortBy?: string;
  onSelectIssue: (issue: ReviewIssue) => void;
}

const PAGE_SIZE = 15;
const STAGE_ORDER = new Map<string, number>(
  WORKFLOW_STAGES.map((s, i) => [s, i])
);

function ageInDays(createdAt: string): number {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 86_400_000);
}

function filteredByStatusOnly(issues: ReviewIssue[], status: string): ReviewIssue[] {
  return status === "all" ? issues : issues.filter((i) => i.state === status);
}

export function IssuesTable({ issues, initialSortBy, onSelectIssue }: IssuesTableProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"open" | "closed" | "all">("open");
  const [stageFilter, setStageFilter] = useState<string>("All");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("All");
  const [priorityFilter, setPriorityFilter] = useState<string>("All");
  const [teamFilter, setTeamFilter] = useState<string>("All");
  const [sortBy, setSortBy] = useState(initialSortBy || "stage");
  const [sortAsc, setSortAsc] = useState(true);
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return issues.filter((i) => {
      if (statusFilter !== "all" && i.state !== statusFilter) return false;
      if (stageFilter !== "All" && i.boardStage !== stageFilter) return false;
      if (priorityFilter !== "All" && (i.priority || "") !== priorityFilter) return false;
      if (teamFilter !== "All" && (i.team || "") !== teamFilter) return false;
      if (assigneeFilter !== "All") {
        const people = [i.authorUsername, ...(i.assigneeUsernames || "").split(",").map((a) => a.trim())];
        if (!people.includes(assigneeFilter)) return false;
      }
      if (!q) return true;
      return (
        (i.issueTitle || "").toLowerCase().includes(q) ||
        i.authorName.toLowerCase().includes(q) ||
        i.authorUsername.toLowerCase().includes(q) ||
        `#${i.issueIid}`.includes(q)
      );
    });
  }, [issues, search, statusFilter, stageFilter, assigneeFilter, priorityFilter, teamFilter]);

  // Facet options derived from the loaded issues
  const assigneeOptions = useMemo(() => {
    const names = new Map<string, string>(); // username -> display name
    for (const i of issues) {
      if (i.authorUsername && !names.has(i.authorUsername)) {
        names.set(i.authorUsername, i.authorName);
      }
      for (const a of (i.assigneeUsernames || "").split(",")) {
        const t = a.trim();
        if (t && !names.has(t)) names.set(t, t);
      }
    }
    return Array.from(names.entries())
      .map(([username, name]) => ({ username, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [issues]);

  const priorityOptions = useMemo(() => {
    const set = new Set<string>();
    for (const i of issues) if (i.priority) set.add(i.priority);
    return Array.from(set).sort();
  }, [issues]);

  const teamOptions = useMemo(() => {
    const set = new Set<string>();
    for (const i of issues) if (i.team) set.add(i.team);
    return Array.from(set).sort();
  }, [issues]);

  // Stage chips reflect counts within the current status filter
  const stageChips = useMemo(() => {
    const counts = new Map<string, number>();
    for (const i of filteredByStatusOnly(issues, statusFilter)) {
      counts.set(i.boardStage, (counts.get(i.boardStage) || 0) + 1);
    }
    const stages = [
      ...WORKFLOW_STAGES.filter((s) => (counts.get(s) || 0) > 0).map((s) => ({
        stage: s as string,
        count: counts.get(s)!,
      })),
    ];
    // Fallback stages at the bottom
    for (const fallback of ["Opened", "Closed"]) {
      if ((counts.get(fallback) || 0) > 0) {
        stages.push({ stage: fallback, count: counts.get(fallback)! });
      }
    }
    return stages;
  }, [issues, statusFilter]);

  const sorted = useMemo(() => {
    const dir = sortAsc ? 1 : -1;
    return [...filtered].sort((a, b) => {
      switch (sortBy) {
        case "timeToCloseHours": {
          const av = a.timeToCloseHours ?? Number.MAX_SAFE_INTEGER;
          const bv = b.timeToCloseHours ?? Number.MAX_SAFE_INTEGER;
          return (av - bv) * dir;
        }
        case "timeToFirstResponseHours": {
          const av = a.timeToFirstResponseHours ?? Number.MAX_SAFE_INTEGER;
          const bv = b.timeToFirstResponseHours ?? Number.MAX_SAFE_INTEGER;
          return (av - bv) * dir;
        }
        case "commentCount":
          return ((a.commentCount || 0) - (b.commentCount || 0)) * dir;
        case "issueTitle":
          return (a.issueTitle || "").localeCompare(b.issueTitle || "") * dir;
        case "stage": {
          const ai = STAGE_ORDER.get(a.boardStage) ?? 99;
          const bi = STAGE_ORDER.get(b.boardStage) ?? 99;
          if (ai !== bi) return (ai - bi) * dir;
          // Within the same stage, oldest first
          return (
            (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * dir
          );
        }
        default:
          return (
            (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * dir
          );
      }
    });
  }, [filtered, sortBy, sortAsc]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortAsc((v) => !v);
    } else {
      setSortBy(field);
      setSortAsc(false);
    }
    setPage(1);
  };

  const formatHours = (hours: number | null): string => {
    if (hours === null) return "-";
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    const rem = hours % 24;
    return rem > 0 ? `${days}d ${rem}h` : `${days}d`;
  };
  return (
    <div className="space-y-4">
      {/* Stage filter chips */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => {
            setStageFilter("All");
            setPage(1);
          }}
          className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
            stageFilter === "All"
              ? "bg-primary text-primary-foreground border-primary"
              : "hover:bg-muted"
          }`}
        >
          All ({filteredByStatusOnly(issues, statusFilter).length})
        </button>
        {stageChips.map((chip) => (
          <button
            key={chip.stage}
            onClick={() => {
              setStageFilter(chip.stage);
              setPage(1);
            }}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              stageFilter === chip.stage
                ? "bg-primary text-primary-foreground border-primary"
                : "hover:bg-muted"
            }`}
          >
            {chip.stage} ({chip.count})
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search title, author, or #iid..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="max-w-xs"
        />
        <select
          value={assigneeFilter}
          onChange={(e) => {
            setAssigneeFilter(e.target.value);
            setPage(1);
          }}
          className="h-9 rounded-md border bg-background px-3 text-sm"
          aria-label="Filter by person"
        >
          <option value="All">All people</option>
          {assigneeOptions.map((a) => (
            <option key={a.username} value={a.username}>
              {a.name !== a.username ? `${a.name} (@${a.username})` : `@${a.username}`}
            </option>
          ))}
        </select>
        <select
          value={priorityFilter}
          onChange={(e) => {
            setPriorityFilter(e.target.value);
            setPage(1);
          }}
          className="h-9 rounded-md border bg-background px-3 text-sm"
          aria-label="Filter by priority"
        >
          <option value="All">All priorities</option>
          {priorityOptions.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select
          value={teamFilter}
          onChange={(e) => {
            setTeamFilter(e.target.value);
            setPage(1);
          }}
          className="h-9 rounded-md border bg-background px-3 text-sm"
          aria-label="Filter by team"
        >
          <option value="All">All teams</option>
          {teamOptions.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <div className="flex items-center rounded-lg border overflow-hidden">
          {(["open", "closed", "all"] as const).map((s) => (
            <button
              key={s}
              onClick={() => {
                setStatusFilter(s);
                setStageFilter("All");
                setPage(1);
              }}
              className={`px-3 py-2 text-xs font-medium capitalize transition-colors ${
                statusFilter === s ? "bg-primary text-primary-foreground" : "hover:bg-muted"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <span className="ml-auto text-sm text-muted-foreground">
          {sorted.length} issue{sorted.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="border rounded-lg overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <SortHead field="issueTitle" onSort={handleSort}>Issue</SortHead>
              </TableHead>
              <TableHead>Project</TableHead>
              <TableHead>Author</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Board Stage</TableHead>
              <TableHead>Progress</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>
                <SortHead field="createdAt" onSort={handleSort}>Created</SortHead>
              </TableHead>
              <TableHead className="text-right">Age</TableHead>
              <TableHead>
                <SortHead field="timeToCloseHours" onSort={handleSort}>Cycle Time</SortHead>
              </TableHead>
              <TableHead>
                <SortHead field="timeToFirstResponseHours" onSort={handleSort}>1st Response</SortHead>
              </TableHead>
              <TableHead>
                <SortHead field="commentCount" onSort={handleSort}>Comments</SortHead>
              </TableHead>
              <TableHead>Labels</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={13} className="text-center py-8 text-muted-foreground">
                  No issues match the current filters
                </TableCell>
              </TableRow>
            ) : (
              pageRows.map((issue) => (
                <TableRow
                  key={issue.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => onSelectIssue(issue)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelectIssue(issue);
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  aria-label={`Issue #${issue.issueIid}: ${issue.issueTitle || "Untitled"}, ${issue.state}, ${issue.boardStage}`}
                >
                  <TableCell>
                    <div className="flex items-center gap-2 max-w-[260px]">
                      <span className="font-medium truncate">
                        {issue.issueTitle || `Issue #${issue.issueIid}`}
                      </span>
                      {issue.issueUrl && (
                        <a
                          href={issue.issueUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-muted-foreground hover:text-foreground shrink-0"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">#{issue.issueIid}</div>
                  </TableCell>
                  <TableCell className="text-sm truncate max-w-[120px]">
                    {issue.projectName || issue.gitlabProjectId}
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">{issue.authorName}</div>
                    <div className="text-xs text-muted-foreground">@{issue.authorUsername}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={issue.state === "open" ? "default" : "secondary"}>
                      {issue.state}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={`text-xs whitespace-nowrap ${
                        issue.boardStage === "In Progress"
                          ? "border-blue-500/50 text-blue-600"
                          : issue.boardStage === "Peer Review"
                            ? "border-yellow-500/50 text-yellow-600"
                            : issue.boardStage === "Testing/QA"
                              ? "border-orange-500/50 text-orange-600"
                              : ""
                      }`}
                    >
                      {issue.boardStage}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {(() => {
                      // Prefer real progress from comment commands (/dev, /test, /uat)
                      // based on the current stage; fall back to stage-based estimate.
                      let pct: number | null;
                      if (issue.boardStage === "Testing/QA") {
                        pct = issue.qaProgress;
                      } else if (
                        ["In Progress", "Peer Review", "Completed"].includes(issue.boardStage)
                      ) {
                        pct = issue.devProgress;
                      } else {
                        pct = getStageProgress(issue.boardStage);
                      }
                      if (pct === null) return <span className="text-muted-foreground">—</span>;
                      const isDone = pct === 100;
                      return (
                        <div className="flex items-center gap-2 w-[90px]">
                          <Progress
                            value={pct}
                            className={`h-1.5 ${isDone ? "[&>div]:bg-green-600" : ""}`}
                          />
                          <span
                            className={`text-xs shrink-0 ${
                              isDone ? "text-green-600 font-medium" : "text-muted-foreground"
                            }`}
                          >
                            {pct}%
                          </span>
                        </div>
                      );
                    })()}
                  </TableCell>
                  <TableCell className="text-sm">
                    {issue.priority ? (
                      <Badge
                        variant={
                          issue.priority === "P0"
                            ? "destructive"
                            : issue.priority === "P1"
                              ? "secondary"
                              : "outline"
                        }
                        className="text-xs"
                      >
                        {issue.priority}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm whitespace-nowrap">
                    {new Date(issue.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-sm text-right">
                    {issue.state === "open" ? (
                      <span
                        className={
                          ageInDays(issue.createdAt) >= 14
                            ? "text-destructive font-medium"
                            : ageInDays(issue.createdAt) >= 7
                              ? "text-orange-600 font-medium"
                              : ""
                        }
                      >
                        {ageInDays(issue.createdAt)}d
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{formatHours(issue.timeToCloseHours)}</TableCell>
                  <TableCell className="text-sm">
                    {formatHours(issue.timeToFirstResponseHours)}
                  </TableCell>
                  <TableCell className="text-sm">{issue.commentCount || 0}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1 max-w-[140px]">
                      {(issue.labels || "")
                        .split(",")
                        .filter((l) => l.trim())
                        .slice(0, 2)
                        .map((label, i) => (
                          <Badge key={i} variant="outline" className="text-xs truncate max-w-[80px]">
                            {label.trim()}
                          </Badge>
                        ))}
                      {(issue.labels || "").split(",").length > 2 && (
                        <Badge variant="outline" className="text-xs">
                          +
                          {(issue.labels || "").split(",").length - 2}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            Page {safePage} of {totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
