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
}

export function TeamWeekSection({
  people,
  loading,
  subtitle,
  wipMap = {},
  wipLimit = 2,
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
      // Reuse the person-report endpoint with the same week range
      const res = await fetch(`/api/tracker/person-report?user=${username}`);
      const data = await res.json();
      if (!data.error) setDetail(data);
    } catch (error) {
      console.error("Failed to fetch person detail:", error);
    } finally {
      setDetailLoading(false);
    }
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
          <p className="text-center py-8 text-muted-foreground">
            No activity this week. Try another week or click Sync.
          </p>
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
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
