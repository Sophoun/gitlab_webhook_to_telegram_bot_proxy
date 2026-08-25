"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { WIP_LIMIT } from "./types";
import { Columns3, Flag, UsersRound } from "lucide-react";

interface BoardOverviewProps {
  boardDistribution: Array<{ stage: string; count: number }>;
  priorityBreakdown: Array<{ priority: string; openCount: number }>;
  teamBreakdown: Array<{ team: string; openCount: number }>;
}

const STAGE_COLORS: Record<string, string> = {
  Backlog: "border-gray-400/40 bg-gray-500/10",
  Refinement: "border-slate-400/40 bg-slate-500/10",
  "Ready for Dev": "border-cyan-500/40 bg-cyan-500/10",
  "In Progress": "border-blue-500/50 bg-blue-500/10",
  "Peer Review": "border-yellow-500/50 bg-yellow-500/10",
  "Testing/QA": "border-orange-500/50 bg-orange-500/10",
  Completed: "border-lime-500/50 bg-lime-500/10",
  Done: "border-green-600/50 bg-green-600/10",
};

export function BoardOverview({
  boardDistribution,
  priorityBreakdown,
  teamBreakdown,
}: BoardOverviewProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Columns3 className="h-4 w-4" />
          Board Overview
        </CardTitle>
        <CardDescription>All issues mapped to your Kanban workflow</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Kanban stage strip */}
        <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
          {boardDistribution.map((s) => (
            <div
              key={s.stage}
              className={`rounded-lg border p-3 text-center ${STAGE_COLORS[s.stage] || "border-border bg-muted/30"}`}
            >
              <div className="text-xl font-bold">{s.count}</div>
              <div className="text-[11px] leading-tight text-muted-foreground mt-0.5">
                {s.stage}
              </div>
            </div>
          ))}
        </div>

        {/* Priority + Team */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <p className="text-sm font-medium mb-2 flex items-center gap-1.5">
              <Flag className="h-3.5 w-3.5" />
              Open by Priority
            </p>
            <div className="flex flex-wrap gap-2">
              {priorityBreakdown.map((p) => (
                <Badge
                  key={p.priority}
                  variant={p.priority === "P0" && p.openCount > 0 ? "destructive" : "secondary"}
                  className="text-xs"
                >
                  {p.priority}: {p.openCount}
                </Badge>
              ))}
            </div>
          </div>
          <div>
            <p className="text-sm font-medium mb-2 flex items-center gap-1.5">
              <UsersRound className="h-3.5 w-3.5" />
              Open by Team
            </p>
            <div className="flex flex-wrap gap-2">
              {teamBreakdown.length === 0 ? (
                <span className="text-sm text-muted-foreground">No open issues</span>
              ) : (
                teamBreakdown.map((t) => (
                  <Badge key={t.team} variant="outline" className="text-xs">
                    {t.team}: {t.openCount}
                  </Badge>
                ))
              )}
            </div>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          WIP limit is {WIP_LIMIT} per person — people exceeding it are flagged in the
          table below.
        </p>
      </CardContent>
    </Card>
  );
}
