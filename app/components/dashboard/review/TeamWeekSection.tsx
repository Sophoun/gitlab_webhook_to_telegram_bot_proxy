"use client";

import { useState, Fragment } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  MessageSquare,
  ExternalLink,
} from "lucide-react";
import { WORKFLOW_STAGES, type ReviewIssue } from "./types";

interface PersonWeek {
  username: string;
  name: string;
  issuesCreated: number;
  issuesClosed: number;
  comments: number;
  mrsCreated: number;
  mrsMerged: number;
  commits: number;
  totalEvents: number;
}

interface ItemRef {
  itemIid: number;
  itemTitle: string | null;
  itemUrl: string | null;
  projectName: string;
}

interface PersonReport {
  closedIssues: ItemRef[];
  createdIssues: ItemRef[];
  commentedOn: ItemRef[];
  mergedMrs: ItemRef[];
}

interface TeamWeekSectionProps {
  people: PersonWeek[];
  loading: boolean;
  subtitle?: string;
  wipMap?: Record<string, number>;
  wipLimit?: number;
  /** Selected period bounds — required so the detail matches the table */
  from: string;
  to: string;
  /** All issues (main project) — used to show each person's current tasks by stage */
  issues: ReviewIssue[];
}

const STAGE_BADGE_CLASS: Record<string, string> = {
  "In Progress": "border-blue-500/50 text-blue-600",
  "Peer Review": "border-yellow-500/50 text-yellow-600",
  "Testing/QA": "border-orange-500/50 text-orange-600",
  Completed: "border-lime-600/50 text-lime-700",
};

export function TeamWeekSection({
  people,
  loading,
  subtitle,
  wipMap = {},
  wipLimit = 2,
  from,
  to,
  issues,
}: TeamWeekSectionProps) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detail, setDetail] = useState<PersonReport | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

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
      // Use the SAME period as the table so numbers always match
      const res = await fetch(
        `/api/tracker/person-report?user=${encodeURIComponent(username)}&from=${from}&to=${to}`
      );
      const data = await res.json();
      if (!data.error) setDetail(data);
    } catch (error) {
      console.error("Failed to fetch person detail:", error);
    } finally {
      setDetailLoading(false);
    }
  };

  // Person's currently OPEN issues grouped by board stage (workflow order)
  const getCurrentTasks = (username: string): Array<{ stage: string; items: ReviewIssue[] }> => {
    const open = issues.filter((i) => i.authorUsername === username && i.state === "open");
    return WORKFLOW_STAGES.map((stage) => ({
      stage,
      items: open.filter((i) => i.boardStage === stage),
    })).filter((g) => g.items.length > 0);
  };

  const getStageChips = (username: string) =>
    getCurrentTasks(username).map((g) => ({ stage: g.stage, count: g.items.length }));

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
          <div className="border rounded-lg overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Person</TableHead>
                  <TableHead className="text-right">
                    <span className="inline-flex items-center gap-1">
                      <CircleDot className="h-3 w-3 text-blue-500" /> Created
                    </span>
                  </TableHead>
                  <TableHead className="text-right">
                    <span className="inline-flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3 text-green-600" /> Closed
                    </span>
                  </TableHead>
                  <TableHead className="text-right">
                    <span className="inline-flex items-center gap-1">
                      <MessageSquare className="h-3 w-3 text-purple-500" /> Comments
                    </span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {people.map((p) => (
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
                              {p.name}
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
                              {getStageChips(p.username).map((chip) => (
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
                      <TableCell className="text-right font-medium">{p.issuesCreated}</TableCell>
                      <TableCell className="text-right font-medium text-green-600">
                        {p.issuesClosed}
                      </TableCell>
                      <TableCell className="text-right">{p.comments}</TableCell>
                    </TableRow>

                    {/* Expanded detail row */}
                    {expanded === p.username && (
                      <TableRow>
                        <TableCell colSpan={4} className="bg-muted/30 p-4">
                          {detailLoading ? (
                            <p className="text-sm text-muted-foreground py-2">Loading details...</p>
                          ) : !detail ? (
                            <p className="text-sm text-muted-foreground py-2">
                              No details available
                            </p>
                          ) : (
                            <div className="space-y-4">
                              {/* Current open tasks by board stage */}
                              <div>
                                <p className="text-xs font-medium text-muted-foreground mb-2">
                                  Current tasks by stage
                                </p>
                                {getCurrentTasks(p.username).length === 0 ? (
                                  <p className="text-sm text-muted-foreground">
                                    No open tasks right now
                                  </p>
                                ) : (
                                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                                    {getCurrentTasks(p.username).map((group) => (
                                      <div
                                        key={group.stage}
                                        className={`rounded-lg border p-2.5 ${
                                          STAGE_BADGE_CLASS[group.stage] || "border-border"
                                        }`}
                                      >
                                        <p className="text-xs font-semibold mb-1.5">
                                          {group.stage} ({group.items.length})
                                          {group.stage === "In Progress" &&
                                            group.items.length > wipLimit && (
                                              <Badge variant="destructive" className="ml-1.5 text-[10px]">
                                                over WIP limit
                                              </Badge>
                                            )}
                                        </p>
                                        <div className="space-y-1">
                                          {group.items.map((item) => (
                                            <div
                                              key={item.id}
                                              className="flex items-center gap-1.5 text-sm min-w-0"
                                            >
                                              <span className="text-muted-foreground shrink-0 text-xs">
                                                #{item.issueIid}
                                              </span>
                                              <span className="truncate">{item.issueTitle}</span>
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

                              {/* This period's activity */}
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
        )}
      </CardContent>
    </Card>
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
