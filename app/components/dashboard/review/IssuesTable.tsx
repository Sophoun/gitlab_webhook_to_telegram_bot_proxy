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
import { WORKFLOW_STAGES, type ReviewIssue } from "./types";

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
  const [sortBy, setSortBy] = useState(initialSortBy || "stage");
  const [sortAsc, setSortAsc] = useState(true);
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return issues.filter((i) => {
      if (statusFilter !== "all" && i.state !== statusFilter) return false;
      if (stageFilter !== "All" && i.boardStage !== stageFilter) return false;
      if (!q) return true;
      return (
        (i.issueTitle || "").toLowerCase().includes(q) ||
        i.authorName.toLowerCase().includes(q) ||
        i.authorUsername.toLowerCase().includes(q) ||
        `#${i.issueIid}`.includes(q)
      );
    });
  }, [issues, search, statusFilter, stageFilter]);

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
    if ((counts.get("No Stage") || 0) > 0) {
      stages.push({ stage: "No Stage", count: counts.get("No Stage")! });
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

  const SortHead = ({ field, children }: { field: string; children: React.ReactNode }) => (
    <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => handleSort(field)}>
      {children}
      <ArrowUpDown className="ml-1 h-3 w-3" />
    </Button>
  );

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
                <SortHead field="issueTitle">Issue</SortHead>
              </TableHead>
              <TableHead>Project</TableHead>
              <TableHead>Author</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Board Stage</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>
                <SortHead field="createdAt">Created</SortHead>
              </TableHead>
              <TableHead className="text-right">Age</TableHead>
              <TableHead>
                <SortHead field="timeToCloseHours">Cycle Time</SortHead>
              </TableHead>
              <TableHead>
                <SortHead field="timeToFirstResponseHours">1st Response</SortHead>
              </TableHead>
              <TableHead>
                <SortHead field="commentCount">Comments</SortHead>
              </TableHead>
              <TableHead>Labels</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={12} className="text-center py-8 text-muted-foreground">
                  No issues match the current filters
                </TableCell>
              </TableRow>
            ) : (
              pageRows.map((issue) => (
                <TableRow
                  key={issue.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => onSelectIssue(issue)}
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
