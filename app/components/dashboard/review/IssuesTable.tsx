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
import type { ReviewIssue } from "./types";

interface IssuesTableProps {
  issues: ReviewIssue[];
  initialSortBy?: string;
  onSelectIssue: (issue: ReviewIssue) => void;
}

const PAGE_SIZE = 15;

export function IssuesTable({ issues, initialSortBy, onSelectIssue }: IssuesTableProps) {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState(initialSortBy || "createdAt");
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(1);

  const sorted = useMemo(() => {
    const q = search.toLowerCase();
    const filtered = q
      ? issues.filter(
          (i) =>
            (i.issueTitle || "").toLowerCase().includes(q) ||
            i.authorName.toLowerCase().includes(q) ||
            i.authorUsername.toLowerCase().includes(q) ||
            `#${i.issueIid}`.includes(q)
        )
      : issues;

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
        default:
          return (
            (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * dir
          );
      }
    });
  }, [issues, search, sortBy, sortAsc]);

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
      <div className="flex items-center gap-3">
        <Input
          placeholder="Search title, author, or #iid..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="max-w-xs"
        />
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
                <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
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
