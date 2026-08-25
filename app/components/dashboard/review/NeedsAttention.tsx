"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ReviewIssue } from "./types";
import {
  ageDays,
  categorizeAttention,
  type AttentionCategory,
} from "./attention";
import {
  AlertTriangle,
  Ban,
  Hammer,
  Eye,
  FlaskConical,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  SearchCheck,
  PlayCircle,
} from "lucide-react";

interface NeedsAttentionProps {
  issues: ReviewIssue[];
  onSelectIssue: (issue: ReviewIssue) => void;
}

const CATEGORY_META: Record<string, { icon: typeof Ban; tone: string }> = {
  blocked: { icon: Ban, tone: "text-red-600" },
  "stuck-refinement": { icon: SearchCheck, tone: "text-slate-600" },
  "not-picked-up": { icon: PlayCircle, tone: "text-cyan-700" },
  "stuck-dev": { icon: Hammer, tone: "text-orange-600" },
  "review-wait": { icon: Eye, tone: "text-yellow-600" },
  "qa-bottleneck": { icon: FlaskConical, tone: "text-amber-600" },
};

export function NeedsAttention({ issues, onSelectIssue }: NeedsAttentionProps) {
  const [openCategory, setOpenCategory] = useState<string | null>(null);

  const categories = categorizeAttention(issues);
  const totalFlagged = categories.reduce((sum, c) => sum + c.issues.length, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4 text-orange-500" />
          Needs Attention
          {totalFlagged > 0 && <Badge variant="destructive">{totalFlagged}</Badge>}
        </CardTitle>
        <CardDescription>
          Tickets that are blocked or moving too slow — check these first
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {totalFlagged === 0 ? (
          <div className="flex items-center gap-2 py-4 justify-center text-muted-foreground">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            Nothing stuck — everything is moving
          </div>
        ) : (
          categories.map((cat: AttentionCategory) => {
            if (cat.issues.length === 0) return null;
            const isOpen = openCategory === cat.key;
            const meta = CATEGORY_META[cat.key];
            const Icon = meta?.icon ?? AlertTriangle;
            const tone = meta?.tone ?? "text-muted-foreground";

            return (
              <div key={cat.key} className="border rounded-lg overflow-hidden">
                <button
                  className="w-full flex items-center gap-3 p-3 hover:bg-muted/50 text-left transition-colors"
                  onClick={() => setOpenCategory(isOpen ? null : cat.key)}
                >
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <Icon className={`h-4 w-4 shrink-0 ${tone}`} />
                  <span className="font-medium text-sm flex-1">{cat.title}</span>
                  <span className="text-xs text-muted-foreground hidden md:inline">
                    {cat.hint}
                  </span>
                  <Badge variant={cat.key === "blocked" ? "destructive" : "secondary"}>
                    {cat.issues.length}
                  </Badge>
                </button>

                {isOpen && (
                  <div className="border-t divide-y">
                    {cat.issues
                      .slice()
                      .sort((a, b) => ageDays(b.createdAt) - ageDays(a.createdAt))
                      .map((issue) => (
                        <button
                          key={issue.id}
                          className="w-full flex items-center gap-2 px-4 py-2 hover:bg-muted/50 text-left text-sm"
                          onClick={() => onSelectIssue(issue)}
                        >
                          <span className="text-muted-foreground font-mono text-xs shrink-0">
                            #{issue.issueIid}
                          </span>
                          <span className="truncate flex-1">{issue.issueTitle}</span>
                          <span className="text-xs text-muted-foreground shrink-0 hidden md:inline">
                            @{issue.authorUsername}
                          </span>
                          <Badge
                            variant={ageDays(issue.createdAt) >= 14 ? "destructive" : "outline"}
                            className="shrink-0 text-[10px]"
                          >
                            {ageDays(issue.createdAt)}d
                          </Badge>
                          {issue.issueUrl && (
                            <a
                              href={issue.issueUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="shrink-0 text-muted-foreground hover:text-foreground"
                            >
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </button>
                      ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
