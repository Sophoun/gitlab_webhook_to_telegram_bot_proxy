import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { userActivity, issueAnalytics, issueProgressHistory } from "@/db/schema";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { computeProgressDelivered } from "@/lib/progress-parser";
import { parseBoardLabels, WORKFLOW_STAGES, FALLBACK_STAGES } from "@/app/components/dashboard/review/types";
import { calculatePerformanceScore } from "@/lib/performance-score";

type PeriodType = "day" | "week" | "month" | "custom";

function shiftRange(type: PeriodType, from: Date, to: Date, delta: number): { from: Date; to: Date } {
  const nf = new Date(from);
  const nt = new Date(to);
  if (type === "day") {
    nf.setDate(nf.getDate() + delta);
    nt.setDate(nt.getDate() + delta);
  } else if (type === "week") {
    nf.setDate(nf.getDate() + delta * 7);
    nt.setDate(nt.getDate() + delta * 7);
  } else {
    nf.setMonth(nf.getMonth() + delta);
    nt.setMonth(nt.getMonth() + delta);
  }
  return { from: nf, to: nt };
}

interface PersonAggregate {
  username: string;
  name: string;
  issuesCreated: number;
  issuesClosed: number;
  issuesReopened: number;
  mrsCreated: number;
  mrsMerged: number;
  commits: number;
  issueComments: number;
  mrComments: number;
  totalEvents: number;
  activeDays: Set<string>;
  lastActivityAt: Date | null;
}

