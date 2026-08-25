import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { issueAnalytics } from "@/db/schema";
import { eq, isNotNull } from "drizzle-orm";

interface IssueRow {
  issueIid: number;
  gitlabProjectId: number;
  authorUsername: string;
  authorName: string;
  state: string;
  labels: string | null;
  createdAt: Date | null;
  closedAt: Date | null;
  timeToCloseHours: number | null;
  timeToFirstResponseHours: number | null;
  commentCount: number | null;
}

const CYCLE_BUCKETS = [
  { label: "< 1 day", max: 24 },
  { label: "1-3 days", max: 72 },
  { label: "3-7 days", max: 168 },
  { label: "1-2 weeks", max: 336 },
  { label: "2-4 weeks", max: 720 },
  { label: "1+ month", max: Infinity },
];

const AGE_BUCKETS = [
  { label: "< 1 day", max: 24 },
  { label: "1-3 days", max: 72 },
  { label: "3-7 days", max: 168 },
  { label: "1-2 weeks", max: 336 },
  { label: "2-4 weeks", max: 720 },
  { label: "1+ month", max: Infinity },
];

function bucketFor(hours: number, buckets: typeof CYCLE_BUCKETS): string {
  for (const b of buckets) {
    if (hours < b.max) return b.label;
  }
  return buckets[buckets.length - 1].label;
}

