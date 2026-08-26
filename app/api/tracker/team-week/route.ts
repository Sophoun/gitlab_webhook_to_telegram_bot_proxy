import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { userActivity, issueAnalytics, issueProgressHistory } from "@/db/schema";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { computeProgressDelivered } from "@/lib/progress-parser";
import { parseBoardLabels, WORKFLOW_STAGES } from "@/app/components/dashboard/review/types";

type PeriodType = "day" | "week" | "month";

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

async function fetchPeriodData(
  db: ReturnType<typeof getDb>,
  from: Date,
  to: Date,
  repoId: number | null
) {
  const mainFilter = repoId !== null ? eq(userActivity.gitlabProjectId, repoId) : undefined;

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
  const map = new Map<
    string,
    {
      username: string;
      name: string;
      issuesCreated: number;
      issuesClosed: number;
      mrsCreated: number;
      mrsMerged: number;
      commits: number;
      totalEvents: number;
      lastActivityAt: Date | null;
    }
  >();

  for (const r of rows) {
    const p =
      map.get(r.userUsername) ||
      {
        username: r.userUsername,
        name: r.userName,
        issuesCreated: 0,
        issuesClosed: 0,
        mrsCreated: 0,
        mrsMerged: 0,
        commits: 0,
        totalEvents: 0,
        lastActivityAt: null,
      };
    switch (r.activityType) {
      case "issue_created":
        p.issuesCreated++;
        break;
      case "issue_closed":
        p.issuesClosed++;
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
    }
    p.totalEvents++;
    const occurred = new Date(r.occurredAt);
    if (!p.lastActivityAt || occurred > p.lastActivityAt) {
      p.lastActivityAt = occurred;
    }
    map.set(r.userUsername, p);
  }

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
      mrsCreated: 0,
      mrsMerged: 0,
      commits: 0,
      totalEvents: 0,
      lastActivityAt: null,
    }));

  const seen = new Set<string>();
  const everyone: typeof people = [];
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

  const peopleWithProgress = everyone.map((p) => {
    const d = delivered.get(p.username);
    return {
      ...p,
      devProgressDelivered: d?.dev ?? 0,
      qaProgressDelivered: d?.qa ?? 0,
      progressDelivered: (d?.dev ?? 0) + (d?.qa ?? 0),
      lastActivityAt: p.lastActivityAt ? p.lastActivityAt.toISOString() : null,
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

    // Fetch previous period for deltas
    const prevRange = shiftRange(periodType, from, to, -1);
    const prevPeople = await fetchPeriodData(db, prevRange.from, prevRange.to, repoId);

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
      // Open tasks count toward the ASSIGNEE (who owns the work), not the
      // author (who created it). This is different from MRs where authorship
      // is the primary attribution.
      for (const a of (r.assigneeUsernames || "").split(",")) {
        const t = a.trim();
        if (t) credit(t, stage);
      }
    }

    // Fallback stages for issues without workflow labels (shown at bottom)
    const FALLBACK_STAGES = ["Opened", "Closed"];

    const result = peopleWithDeltas.map((p) => {
      const byStage = openTasksByStage.get(p.username) || {};
      const stages: Record<string, number> = {};
      // Workflow stages first (in Kanban order)
      for (const stage of WORKFLOW_STAGES) {
        if (byStage[stage]) stages[stage] = byStage[stage];
      }
      // Fallback stages last (Opened, Closed)
      for (const stage of FALLBACK_STAGES) {
        if (byStage[stage]) stages[stage] = byStage[stage];
      }
      return {
        ...p,
        openTaskCount: openTaskCount.get(p.username) || 0,
        openTasksByStage: stages,
      };
    });

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
