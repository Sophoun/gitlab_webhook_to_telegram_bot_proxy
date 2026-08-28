/**
 * Performance scoring engine — auto-detects role and computes a weighted
 * score (0-100) with letter grade.
 *
 * Scoring is **assignment-based**, not creation-based:
 *   • What matters is the work assigned to someone (openTaskCount),
 *     what they delivered (issuesClosed, progressDelivered), and
 *     their code output (commits, MRs).
 *   • issuesCreated is NOT a scoring signal — creating an issue is
 *     just filing a ticket, not doing the work.
 *
 * Quality dimensions:
 *   • Code output (commits, MRs)
 *   • Delivery (issues closed, progress delivered)
 *   • Workload (open tasks assigned)
 *   • Quality (cycle time, first response time, rework rate)
 *   • Consistency (days active / total days)
 */

export type PerformanceRole = "developer" | "coordinator" | "mixed";
export type PerformanceGrade = "A" | "B" | "C" | "D" | "F";

export interface PersonMetrics {
  issuesCreated: number;
  issuesClosed: number;
  issuesReopened?: number;
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
  /** Consistency: days active / total days in period (0-100) */
  consistency?: number;
}

export interface PerformanceResult {
  score: number;
  grade: PerformanceGrade;
  role: PerformanceRole;
  breakdown: {
    code: number;
    delivery: number;
    workload: number;
    quality: number;
    consistency: number;
  };
}

// ---------------------------------------------------------------------------
// Role detection — based on activity patterns, not creation
// ---------------------------------------------------------------------------

export function detectRole(p: PersonMetrics): PerformanceRole {
  const hasCodeOutput = p.commits > 0 || p.mrsMerged > 0 || p.mrsCreated > 0;
  const hasDelivery = p.issuesClosed > 0 || p.progressDelivered > 0;
  const hasManyOpenTasks = p.openTaskCount >= 5;
  const activityCount =
    p.issuesCreated + p.issuesClosed + p.commits + p.mrsMerged + p.mrsCreated;
  const openTasksDominant = hasManyOpenTasks && p.openTaskCount > activityCount * 3;

  // Developer: has code output, OR has many assigned tasks, OR closes more than creates
  if (hasCodeOutput) return "developer";
  if (openTasksDominant) return "developer";
  if (hasDelivery && p.issuesClosed > p.issuesCreated) return "developer";

  // Coordinator: creates issues but doesn't code, and creates more than they close
  if (p.issuesCreated > 0 && !hasCodeOutput && p.issuesCreated > p.issuesClosed) return "coordinator";

  // Mixed: has some of everything, or inactive
  return "mixed";
}

// ---------------------------------------------------------------------------
// Scoring helpers
// ---------------------------------------------------------------------------

function clamp(v: number, max: number): number {
  return Math.min(max, Math.max(0, v));
}

/** Map response time (hours) to a 0-100 quality score (lower is better) */
function responseTimeScore(hours: number | null | undefined): number {
  if (hours === null || hours === undefined || hours < 0) return 50;
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
// Main scoring — assignment-based with quality metrics
// ---------------------------------------------------------------------------

function developerScore(p: PersonMetrics): PerformanceResult["breakdown"] {
  // Code (35 pts): commits, mrsCreated, mrsMerged
  const rawCode = p.commits * 1 + p.mrsCreated * 2 + p.mrsMerged * 3;
  const code = clamp(rawCode * 1.0, 35);

  // Delivery (25 pts): issuesClosed + progressDelivered
  const rawDelivery = p.issuesClosed * 2 + p.progressDelivered * 0.5;
  const delivery = clamp(rawDelivery * 1.5, 25);

  // Workload (15 pts): openTaskCount (capped at ~10 for full marks)
  const rawWorkload = Math.min(p.openTaskCount, 10) * 1.5;
  const workload = clamp(rawWorkload, 15);

  // Quality (15 pts): cycle time + first response + rework penalty
  const hasActivity = p.totalEvents > 0;
  const rtScore = responseTimeScore(hasActivity ? p.avgFirstResponseHours : null);
  const ctScore = cycleTimeScore(hasActivity ? p.avgCycleTimeHours : null);
  // Rework penalty: if someone has closed issues but also reopenings,
  // it suggests quality problems. Penalize up to -5 pts.
  const closedPlusReopened = p.issuesClosed + (p.issuesReopened || 0);
  const reworkRate = closedPlusReopened > 0 ? (p.issuesReopened || 0) / closedPlusReopened : 0;
  const reworkPenalty = reworkRate * 5;
  const qualityBase = ((rtScore + ctScore) / 200) * 15;
  const quality = hasActivity ? clamp(qualityBase - reworkPenalty, 15) : 0;

  // Consistency (10 pts): days active / total days
  const consistency = clamp(((p.consistency || 0) / 100) * 10, 10);

  return { code, delivery, workload, quality, consistency };
}

function coordinatorScore(p: PersonMetrics): PerformanceResult["breakdown"] {
  // Issue creation (35 pts): issuesCreated
  const rawIssue = p.issuesCreated * 2;
  const code = clamp(rawIssue * 2.0, 35);

  // Communication (25 pts): comments
  const rawComm = (p.totalComments || 0) * 0.8;
  const delivery = clamp(rawComm, 25);

  // Delivery (15 pts): progress delivered + issues closed
  const hasActivity = p.totalEvents > 0;
  const rawProgress = p.progressDelivered * 1 + p.issuesClosed * 1;
  const workload = hasActivity ? clamp(rawProgress * 1.0, 15) : 0;

  // Quality (15 pts): consistency + engagement
  const quality = clamp(((p.consistency || 0) / 100) * 15, 15);

  // Collaboration (10 pts): open task management + activity
  const rawCollab = (p.openTaskCount > 0 ? 4 : 0) + clamp(p.totalEvents * 0.3, 6);
  const consistency = clamp(rawCollab, 10);

  return { code, delivery, workload, quality, consistency };
}

function mixedScore(p: PersonMetrics): PerformanceResult["breakdown"] {
  const dev = developerScore(p);
  const coord = coordinatorScore(p);
  return {
    code: (dev.code + coord.code) / 2,
    delivery: (dev.delivery + coord.delivery) / 2,
    workload: (dev.workload + coord.workload) / 2,
    quality: (dev.quality + coord.quality) / 2,
    consistency: (dev.consistency + coord.consistency) / 2,
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

  // Zero activity → score 0 regardless of role
  const hasAnyActivity = p.totalEvents > 0 || p.openTaskCount > 0;
  if (!hasAnyActivity) {
    return {
      score: 0,
      grade: "F",
      role: "mixed",
      breakdown: { code: 0, delivery: 0, workload: 0, quality: 0, consistency: 0 },
    };
  }

  const breakdown =
    role === "developer"
      ? developerScore(p)
      : role === "coordinator"
        ? coordinatorScore(p)
        : mixedScore(p);

  const score = Math.round(
    breakdown.code + breakdown.delivery + breakdown.workload + breakdown.quality + breakdown.consistency
  );

  return {
    score: clamp(score, 100),
    grade: scoreToGrade(score),
    role,
    breakdown,
  };
}
