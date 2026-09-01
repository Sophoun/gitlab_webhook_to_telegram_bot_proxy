import type { ReviewIssue } from "./types";

export const ATTENTION_THRESHOLDS = {
  stuckDevDays: 14,
  refinementDays: 14,
  readyDays: 14,
  reviewDays: 14,
  qaDays: 14,
} as const;

export function ageDays(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

function isBlocked(issue: ReviewIssue): boolean {
  return (issue.labels || "")
    .split(",")
    .some((t) => t.trim().toLowerCase().includes("blocked"));
}

export interface AttentionCategory {
  key: string;
  title: string;
  hint: string;
  issues: ReviewIssue[];
}

/** Pure categorization shared by the UI panel and the Excel export. */
export function categorizeAttention(issues: ReviewIssue[]): AttentionCategory[] {
  const open = issues.filter((i) => i.state === "open");
  const T = ATTENTION_THRESHOLDS;

  return [
    {
      key: "blocked",
      title: "Blocked",
      hint: "Labeled 'blocked' — unblock these first",
      issues: open.filter(isBlocked),
    },
    {
      key: "stuck-refinement",
      title: "Stuck in Refinement",
      hint: `In Refinement ${T.refinementDays}+ days — scoping stalled`,
      issues: open.filter(
        (i) => i.boardStage === "Refinement" && ageDays(i.createdAt) >= T.refinementDays
      ),
    },
    {
      key: "not-picked-up",
      title: "Ready but Not Picked Up",
      hint: `Ready for Dev ${T.readyDays}+ days — nobody started`,
      issues: open.filter(
        (i) => i.boardStage === "Ready for Dev" && ageDays(i.createdAt) >= T.readyDays
      ),
    },
    {
      key: "stuck-dev",
      title: "Stuck in Development",
      hint: `In Progress ${T.stuckDevDays}+ days — check with the assignee`,
      issues: open.filter(
        (i) => i.boardStage === "In Progress" && ageDays(i.createdAt) >= T.stuckDevDays
      ),
    },
    {
      key: "review-wait",
      title: "Waiting on Review",
      hint: `In Peer Review ${T.reviewDays}+ days — needs a reviewer`,
      issues: open.filter(
        (i) => i.boardStage === "Peer Review" && ageDays(i.createdAt) >= T.reviewDays
      ),
    },
    {
      key: "qa-bottleneck",
      title: "QA Bottleneck",
      hint: `In Testing/QA ${T.qaDays}+ days — QA is backed up`,
      issues: open.filter(
        (i) => i.boardStage === "Testing/QA" && ageDays(i.createdAt) >= T.qaDays
      ),
    },
  ];
}
