"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SyncDialog } from "../SyncDialog";
import { ReviewHeader } from "./ReviewHeader";
import { BoardOverview } from "./BoardOverview";
import { NeedsAttention } from "./NeedsAttention";
import { WIP_LIMIT, type ReviewData } from "./types";
import { ageDays, categorizeAttention } from "./attention";
import { Download } from "lucide-react";

/**
 * Issue Review page — board health: Kanban stage distribution, priorities,
 * problem tickets. Exports Needs Attention / All Issues / Board Summary.
 */
export function ReviewOverview() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const repoParamRaw = searchParams.get("repo");
  const repoParam = repoParamRaw && !isNaN(parseInt(repoParamRaw)) ? repoParamRaw : null;

  const [review, setReview] = useState<ReviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const fetchIssues = useCallback(async () => {
    try {
      const repoQs = repoParam ? `?repo=${repoParam}` : "";
      const res = await fetch(`/api/tracker/review${repoQs}`);
      const data = await res.json();
      setReview(data.error ? null : data);
    } catch (error) {
      console.error("Failed to fetch issues:", error);
      setReview(null);
    } finally {
      setLoading(false);
    }
  }, [repoParam]);

  useEffect(() => {
    fetchIssues();
  }, [fetchIssues]);

  const issues = review?.issues || [];
  const attention = categorizeAttention(issues);

  const avgOf = (values: Array<number | null | undefined>): number | null => {
    const known = values.filter((v): v is number => typeof v === "number");
    if (known.length === 0) return null;
    return known.reduce((a, b) => a + b, 0) / known.length;
  };
  const avgDevProgress = avgOf(
    issues.filter((i) => i.state === "open" && i.boardStage === "In Progress").map((i) => i.devProgress)
  );
  const avgQaProgress = avgOf(
    issues.filter((i) => i.state === "open" && i.boardStage === "Testing/QA").map((i) => i.qaProgress)
  );

  const exportExcel = async () => {
    setExporting(true);
    try {
      const XLSX = await import("xlsx");

      // Sheet: Needs Attention
      const attentionRows: Array<Record<string, string | number>> = [];
      for (const cat of attention) {
        for (const i of cat.issues) {
          attentionRows.push({
            Category: cat.title,
            IID: i.issueIid,
            Title: i.issueTitle || "",
            Author: i.authorName,
            Assignees: (i.assigneeUsernames || "")
              .split(",")
              .map((a) => a.trim())
              .filter(Boolean)
              .join(", "),
            Stage: i.boardStage,
            "Dev Progress (%)": i.devProgress ?? "",
            "QA Progress (%)": i.qaProgress ?? "",
            Priority: i.priority || "",
            "Age (days)": ageDays(i.createdAt),
            URL: i.issueUrl || "",
          });
        }
      }
      const attentionSheet = XLSX.utils.json_to_sheet(attentionRows);
      attentionSheet["!cols"] = [
        { wch: 24 }, { wch: 8 }, { wch: 50 }, { wch: 20 }, { wch: 20 }, { wch: 14 },
        { wch: 15 }, { wch: 15 }, { wch: 10 }, { wch: 12 }, { wch: 40 },
      ];

      // Sheet: All Issues
      const issueSheet = XLSX.utils.json_to_sheet(
        issues.map((i) => ({
          IID: i.issueIid,
          Title: i.issueTitle || "",
          Project: i.projectName || "",
          Author: i.authorName,
          Assignees: (i.assigneeUsernames || "")
            .split(",")
            .map((a) => a.trim())
            .filter(Boolean)
            .join(", "),
          Status: i.state,
          "Board Stage": i.boardStage,
          "Dev Progress (%)": i.devProgress ?? "",
          "QA Progress (%)": i.qaProgress ?? "",
          Priority: i.priority || "",
          Team: i.team || "",
          Type: i.type || "",
          Created: i.createdAt ? new Date(i.createdAt).toLocaleDateString() : "",
          Closed: i.closedAt ? new Date(i.closedAt).toLocaleDateString() : "",
          "Age (days)": i.state === "open" ? ageDays(i.createdAt) : "",
          "Cycle Time (hours)": i.timeToCloseHours ?? "",
          Comments: i.commentCount ?? 0,
          URL: i.issueUrl || "",
        }))
      );
      issueSheet["!cols"] = [
        { wch: 8 }, { wch: 50 }, { wch: 16 }, { wch: 20 }, { wch: 20 }, { wch: 9 },
        { wch: 14 }, { wch: 15 }, { wch: 15 }, { wch: 10 }, { wch: 10 }, { wch: 12 },
        { wch: 12 }, { wch: 12 }, { wch: 11 }, { wch: 17 }, { wch: 10 }, { wch: 40 },
      ];

      const wb = XLSX.utils.book_new();
      if (attentionRows.length > 0) {
        XLSX.utils.book_append_sheet(wb, attentionSheet, "Needs Attention");
      }
      XLSX.utils.book_append_sheet(wb, issueSheet, "All Issues");

      // Sheet: Board Summary
      const summaryAoa: Array<Array<string | number>> = [];
      summaryAoa.push(["Issue Review Export"]);
      summaryAoa.push(["Generated", new Date().toLocaleString()]);
      summaryAoa.push([]);
      summaryAoa.push(["BOARD STAGES"]);
      summaryAoa.push(["Stage", "Issues"]);
      for (const s of review?.boardDistribution || []) {
        summaryAoa.push([s.stage, s.count]);
      }
      summaryAoa.push([]);
      summaryAoa.push(["OPEN BY PRIORITY"]);
      summaryAoa.push(["Priority", "Open Issues"]);
      for (const p of review?.priorityBreakdown || []) {
        summaryAoa.push([p.priority, p.openCount]);
      }
      summaryAoa.push([]);
      summaryAoa.push(["OPEN BY TEAM"]);
      summaryAoa.push(["Team", "Open Issues"]);
      for (const t of review?.teamBreakdown || []) {
        summaryAoa.push([t.team, t.openCount]);
      }
      if (avgDevProgress !== null || avgQaProgress !== null) {
        summaryAoa.push([]);
        summaryAoa.push(["AVERAGE WORK PROGRESS (from /dev, /test, /uat comment commands)"]);
        summaryAoa.push(["Metric", "Average"]);
        if (avgDevProgress !== null) {
          summaryAoa.push(["Avg Dev Progress (open In Progress)", `${Math.round(avgDevProgress)}%`]);
        }
        if (avgQaProgress !== null) {
          summaryAoa.push(["Avg QA Progress (open Testing/QA)", `${Math.round(avgQaProgress)}%`]);
        }
      }
      const wipViolators = (review?.people || []).filter((p) => p.wipCount > WIP_LIMIT);
      if (wipViolators.length > 0) {
        summaryAoa.push([]);
        summaryAoa.push([`WIP VIOLATIONS (over ${WIP_LIMIT} In Progress)`]);
        summaryAoa.push(["Name", "Username", "In Progress"]);
        for (const p of wipViolators) {
          summaryAoa.push([p.name, `@${p.username}`, p.wipCount]);
        }
      }
      const summarySheet = XLSX.utils.aoa_to_sheet(summaryAoa);
      summarySheet["!cols"] = [{ wch: 28 }, { wch: 30 }, { wch: 14 }];
      XLSX.utils.book_append_sheet(wb, summarySheet, "Board Summary");

      XLSX.writeFile(wb, `issue-review_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (error) {
      console.error("Export failed:", error);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <ReviewHeader
        title="Issue Review"
        subtitle="Board health across all repositories · issues from the main board"
        onSynced={fetchIssues}
      >
        <Button variant="outline" onClick={exportExcel} disabled={exporting || !review}>
          <Download className={`h-4 w-4 mr-2 ${exporting ? "animate-pulse" : ""}`} />
          Excel
        </Button>
        <Button variant="outline" onClick={() => setSyncDialogOpen(true)}>
          Selective Sync
        </Button>
      </ReviewHeader>

      {loading ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Loading board…
          </CardContent>
        </Card>
      ) : (
        <>
          {review && (
            <BoardOverview
              boardDistribution={review.boardDistribution}
              priorityBreakdown={review.priorityBreakdown}
              teamBreakdown={review.teamBreakdown}
              avgDevProgress={avgDevProgress}
              avgQaProgress={avgQaProgress}
            />
          )}

          <NeedsAttention
            issues={issues}
            onSelectIssue={(issue) => {
              // Deep-link into the Issue Tracker page with the issue pre-opened
              const params = new URLSearchParams(searchParams.toString());
              params.set("issue", `${issue.gitlabProjectId}:${issue.issueIid}`);
              router.push(`/review/tracker?${params.toString()}`);
            }}
          />
        </>
      )}

      <SyncDialog
        open={syncDialogOpen}
        onOpenChange={setSyncDialogOpen}
        onSync={async () => {
          await fetchIssues();
        }}
        syncing={false}
      />
    </div>
  );
}