async function fetchPeriodData(
  db: ReturnType<typeof getDb>,
  from: Date,
  to: Date,
  repoId: number | null
) {
  const mainFilter = repoId !== null ? eq(userActivity.gitlabProjectId, repoId) : undefined;
  const issueFilter = repoId !== null ? eq(issueAnalytics.gitlabProjectId, repoId) : undefined;

  const rows = await db
    .select({
      userUsername: userActivity.userUsername,
      userName: userActivity.userName,
      activityType: userActivity.activityType,
      occurredAt: userActivity.occurredAt,
    })
    .from(userActivity)
    .where(
      and(
        gte(userActivity.occurredAt, from),
        lte(userActivity.occurredAt, to),
        mainFilter
      )
    );

  // Aggregate per person
  const map = new Map<string, PersonAggregate>();

  for (const r of rows) {
    let p = map.get(r.userUsername);
    if (!p) {
      p = {
        username: r.userUsername,
        name: r.userName,
        issuesCreated: 0,
        issuesClosed: 0,
        issuesReopened: 0,
        mrsCreated: 0,
        mrsMerged: 0,
        commits: 0,
        issueComments: 0,
        mrComments: 0,
        totalEvents: 0,
        activeDays: new Set(),
        lastActivityAt: null,
      };
      map.set(r.userUsername, p);
    }
    switch (r.activityType) {
      case "issue_reopened":
        p.issuesReopened++;
        break;
      case "mr_created":
        p.mrsCreated++;
        break;
      case "mr_merged":
        p.mrsMerged++;
        break;
      case "commit":
        p.commits++;
        break;
      case "issue_comment":
        p.issueComments++;
        break;
      case "mr_comment":
        p.mrComments++;
        break;
    }
    p.totalEvents++;
    const occurred = new Date(r.occurredAt);
    // Track active days for consistency metric
    const dayKey = occurred.toISOString().slice(0, 10);
    p.activeDays.add(dayKey);
    if (!p.lastActivityAt || occurred > p.lastActivityAt) {
      p.lastActivityAt = occurred;
    }
    map.set(r.userUsername, p);
  }

  // Assignee-based issue counts: issues are attributed to the person whose
  // name is on the assignee field — NOT who created or moved them.
  const createdIssueRows = await db
    .select({ assigneeUsernames: issueAnalytics.assigneeUsernames })
    .from(issueAnalytics)
    .where(
      and(
        gte(issueAnalytics.createdAt, from),
        lte(issueAnalytics.createdAt, to),
        issueFilter
      )
    );

  const closedIssueRows = await db
    .select({ assigneeUsernames: issueAnalytics.assigneeUsernames })
    .from(issueAnalytics)
    .where(
      and(
        gte(issueAnalytics.closedAt, from),
        lte(issueAnalytics.closedAt, to),
        issueFilter
      )
    );

  const assigneeCreated = new Map<string, number>();
  const assigneeClosed = new Map<string, number>();
  const credit = (target: Map<string, number>, assignees: string | null) => {
    for (const a of (assignees || "").split(",")) {
      const t = a.trim();
      if (t) target.set(t, (target.get(t) || 0) + 1);
    }
  };
  for (const r of createdIssueRows) credit(assigneeCreated, r.assigneeUsernames);
  for (const r of closedIssueRows) credit(assigneeClosed, r.assigneeUsernames);

  const people = Array.from(map.values()).sort(
    (a, b) => b.totalEvents - a.totalEvents
  );

  // Include everyone ever seen, even with no activity
  const allUsers = await db
    .select({
      username: userActivity.userUsername,
      name: sql<string>`max(${userActivity.userName})`,
    })
    .from(userActivity)
    .where(mainFilter)
    .groupBy(userActivity.userUsername);

  const known = new Set(people.map((p) => p.username));
  const inactive = allUsers
    .filter((u) => u.username && !known.has(u.username))
    .map((u) => ({
      username: u.username,
      name: u.name,
      issuesCreated: 0,
      issuesClosed: 0,
      issuesReopened: 0,
      mrsCreated: 0,
      mrsMerged: 0,
      commits: 0,
      issueComments: 0,
      mrComments: 0,
      totalEvents: 0,
      activeDays: new Set<string>(),
      lastActivityAt: null,
    }));

  const seen = new Set<string>();
  const everyone: PersonAggregate[] = [];
  for (const p of [...people, ...inactive]) {
    if (seen.has(p.username)) continue;
    seen.add(p.username);
    everyone.push(p);
  }

  // Progress delivered
  const historyFilter =
    repoId !== null ? eq(issueProgressHistory.gitlabProjectId, repoId) : undefined;
  const historyRows = await db
    .select({
      gitlabProjectId: issueProgressHistory.gitlabProjectId,
      issueIid: issueProgressHistory.issueIid,
      stage: issueProgressHistory.stage,
      progress: issueProgressHistory.progress,
      updatedBy: issueProgressHistory.updatedBy,
      occurredAt: issueProgressHistory.occurredAt,
    })
    .from(issueProgressHistory)
    .where(historyFilter);

  const delivered = computeProgressDelivered(
    historyRows.map((h) => ({ ...h, occurredAt: new Date(h.occurredAt) })),
    from,
    to
  );

  // Compute period length for consistency metric
  const totalDays = Math.max(1, Math.ceil((to.getTime() - from.getTime()) / 86_400_000));

  const peopleWithProgress = everyone.map((p) => {
    const d = delivered.get(p.username);
    const daysActive = p.activeDays.size;
    return {
      username: p.username,
      name: p.name,
      issuesCreated: assigneeCreated.get(p.username) || 0,
      issuesClosed: assigneeClosed.get(p.username) || 0,
      issuesReopened: p.issuesReopened,
      mrsCreated: p.mrsCreated,
      mrsMerged: p.mrsMerged,
      commits: p.commits,
      issueComments: p.issueComments,
      mrComments: p.mrComments,
      totalComments: p.issueComments + p.mrComments,
      totalEvents: p.totalEvents,
      devProgressDelivered: d?.dev ?? 0,
      qaProgressDelivered: d?.qa ?? 0,
      progressDelivered: (d?.dev ?? 0) + (d?.qa ?? 0),
      lastActivityAt: p.lastActivityAt ? p.lastActivityAt.toISOString() : null,
      daysActive,
      totalDays,
      consistency: totalDays > 0 ? Math.round((daysActive / totalDays) * 100) : 0,
    };
  });

  return peopleWithProgress;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");
    const periodType = (searchParams.get("period") || "week") as PeriodType;

    let from: Date;
    let to: Date;
    if (fromParam && toParam) {
      from = new Date(fromParam);
      to = new Date(toParam);
      if (isNaN(from.getTime()) || isNaN(to.getTime()) || from >= to) {
        return NextResponse.json({ error: "invalid date range" }, { status: 400 });
      }
    } else {
      const now = new Date();
      const day = now.getDay();
      from = new Date(now);
      from.setDate(now.getDate() - day + (day === 0 ? -6 : 1)); // Monday
      from.setHours(0, 0, 0, 0);
      to = new Date(from);
      to.setDate(from.getDate() + 7);
    }

    const db = getDb();

    const repoParam = searchParams.get("repo");
    const repoId = repoParam && !isNaN(parseInt(repoParam)) ? parseInt(repoParam) : null;

    // Fetch current period
    const currentPeople = await fetchPeriodData(db, from, to, repoId);

    // Fetch previous period for deltas (skip for custom ranges — no meaningful prev)
    let prevPeople = currentPeople;
    let prevRange = { from, to };
    if (periodType !== "custom") {
      prevRange = shiftRange(periodType, from, to, -1);
      prevPeople = await fetchPeriodData(db, prevRange.from, prevRange.to, repoId);
    }

    // Build a lookup for previous period deltas
    const prevMap = new Map<string, (typeof prevPeople)[number]>();
    for (const p of prevPeople) prevMap.set(p.username, p);

    // Annotate current with deltas
    const peopleWithDeltas = currentPeople.map((p) => {
      const prev = prevMap.get(p.username);
      return {
        ...p,
        prevCommits: prev?.commits ?? 0,
        prevMrsMerged: prev?.mrsMerged ?? 0,
        prevIssuesClosed: prev?.issuesClosed ?? 0,
        prevTotalEvents: prev?.totalEvents ?? 0,
      };
    });

    // Open tasks per person across ALL projects
    const openRows = await db
      .select({
        labels: issueAnalytics.labels,
        authorUsername: issueAnalytics.authorUsername,
        assigneeUsernames: issueAnalytics.assigneeUsernames,
      })
      .from(issueAnalytics)
      .where(eq(issueAnalytics.state, "opened"));

    const openTaskCount = new Map<string, number>();
    const openTasksByStage = new Map<string, Record<string, number>>();
    const credit = (username: string, stage: string) => {
      if (!username) return;
      openTaskCount.set(username, (openTaskCount.get(username) || 0) + 1);
      const stages = openTasksByStage.get(username) || {};
      stages[stage] = (stages[stage] || 0) + 1;
      openTasksByStage.set(username, stages);
    };
    for (const r of openRows) {
      const stage = parseBoardLabels(r.labels, "open").boardStage;
      for (const a of (r.assigneeUsernames || "").split(",")) {
        const t = a.trim();
        if (t) credit(t, stage);
      }
    }

    // Quality metrics per person from issueAnalytics (avg cycle time, avg first response)
    const qualityRows = await db
      .select({
        assigneeUsernames: issueAnalytics.assigneeUsernames,
        timeToCloseHours: issueAnalytics.timeToCloseHours,
        timeToFirstResponseHours: issueAnalytics.timeToFirstResponseHours,
        state: issueAnalytics.state,
      })
      .from(issueAnalytics);

    // Aggregate quality metrics per person
    const qualityMap = new Map<string, { closeTimes: number[]; responseTimes: number[] }>();
    for (const r of qualityRows) {
      for (const a of (r.assigneeUsernames || "").split(",")) {
        const t = a.trim();
        if (!t) continue;
        if (!qualityMap.has(t)) qualityMap.set(t, { closeTimes: [], responseTimes: [] });
        const q = qualityMap.get(t)!;
        if (r.timeToCloseHours != null && r.state === "closed") {
          q.closeTimes.push(r.timeToCloseHours);
        }
        if (r.timeToFirstResponseHours != null) {
          q.responseTimes.push(r.timeToFirstResponseHours);
        }
      }
    }

    const avg = (arr: number[]): number | null => {
      if (arr.length === 0) return null;
      return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
    };

    const result = peopleWithDeltas
      .map((p) => {
        const byStage = openTasksByStage.get(p.username) || {};
        const stages: Record<string, number> = {};
        for (const stage of WORKFLOW_STAGES) {
          if (byStage[stage]) stages[stage] = byStage[stage];
        }
        for (const stage of FALLBACK_STAGES) {
          if (byStage[stage]) stages[stage] = byStage[stage];
        }
        const quality = qualityMap.get(p.username);
        return {
          ...p,
          openTaskCount: openTaskCount.get(p.username) || 0,
          openTasksByStage: stages,
          avgCycleTimeHours: quality ? avg(quality.closeTimes) : null,
          avgFirstResponseHours: quality ? avg(quality.responseTimes) : null,
        };
      })
      // Only show people with activity in the period OR open tasks assigned
      .filter((p) => p.totalEvents > 0 || p.openTaskCount > 0)
      .map((p) => {
        const perf = calculatePerformanceScore({
          issuesCreated: p.issuesCreated,
          issuesClosed: p.issuesClosed,
          mrsCreated: p.mrsCreated,
          mrsMerged: p.mrsMerged,
          commits: p.commits,
          totalEvents: p.totalEvents,
          progressDelivered: p.progressDelivered,
          openTaskCount: p.openTaskCount,
          avgCycleTimeHours: p.avgCycleTimeHours,
          avgFirstResponseHours: p.avgFirstResponseHours,
          totalComments: p.totalComments,
        });
        return {
          ...p,
          performanceScore: perf.score,
          performanceGrade: perf.grade,
          performanceRole: perf.role,
        };
      });

    // Fill in all-time lastActivityAt for people with no period activity
    const needsLastActive = result.filter((p) => !p.lastActivityAt);
    if (needsLastActive.length > 0) {
      const usernames = needsLastActive.map((p) => p.username);
      const lastRows = await db
        .select({
          userUsername: userActivity.userUsername,
          lastAt: sql<string>`max(${userActivity.occurredAt})`,
        })
        .from(userActivity)
        .where(sql`${userActivity.userUsername} IN ${usernames}`)
        .groupBy(userActivity.userUsername);
      const lastMap = new Map<string, string>();
      for (const r of lastRows) lastMap.set(r.userUsername, r.lastAt);
      for (const p of result) {
        if (!p.lastActivityAt && lastMap.has(p.username)) {
          const val = lastMap.get(p.username)!;
          p.lastActivityAt = typeof val === "string" ? val : String(val);
        }
      }
    }

    return NextResponse.json({
      range: { from: from.toISOString(), to: to.toISOString() },
      prevRange: { from: prevRange.from.toISOString(), to: prevRange.to.toISOString() },
      people: result,
    });
  } catch (error) {
    console.error("Failed to fetch team week:", error);
    return NextResponse.json({ error: "Failed to fetch team week" }, { status: 500 });
  }
}
