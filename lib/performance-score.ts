/**
 * Performance scoring engine — auto-detects role and computes a weighted
 * score (0-100) with letter grade.
 *
 * Two scoring paths:
 *   • Developer  — weighted toward code output (commits, MRs, cycle time)
 *   • Coordinator — weighted toward issue management (created, closed, comments)
 *   • Mixed       — blended score from both profiles
 *
 * Role is auto-detected from the contribution mix:
 *   Code % ≥ 60       → developer
 *   Coordination % ≥ 60 → coordinator
 *   otherwise          → mixed
 */

export type PerformanceRole = "developer" | "coordinator" | "mixed";
export type PerformanceGrade = "A" | "B" | "C" | "D" | "F";

export interface PersonMetrics {
  issuesCreated: number;
  issuesClosed: number;
  mrsCreated: number;
  mrsMerged: number;
  commits: number;
  totalEvents: number;
  progressDelivered: number;
  openTaskCount: number;
  /** Average time to first response in hours (null if unavailable) */
  avgFirstResponseHours?: number | null;
  /** Average cycle time in hours (null if unavailable) */
  avgCycleTimeHours?: number | null;
  /** Number of comments (issue + MR) — 0 if not tracked */
  totalComments?: number;
}

export interface PerformanceResult {
  score: number;
  grade: PerformanceGrade;
  role: PerformanceRole;
  breakdown: {
    code: number;
    delivery: number;
    quality: number;
    collaboration: number;
  };
}

// ---------------------------------------------------------------------------
// Role detection
// ---------------------------------------------------------------------------

/** Percentage of work that is "code" (commits + MRs) vs total activity */
function codePct(p: PersonMetrics): number {
  const code = p.commits + p.mrsMerged + p.mrsCreated;
  const total = p.issuesCreated + p.issuesClosed + code;
  return total === 0 ? 0 : Math.round((code / total) * 100);
}

/** Percentage of work that is "coordination" (issues created) */
function coordinationPct(p: PersonMetrics): number {
  const total = p.issuesCreated + p.issuesClosed + p.commits + p.mrsMerged + p.mrsCreated;
  return total === 0 ? 0 : Math.round((p.issuesCreated / total) * 100);
}

export function detectRole(p: PersonMetrics): PerformanceRole {
  const code = codePct(p);
  const coord = coordinationPct(p);
  // Delivery-only is a subset of coordinator (closing work you didn't create)
  // so we check it separately but don't give it its own role.
  if (code >= 60) return "developer";
  if (coord >= 60) return "coordinator";
  return "mixed";
}

// ---------------------------------------------------------------------------
// Scoring helpers
// ---------------------------------------------------------------------------

/** Clamp a value to [0, max] */
function clamp(v: number, max: number): number {
  return Math.min(max, Math.max(0, v));
}

/** Map response time (hours) to a 0-100 quality score (lower is better) */
function responseTimeScore(hours: number | null | undefined): number {
  if (hours === null || hours === undefined || hours < 0) return 50; // neutral if no data
  if (hours <= 2) return 100;
  if (hours <= 8) return 90;
  if (hours <= 24) return 75;
  if (hours <= 48) return 60;
  if (hours <= 72) return 45;
  if (hours <= 168) return 30;
  return 15;
}

/** Map cycle time (hours) to a 0-100 quality score (lower is better) */
function cycleTimeScore(hours: number | null | undefined): number {
  if (hours === null || hours === undefined || hours < 0) return 50;
  if (hours <= 24) return 100;
  if (hours <= 72) return 85;
  if (hours <= 168) return 70;
  if (hours <= 336) return 55;
  if (hours <= 720) return 40;
  return 25;
}

// ---------------------------------------------------------------------------
// Main scoring
// ---------------------------------------------------------------------------

function developerScore(p: PersonMetrics): PerformanceResult["breakdown"] {
  // Code (40 pts): commits, mrsCreated, mrsMerged
  const rawCode = p.commits * 1 + p.mrsCreated * 2 + p.mrsMerged * 3;
  const code = clamp(rawCode * 1.2, 40);

  // Delivery (30 pts): issuesClosed, progressDelivered
  const rawDelivery = p.issuesClosed * 2 + p.progressDelivered * 0.5;
  const delivery = clamp(rawDelivery * 1.5, 30);

  // Quality (20 pts): response time + cycle time
  // Only credit quality if there's actual output; zero-activity → 0
  const hasActivity = p.totalEvents > 0;
  const rtScore = responseTimeScore(hasActivity ? p.avgFirstResponseHours : null);
  const ctScore = cycleTimeScore(hasActivity ? p.avgCycleTimeHours : null);
  const quality = hasActivity ? clamp(((rtScore + ctScore) / 200) * 20, 20) : 0;

  // Collaboration (10 pts): comments + open task management
  const rawCollab = (p.totalComments || 0) * 0.5 + (p.openTaskCount > 0 ? 3 : 0);
  const collaboration = clamp(rawCollab, 10);

  return { code, delivery, quality, collaboration };
}

function coordinatorScore(p: PersonMetrics): PerformanceResult["breakdown"] {
  // Issue management (40 pts): issuesCreated, issuesClosed
  const rawIssue = p.issuesCreated * 1.5 + p.issuesClosed * 2;
  const code = clamp(rawIssue * 2.0, 40);

  // Communication (30 pts): comments
  const rawComm = (p.totalComments || 0) * 0.8;
  const delivery = clamp(rawComm, 30);

  // Delivery (20 pts): progress delivered, issues closed
  const hasActivity = p.totalEvents > 0;
  const rawProgress = p.progressDelivered * 1 + p.issuesClosed * 1;
  const quality = hasActivity ? clamp(rawProgress * 1.0, 20) : 0;

  // Collaboration (10 pts): open task count + total activity
  const rawCollab = (p.openTaskCount > 0 ? 4 : 0) + clamp(p.totalEvents * 0.3, 6);
  const collaboration = clamp(rawCollab, 10);

  return { code, delivery, quality, collaboration };
}

function mixedScore(p: PersonMetrics): PerformanceResult["breakdown"] {
  const dev = developerScore(p);
  const coord = coordinatorScore(p);
  // Weighted blend: 50/50
  return {
    code: (dev.code + coord.code) / 2,
    delivery: (dev.delivery + coord.delivery) / 2,
    quality: (dev.quality + coord.quality) / 2,
    collaboration: (dev.collaboration + coord.collaboration) / 2,
  };
}

function scoreToGrade(score: number): PerformanceGrade {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

export function calculatePerformanceScore(p: PersonMetrics): PerformanceResult {
  const role = detectRole(p);

  const breakdown =
    role === "developer"
      ? developerScore(p)
      : role === "coordinator"
        ? coordinatorScore(p)
        : mixedScore(p);

  const score = Math.round(
    breakdown.code + breakdown.delivery + breakdown.quality + breakdown.collaboration
  );

  return {
    score: clamp(score, 100),
    grade: scoreToGrade(score),
    role,
    breakdown,
  };
}
