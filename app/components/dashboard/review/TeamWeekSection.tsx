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
  CircleDot,
  CheckCircle2,
  ListTodo,
  MessageSquare,
  ExternalLink,
  Gauge,
  Users2,
  GitMerge,
  Code2,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Clock,
} from "lucide-react";
import { WORKFLOW_STAGES } from "./types";

interface PersonWeek {
  username: string;
  name: string;
  issuesCreated: number;
  issuesClosed: number;
  mrsCreated: number;
  mrsMerged: number;
  commits: number;
  totalEvents: number;
  progressDelivered: number;
  openTaskCount: number;
  openTasksByStage: Record<string, number>;
  lastActivityAt: string | null;
  prevCommits: number;
  prevMrsMerged: number;
  prevIssuesClosed: number;
  prevTotalEvents: number;
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
  isAuthor: boolean;
  isAssignee: boolean;
}

interface PersonReport {
  closedIssues: ItemRef[];
  createdIssues: ItemRef[];
  commentedOn: ItemRef[];
  mergedMrs: ItemRef[];
  openTasks: OpenTask[];
  authoredOpenIssues: OpenTask[];
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

const STAGE_BADGE_CLASS: Record<string, string> = {
  "In Progress": "border-blue-500/50 text-blue-600",
  "Peer Review": "border-yellow-500/50 text-yellow-600",
  "Testing/QA": "border-orange-500/50 text-orange-600",
  Completed: "border-lime-600/50 text-lime-700",
  Opened: "border-gray-400/50 text-gray-500",
} as const;

const FALLBACK_STAGES = ["Opened", "Closed"];

type SortField =
  | "name"
  | "openTaskCount"
  | "progressDelivered"
  | "mrsMerged"
  | "commits"
  | "totalEvents"
  | "lastActivityAt";

function DeltaIndicator({ current, previous }: { current: number; previous: number }) {
  if (previous === 0 && current === 0) return null;
  const diff = current - previous;
  if (diff === 0) return null;
  const pct = previous > 0 ? Math.round(((current - previous) / previous) * 100) : null;
  const label =
    pct !== null ? `${Math.abs(pct)}%` : current > 0 ? "new" : "↓";
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[10px] ml-1 ${
        diff > 0 ? "text-emerald-600" : "text-red-500"
      }`}
    >
      {diff > 0 ? (
        <ArrowUp className="h-2.5 w-2.5" />
      ) : (
        <ArrowDown className="h-2.5 w-2.5" />
      )}
      {label}
    </span>
  );
}

function formatLastActive(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
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
  const [sortBy, setSortBy] = useState<SortField>("totalEvents");
  const [sortAsc, setSortAsc] = useState(false);
  const [search, setSearch] = useState("");

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
      return;
    }
    setExpanded(username);
    setDetail(null);
    setDetailLoading(true);
    try {
      const repoQs = repo ? `&repo=${repo}` : "";
      const res = await fetch(
        `/api/tracker/person-report?user=${encodeURIComponent(username)}&from=${from}&to=${to}${repoQs}`
      );
      const data = await res.json();
      if (!data.error) setDetail(data);
    } catch (error) {
      console.error("Failed to fetch person detail:", error);
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
                  <SortHead field="name" currentField={sortBy} currentAsc={sortAsc} onSort={handleSort}>
                    Person
                  </SortHead>
                  <TableHead>
                    <span className="inline-flex items-center gap-1">
                      <Users2 className="h-3 w-3 text-muted-foreground" /> Contribution
                    </span>
                  </TableHead>
                  <SortHead
                    field="openTaskCount"
                    currentField={sortBy}
                    currentAsc={sortAsc}
                    onSort={handleSort}
                  >
                    <ListTodo className="h-3 w-3 text-blue-500" /> Open Tasks
                  </SortHead>
                  <SortHead
                    field="progressDelivered"
                    currentField={sortBy}
                    currentAsc={sortAsc}
                    onSort={handleSort}
                  >
                    <Gauge className="h-3 w-3 text-orange-500" /> Progress
                  </SortHead>
                  <SortHead
                    field="mrsMerged"
                    currentField={sortBy}
                    currentAsc={sortAsc}
                    onSort={handleSort}
                  >
                    <GitMerge className="h-3 w-3 text-teal-600" /> MRs
                  </SortHead>
                  <SortHead
                    field="commits"
                    currentField={sortBy}
                    currentAsc={sortAsc}
                    onSort={handleSort}
                  >
                    <Code2 className="h-3 w-3 text-emerald-600" /> Commits
                  </SortHead>
                  <SortHead
                    field="totalEvents"
                    currentField={sortBy}
                    currentAsc={sortAsc}
                    onSort={handleSort}
                  >
                    Total
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
                    >
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
                        <ContributionMixBar person={p} />
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        <span
                          className={
                            p.openTaskCount > 0 ? "text-blue-600" : "text-muted-foreground"
                          }
                          title="Open issues authored or assigned to this person, across all repos"
                        >
                          {p.openTaskCount}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        <span
                          className={
                            p.progressDelivered > 0 ? "text-orange-600" : "text-muted-foreground"
                          }
                        >
                          +{p.progressDelivered}%
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-medium text-teal-700">
                        {p.mrsMerged}
                        <DeltaIndicator current={p.mrsMerged} previous={p.prevMrsMerged} />
                      </TableCell>
                      <TableCell className="text-right font-medium text-emerald-700">
                        {p.commits}
                        <DeltaIndicator current={p.commits} previous={p.prevCommits} />
                      </TableCell>
                      <TableCell className="text-right font-medium text-muted-foreground">
                        {p.totalEvents}
                        <DeltaIndicator current={p.totalEvents} previous={p.prevTotalEvents} />
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground whitespace-nowrap">
                        {formatLastActive(p.lastActivityAt)}
                      </TableCell>
                    </TableRow>

                    {expanded === p.username && (
                      <TableRow>
                        <TableCell colSpan={8} className="bg-muted/30 p-4">
                          {detailLoading ? (
                            <p className="text-sm text-muted-foreground py-2">Loading details...</p>
                          ) : !detail ? (
                            <p className="text-sm text-muted-foreground py-2">
                              No details available
                            </p>
                          ) : (
                            <div className="space-y-4">
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

                              {/* Authored open issues (not assigned to this person) */}
                              {(detail.authoredOpenIssues || []).length > 0 && (() => {
                                const authored = detail.authoredOpenIssues;
                                const authGroups: Array<{ stage: string; items: typeof authored }> = [];
                                for (const stage of WORKFLOW_STAGES) {
                                  const items = authored.filter((t) => t.boardStage === stage);
                                  if (items.length > 0) authGroups.push({ stage, items });
                                }
                                const authMatched = new Set(authGroups.flatMap((g) => g.items.map((t) => `${t.gitlabProjectId}-${t.issueIid}`)));
                                const authUnmatched = authored.filter((t) => !authMatched.has(`${t.gitlabProjectId}-${t.issueIid}`));
                                if (authUnmatched.length > 0) authGroups.push({ stage: "Opened", items: authUnmatched });

                                return (
                                  <div className="pt-2 border-t">
                                    <p className="text-xs font-medium text-muted-foreground mb-2">
                                      Authored open issues ({authored.length})
                                      <span className="ml-1 text-muted-foreground/60">· created but not assigned to you</span>
                                    </p>
                                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                                      {authGroups.map((group) => (
                                        <div
                                          key={`auth-${group.stage}`}
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
                                                key={`auth-${item.gitlabProjectId}-${item.issueIid}`}
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
                                  </div>
                                );
                              })()}

                              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t">
                                <div>
                                  <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                                    <CheckCircle2 className="h-3 w-3 text-green-600" />
                                    Closed ({detail.closedIssues.length})
                                  </p>
                                  <DetailList items={detail.closedIssues} empty="Nothing closed" />
                                </div>
                                <div>
                                  <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                                    <CircleDot className="h-3 w-3 text-blue-500" />
                                    Created ({detail.createdIssues.length})
                                  </p>
                                  <DetailList items={detail.createdIssues} empty="Nothing created" />
                                </div>
                                <div>
                                  <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                                    <MessageSquare className="h-3 w-3 text-purple-500" />
                                    Commented on ({detail.commentedOn.length})
                                  </p>
                                  <DetailList items={detail.commentedOn} empty="No comments" />
                                </div>
                              </div>
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

function ContributionMixBar({ person }: { person: PersonWeek }) {
  const coordination = person.issuesCreated;
  const delivery = person.issuesClosed;
  const code = person.commits + person.mrsMerged + person.mrsCreated;
  const total = coordination + delivery + code;

  if (total === 0) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  const pct = (n: number) => Math.round((n / total) * 100);
  const coordinationPct = pct(coordination);
  const deliveryPct = pct(delivery);
  const codePct = 100 - coordinationPct - deliveryPct;

  let focus = "Mixed";
  if (codePct >= 60) focus = "Code";
  else if (coordinationPct >= 60) focus = "Coordination";
  else if (deliveryPct >= 60) focus = "Delivery";

  const tooltip = `Coordination ${coordinationPct}% (created) · Delivery ${deliveryPct}% (closed) · Code ${codePct}% (commits+MRs)`;

  return (
    <div className="min-w-[110px]" title={tooltip}>
      <div className="flex h-2 w-full rounded-full overflow-hidden bg-muted">
        <div className="bg-blue-500" style={{ width: `${coordinationPct}%` }} />
        <div className="bg-orange-500" style={{ width: `${deliveryPct}%` }} />
        <div className="bg-emerald-500" style={{ width: `${codePct}%` }} />
      </div>
      <span className="text-[10px] text-muted-foreground mt-0.5 block">{focus}</span>
    </div>
  );
}

function DetailList({ items, empty }: { items: ItemRef[]; empty: string }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{empty}</p>;
  }
  return (
    <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
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
