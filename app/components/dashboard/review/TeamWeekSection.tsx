"use client";

import { useState, useMemo, Fragment } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  ChevronDown,
  ChevronRight,
  ListTodo,
  ExternalLink,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Clock,
  HelpCircle,
} from "lucide-react";
import { WORKFLOW_STAGES, STAGE_BADGE_CLASS, FALLBACK_STAGES } from "./types";

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

interface ItemRef {
  itemIid: number;
  itemTitle: string | null;
  itemUrl: string | null;
  projectName: string;
}

interface OpenTask {
  gitlabProjectId: number;
  issueIid: number;
  issueTitle: string | null;
  issueUrl: string | null;
  projectName: string;
  boardStage: string;
  isAssignee: boolean;
}

interface AssignedTask {
  gitlabProjectId: number;
  issueIid: number;
  taskText: string;
  isCompleted: boolean;
}

interface PersonReport {
  closedIssues: ItemRef[];
  createdIssues: ItemRef[];
  commentedOn: ItemRef[];
  mergedMrs: ItemRef[];
  openTasks: OpenTask[];
  assignedTasks: AssignedTask[];
}

interface TeamWeekSectionProps {
  people: PersonWeek[];
  loading: boolean;
  subtitle?: string;
  wipMap?: Record<string, number>;
  wipLimit?: number;
  from: string;
  to: string;
  repo?: string | null;
}

type SortField =
  | "name"
  | "openTaskCount"
  | "progressDelivered"
  | "mrsMerged"
  | "commits"
  | "totalEvents"
  | "lastActivityAt";