function toIsoWeekKey(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday start
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sprintWeeks = Math.max(1, parseInt(searchParams.get("sprintWeeks") || "2"));

    const db = getDb();

    // Fetch all issues once; aggregate in JS (dataset is small and this avoids
    // fragile SQLite date math on integer timestamps).
    const rows: IssueRow[] = await db
      .select({
        issueIid: issueAnalytics.issueIid,
        gitlabProjectId: issueAnalytics.gitlabProjectId,
        authorUsername: issueAnalytics.authorUsername,
        authorName: issueAnalytics.authorName,
        state: issueAnalytics.state,
        labels: issueAnalytics.labels,
        createdAt: issueAnalytics.createdAt,
        closedAt: issueAnalytics.closedAt,
        timeToCloseHours: issueAnalytics.timeToCloseHours,
        timeToFirstResponseHours: issueAnalytics.timeToFirstResponseHours,
        commentCount: issueAnalytics.commentCount,
      })
      .from(issueAnalytics);

    const now = Date.now();
    const ageHoursOf = (createdAt: Date | null): number =>
      createdAt ? Math.floor((now - new Date(createdAt).getTime()) / 3_600_000) : 0;

    // 1. Sprint Velocity — group closed issues into N-week sprint buckets
    const sprintMap = new Map<string, { issuesCompleted: number; cycleTimes: number[] }>();
    for (const r of rows) {
      if (r.state !== "closed" || !r.closedAt) continue;
      const closed = new Date(r.closedAt);
      const msPerSprint = sprintWeeks * 7 * 24 * 3_600_000;
      const epoch = new Date(0).getTime();
      const sprintIndex = Math.floor((closed.getTime() - epoch) / msPerSprint);
      const key = String(sprintIndex);
      const entry = sprintMap.get(key) || { issuesCompleted: 0, cycleTimes: [] };
      entry.issuesCompleted++;
      if (r.timeToCloseHours !== null) entry.cycleTimes.push(r.timeToCloseHours);
      sprintMap.set(key, entry);
    }
    const sprintVelocity = Array.from(sprintMap.entries())
      .map(([key, v]) => {
        const idx = parseInt(key);
        const start = new Date(idx * sprintWeeks * 7 * 24 * 3_600_000);
        const end = new Date((idx + 1) * sprintWeeks * 7 * 24 * 3_600_000);
        return {
          sprintStart: start.toISOString().slice(0, 10),
          sprintEnd: end.toISOString().slice(0, 10),
          issuesCompleted: v.issuesCompleted,
          avgCycleTime:
            v.cycleTimes.length > 0
              ? Math.round(v.cycleTimes.reduce((a, b) => a + b, 0) / v.cycleTimes.length)
              : null,
        };
      })
      .sort((a, b) => b.sprintStart.localeCompare(a.sprintStart))
      .slice(0, 12);

    // 2. Cycle Time Distribution
    const closedWithCycle = rows.filter(
      (r) => r.state === "closed" && r.timeToCloseHours !== null
    );
    const totalClosedWithCycle = closedWithCycle.length || 1;
    const cycleTimeDistribution = CYCLE_BUCKETS.map((b) => {
      const count = closedWithCycle.filter((r) => bucketFor(r.timeToCloseHours!, CYCLE_BUCKETS) === b.label).length;
      return {
        bucket: b.label,
        count,
        percentage: Math.round((count / totalClosedWithCycle) * 1000) / 10,
      };
    }).filter((b) => b.count > 0);

    // 3. Workload Balance — open issues per author
    const workloadMap = new Map<string, { name: string; openIssues: number; closedIssues: number; oldestOpenAge: number }>();
    for (const r of rows) {
      const entry = workloadMap.get(r.authorUsername) || {
        name: r.authorName,
        openIssues: 0,
        closedIssues: 0,
        oldestOpenAge: 0,
      };
      if (r.state === "open") {
        entry.openIssues++;
        entry.oldestOpenAge = Math.max(entry.oldestOpenAge, ageHoursOf(r.createdAt));
      } else {
        entry.closedIssues++;
      }
      workloadMap.set(r.authorUsername, entry);
    }
    const workload = Array.from(workloadMap.entries())
      .filter(([, v]) => v.openIssues > 0)
      .map(([username, v]) => ({ username, ...v }))
      .sort((a, b) => b.openIssues - a.openIssues);

    // 4. Team Performance
    const teamPerformance = Array.from(workloadMap.entries())
      .map(([username, v]) => {
        const userRows = rows.filter((r) => r.authorUsername === username);
        const cycleTimes = userRows
          .filter((r) => r.state === "closed" && r.timeToCloseHours !== null)
          .map((r) => r.timeToCloseHours!);
        const responseTimes = userRows
          .filter((r) => r.timeToFirstResponseHours !== null)
          .map((r) => r.timeToFirstResponseHours!);
        const avg = (arr: number[]) =>
          arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;
        return {
          username,
          name: v.name,
          totalIssues: userRows.length,
          issuesClosed: v.closedIssues,
          issuesOpen: v.openIssues,
          avgCycleTime: avg(cycleTimes),
          avgFirstResponse: avg(responseTimes),
          totalComments: userRows.reduce((sum, r) => sum + (r.commentCount || 0), 0),
          closeRate:
            userRows.length > 0
              ? Math.round((v.closedIssues / userRows.length) * 1000) / 10
              : 0,
        };
      })
      .sort((a, b) => b.totalIssues - a.totalIssues);

    // 5. Status Distribution (derived from labels + state)
    const statusCounts = new Map<string, number>();
    for (const r of rows) {
      let status = "Other";
      const labels = (r.labels || "").toLowerCase();
      if (r.state === "closed") {
        status = "Done";
      } else if (/review/.test(labels)) {
        status = "In Review";
      } else if (/progress|doing/.test(labels)) {
        status = "In Progress";
      } else if (/todo|backlog|to do/.test(labels)) {
        status = "To Do";
      }
      statusCounts.set(status, (statusCounts.get(status) || 0) + 1);
    }
    const statusDistribution = Array.from(statusCounts.entries())
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count);

    // 6. Throughput Trend — issues closed per week (last 12 weeks)
    const twelveWeeksAgo = now - 84 * 24 * 3_600_000;
    const weekMap = new Map<string, number>();
    for (const r of rows) {
      if (r.state !== "closed" || !r.closedAt) continue;
      const closed = new Date(r.closedAt);
      if (closed.getTime() < twelveWeeksAgo) continue;
      const weekKey = toIsoWeekKey(closed);
      weekMap.set(weekKey, (weekMap.get(weekKey) || 0) + 1);
    }
    const throughputTrend = Array.from(weekMap.entries())
      .map(([week, issuesCompleted]) => ({ week, issuesCompleted }))
      .sort((a, b) => a.week.localeCompare(b.week));

    // 7. Aged Issues — open issues by age bucket
    const agedIssues = AGE_BUCKETS.map((b) => {
      const matching = rows.filter(
        (r) => r.state === "open" && bucketFor(ageHoursOf(r.createdAt), AGE_BUCKETS) === b.label
      );
      return {
        ageBucket: b.label,
        count: matching.length,
        issues: matching.map((r) => `#${r.issueIid}`).join(", "),
      };
    }).filter((b) => b.count > 0);

    return NextResponse.json({
      sprintVelocity,
      cycleTimeDistribution,
      workload,
      teamPerformance,
      statusDistribution,
      throughputTrend,
      agedIssues,
      sprintConfig: { sprintWeeks },
    });
  } catch (error) {
    console.error("Failed to fetch reports:", error);
    return NextResponse.json({ error: "Failed to fetch reports" }, { status: 500 });
  }
}