function formatLastActive(iso: string | null): string {
  if (!iso) return "—";
  // Handle UNIX timestamps (all digits) — convert to ISO
  const ts = /^\d+$/.test(iso) ? Number(iso) * 1000 : undefined;
  const d = ts ? new Date(ts) : new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function SortHead({
  field,
  currentField,
  currentAsc,
  onSort,
  children,
}: {
  field: SortField;
  currentField: SortField;
  currentAsc: boolean;
  onSort: (f: SortField) => void;
  children: React.ReactNode;
}) {
  const active = currentField === field;
  return (
    <TableHead>
      <button
        onClick={() => onSort(field)}
        className={`inline-flex items-center gap-1 text-xs font-medium hover:text-foreground transition-colors ${
          active ? "text-foreground" : "text-muted-foreground"
        }`}
      >
        {children}
        {active ? (
          currentAsc ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-40" />
        )}
      </button>
    </TableHead>
  );
}

const ROLE_LABELS: Record<string, string> = {
  developer: "Developer",
  coordinator: "Coordinator",
  mixed: "Contributor",
};

const ROLE_COLORS: Record<string, string> = {
  developer: "bg-emerald-50 text-emerald-700 border-emerald-200",
  coordinator: "bg-blue-50 text-blue-700 border-blue-200",
  mixed: "bg-gray-50 text-gray-600 border-gray-200",
};

function getPerformanceSummary(p: PersonWeek): string {
  const grade = p.performanceGrade;
  const role = p.performanceRole;
  const roleLabel = role === "developer" ? "developer" : role === "mixed" ? "contributor (code + issue management)" : "coordinator (issue management)";
  const closed = p.issuesClosed;
  const open = p.openTaskCount;
  const mrs = p.mrsMerged;
  const commits = p.commits;
  const consistency = p.consistency;
  const parts: string[] = [];

  // Overall assessment
  if (grade === "A") parts.push(`${p.name} is a top performer.`);
  else if (grade === "B") parts.push(`${p.name} is a strong performer.`);
  else if (grade === "C") parts.push(`${p.name} is a solid contributor.`);
  else if (grade === "D") parts.push(`${p.name} has room for improvement.`);
  else parts.push(`${p.name} is currently below expectations.`);

  // Role
  parts.push(`They work primarily as a ${roleLabel}.`);

  // Delivery
  if (closed > 0 && open > 0) parts.push(`Resolved ${closed} issues with ${open} still open.`);
  else if (closed > 0) parts.push(`Resolved ${closed} issues this period.`);
  else if (open > 0) parts.push(`${open} issues currently assigned.`);

  // Code output (DEV/MIX only)
  if (role === "developer" || role === "mixed") {
    const codeParts: string[] = [];
    if (mrs > 0) codeParts.push(`${mrs} MR${mrs !== 1 ? "s" : ""} merged`);
    if (commits > 0) codeParts.push(`${commits} commit${commits !== 1 ? "s" : ""}`);
    if (codeParts.length > 0) parts.push(`Code output: ${codeParts.join(" and ")}.`);
  }

  // Consistency
  if (consistency >= 80) parts.push("Highly consistent activity.");
  else if (consistency >= 50) parts.push("Moderately consistent.");
  else if (consistency > 0) parts.push("Sporadic activity.");
  else parts.push("No activity recorded this period.");

  return parts.join(" ");
}

function RoleBadge({ person }: { person: PersonWeek }) {
  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium ${
        ROLE_COLORS[person.performanceRole] || "bg-gray-50 text-gray-600 border-gray-200"
      }`}
    >
      {ROLE_LABELS[person.performanceRole] || person.performanceRole}
    </span>
  );
}

export function TeamWeekSection({
  people,
  loading,
  subtitle,
  wipMap = {},
  wipLimit = 2,
  from,
  to,
  repo = null,
}: TeamWeekSectionProps) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detail, setDetail] = useState<PersonReport | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(false);
  const [sortBy, setSortBy] = useState<SortField>("totalEvents");
  const [sortAsc, setSortAsc] = useState(false);
  const [search, setSearch] = useState("");
  const [showLegend, setShowLegend] = useState(false);

  const sorted = useMemo(() => {
    return [...people].sort((a, b) => {
      switch (sortBy) {
        case "name": {
          const av = a.name.toLowerCase();
          const bv = b.name.toLowerCase();
          return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
        }
        case "lastActivityAt": {
          const av = a.lastActivityAt || "";
          const bv = b.lastActivityAt || "";
          return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
        }
        case "openTaskCount":
          return sortAsc ? a.openTaskCount - b.openTaskCount : b.openTaskCount - a.openTaskCount;
        case "progressDelivered":
          return sortAsc
            ? a.progressDelivered - b.progressDelivered
            : b.progressDelivered - a.progressDelivered;
        case "mrsMerged":
          return sortAsc ? a.mrsMerged - b.mrsMerged : b.mrsMerged - a.mrsMerged;
        case "commits":
          return sortAsc ? a.commits - b.commits : b.commits - a.commits;
        case "totalEvents":
        default:
          return sortAsc ? a.totalEvents - b.totalEvents : b.totalEvents - a.totalEvents;
      }
    });
  }, [people, sortBy, sortAsc]);

  const filtered = useMemo(() => {
    if (!search) return sorted;
    const q = search.toLowerCase();
    return sorted.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.username.toLowerCase().includes(q)
    );
  }, [sorted, search]);

  // Leaderboard rank by performance score (descending), independent of current sort
  const rankMap = useMemo(() => {
    const byScore = [...people].sort((a, b) => b.performanceScore - a.performanceScore);
    const map = new Map<string, number>();
    byScore.forEach((p, i) => map.set(p.username, i + 1));
    return map;
  }, [people]);

  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortAsc((v) => !v);
    } else {
      setSortBy(field);
      setSortAsc(field === "name" || field === "lastActivityAt");
    }
  };

  const togglePerson = async (username: string) => {
    if (expanded === username) {
      setExpanded(null);
      setDetail(null);
      setDetailError(false);
      return;
    }
    setExpanded(username);
    setDetail(null);
    setDetailError(false);
    setDetailLoading(true);
    try {
      const repoQs = repo ? `&repo=${repo}` : "";
      const res = await fetch(
        `/api/tracker/person-report?user=${encodeURIComponent(username)}&from=${from}&to=${to}${repoQs}`
      );
      const data = await res.json();
      if (data.error) {
        setDetailError(true);
      } else {
        setDetail(data);
      }
    } catch (error) {
      console.error("Failed to fetch person detail:", error);
      setDetailError(true);
    } finally {
      setDetailLoading(false);
    }
  };

  const getStageChips = (p: PersonWeek) => {
    const workflow = WORKFLOW_STAGES.filter((stage) => p.openTasksByStage[stage]).map((stage) => ({
      stage,
      count: p.openTasksByStage[stage],
    }));
    const fallback = FALLBACK_STAGES.filter((stage) => p.openTasksByStage[stage]).map((stage) => ({
      stage,
      count: p.openTasksByStage[stage],
    }));
    return [...workflow, ...fallback];
  };

  const getDetailTaskGroups = (): Array<{ stage: string; items: OpenTask[] }> => {
    const tasks = detail?.openTasks || [];
    const grouped: Array<{ stage: string; items: OpenTask[] }> = WORKFLOW_STAGES.map((stage) => ({
      stage,
      items: tasks.filter((t) => t.boardStage === stage),
    })).filter((g) => g.items.length > 0);
    // Fallback stages (Opened, Closed) at the bottom
    const matched = new Set(grouped.flatMap((g) => g.items.map((t) => `${t.gitlabProjectId}-${t.issueIid}`)));
    const unmatched = tasks.filter((t) => !matched.has(`${t.gitlabProjectId}-${t.issueIid}`));
    // Group unmatched by their actual stage (e.g. "Opened", "Closed")
    const fallbackGroups = new Map<string, OpenTask[]>();
    for (const t of unmatched) {
      const key = t.boardStage || "Opened";
      const arr = fallbackGroups.get(key) || [];
      arr.push(t);
      fallbackGroups.set(key, arr);
    }
    for (const [stage, items] of fallbackGroups) {
      grouped.push({ stage, items });
    }
    return grouped;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Who Did What</CardTitle>
        <CardDescription>
          {subtitle || "Click a person to see exactly what they worked on"}
        </CardDescription>
        <button
          onClick={() => setShowLegend(!showLegend)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mt-1"
        >
          <HelpCircle className="h-3.5 w-3.5" />
          {showLegend ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          What do these values mean?
        </button>
        {showLegend && (
          <div className="mt-2 rounded-lg border bg-muted/30 p-3 text-xs space-y-1.5">
            <p><span className="font-semibold">Role</span> — Developer (writes code), Coordinator (manages issues), Contributor (does both).</p>
            <p><span className="font-semibold">Assigned Open</span> — how many open issues are currently assigned to this person.</p>
            <p><span className="font-semibold">Last Active</span> — when they last did something in this period.</p>
            <p className="text-muted-foreground/70">Click a person to see their open tasks by stage.</p>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-center py-8 text-muted-foreground">Loading team activity...</p>
        ) : people.length === 0 ? (
          <div className="text-center py-8 space-y-2">
            <p className="text-muted-foreground">
              No activity recorded for this period.
            </p>
            <p className="text-sm text-muted-foreground">
              The data reflects your last sync — click <strong>Sync</strong> to fetch
              the latest from GitLab, or navigate to another day/week/month.
            </p>
          </div>
        ) : (
          <>
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
                  <TableHead className="w-10 text-muted-foreground">#</TableHead>
                  <SortHead field="name" currentField={sortBy} currentAsc={sortAsc} onSort={handleSort}>
                    Person
                  </SortHead>
                  <TableHead>Role</TableHead>
                  <SortHead
                    field="openTaskCount"
                    currentField={sortBy}
                    currentAsc={sortAsc}
                    onSort={handleSort}
                  >
                    <ListTodo className="h-3 w-3 text-blue-500" /> Assigned Open
                  </SortHead>
                  <SortHead
                    field="lastActivityAt"
                    currentField={sortBy}
                    currentAsc={sortAsc}
                    onSort={handleSort}
                  >
                    <Clock className="h-3 w-3 text-muted-foreground" /> Last Active
                  </SortHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p) => (
                  <Fragment key={p.username}>
                    <TableRow
                      className={`cursor-pointer hover:bg-muted/50 ${expanded === p.username ? "bg-muted/50" : ""}`}
                      onClick={() => togglePerson(p.username)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          togglePerson(p.username);
                        }
                      }}
                      tabIndex={0}
                      role="button"
                      aria-expanded={expanded === p.username}
                    >
                      <TableCell className="text-muted-foreground font-medium">
                        {rankMap.get(p.username) || "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {expanded === p.username ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                          )}
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                            <span className="text-xs font-medium">
                              {p.name.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium truncate flex items-center gap-2">
                              <Link
                                href={`/review/people/${encodeURIComponent(p.username)}`}
                                className="hover:underline"
                                onClick={(e) => e.stopPropagation()}
                                title="Open full profile"
                              >
                                {p.name}
                              </Link>
                              {(wipMap[p.username] || 0) > wipLimit && (
                                <Badge variant="destructive" className="text-[10px] shrink-0">
                                  WIP {wipMap[p.username]}/{wipLimit}
                                </Badge>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground truncate">
                              @{p.username}
                            </div>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {getStageChips(p).map((chip) => (
                                <span
                                  key={chip.stage}
                                  className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium bg-background ${
                                    STAGE_BADGE_CLASS[chip.stage] || "border-border text-muted-foreground"
                                  }`}
                                >
                                  {chip.count}× {chip.stage}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <RoleBadge person={p} />
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        <span
                          className={
                            p.openTaskCount > 0 ? "text-blue-600" : "text-muted-foreground"
                          }
                          title="Open issues assigned to this person, across all repos"
                        >
                          {p.openTaskCount}
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground whitespace-nowrap">
                        {formatLastActive(p.lastActivityAt)}
                      </TableCell>
                    </TableRow>

                    {expanded === p.username && (
                      <TableRow>
                        <TableCell colSpan={5} className="bg-muted/30 p-4">
                          {detailLoading ? (
                            <p className="text-sm text-muted-foreground py-2">Loading details...</p>
                          ) : detailError ? (
                            <div className="text-sm text-destructive py-2">
                              <p>Failed to load details. Please try again.</p>
                              <button
                                onClick={() => togglePerson(p.username)}
                                className="underline text-xs mt-1 hover:text-foreground"
                              >
                                Retry
                              </button>
                            </div>
                          ) : !detail ? (
                            <p className="text-sm text-muted-foreground py-2">
                              No details available
                            </p>
                          ) : (
                            <div className="space-y-4">
                              {/* Plain-language summary */}
                              <p className="text-sm text-muted-foreground leading-relaxed">
                                {getPerformanceSummary(p)}
                              </p>

                              <div>
                                <p className="text-xs font-medium text-muted-foreground mb-2">
                                  Open tasks across all projects
                                </p>
                                {getDetailTaskGroups().length === 0 ? (
                                  <p className="text-sm text-muted-foreground">
                                    No open tasks right now
                                  </p>
                                ) : (
                                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                                    {getDetailTaskGroups().map((group) => (
                                      <div
                                        key={group.stage}
                                        className={`rounded-lg border p-2.5 ${
                                          STAGE_BADGE_CLASS[group.stage] || "border-border"
                                        }`}
                                      >
                                        <p className="text-xs font-semibold mb-1.5">
                                          {group.stage} ({group.items.length})
                                        </p>
                                        <div className="space-y-1">
                                          {group.items.map((item) => (
                                            <div
                                              key={`${item.gitlabProjectId}-${item.issueIid}`}
                                              className="flex items-center gap-1.5 text-sm min-w-0"
                                            >
                                              <span className="text-muted-foreground shrink-0 text-xs">
                                                #{item.issueIid}
                                              </span>
                                              <span className="truncate">{item.issueTitle}</span>
                                              {item.projectName && (
                                                <span className="text-[10px] text-muted-foreground shrink-0 truncate max-w-[100px]">
                                                  {item.projectName}
                                                </span>
                                              )}
                                              {item.issueUrl && (
                                                <a
                                                  href={item.issueUrl}
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
                              </div>

                              {/* Assigned checklist tasks */}
                              {detail.assignedTasks && detail.assignedTasks.length > 0 && (
                                <div className="pt-2 border-t">
                                  <p className="text-xs font-medium text-muted-foreground mb-2">
                                    Assigned Tasks ({detail.assignedTasks.length})
                                  </p>
                                  <div className="space-y-1">
                                    {detail.assignedTasks.map((task, i) => (
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
                                </div>
                              )}
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                ))}
              </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
