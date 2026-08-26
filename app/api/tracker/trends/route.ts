import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { userActivity } from "@/db/schema";
import { and, eq, gte, lte, sql, type SQL } from "drizzle-orm";

/**
 * Weekly trend data for charts.
 *
 * GET /api/tracker/trends?weeks=12&repo=<gitlab_project_id>&user=<username>
 *
 * Returns:
 * - weeks[]: per-week totals (issues created/closed, MRs merged, commits)
 * - people[]: per-person weekly commits + merged MRs (everyone ever seen,
 *   zero-filled so the roster is stable across weeks)
 *
 * Weeks are Monday-start, oldest first, current (partial) week included.
 */

interface WeekBucket {
  weekStart: Date;
  issuesCreated: number;
  issuesClosed: number;
  mrsMerged: number;
  commits: number;
}

function mondayStart(d: Date): Date {
  const nd = new Date(d);
  const day = nd.getDay();
  nd.setDate(nd.getDate() - day + (day === 0 ? -6 : 1));
  nd.setHours(0, 0, 0, 0);
  return nd;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const weeksParam = parseInt(searchParams.get("weeks") || "12");
    const weekCount =
      !isNaN(weeksParam) && weeksParam >= 1 && weeksParam <= 52 ? weeksParam : 12;
    const userParam = searchParams.get("user");

    const repoParam = searchParams.get("repo");
    const repoId =
      repoParam && !isNaN(parseInt(repoParam)) ? parseInt(repoParam) : null;

    // Range: N complete past weeks + the current (partial) week
    const thisWeek = mondayStart(new Date());
    const rangeStart = new Date(thisWeek);
    rangeStart.setDate(rangeStart.getDate() - (weekCount - 1) * 7);
    const rangeEnd = new Date(thisWeek);
    rangeEnd.setDate(rangeEnd.getDate() + 7);

    const db = getDb();

    // Scope semantics match team-week: repo param → single repo, otherwise all
    const filters: SQL[] = [
      gte(userActivity.occurredAt, rangeStart),
      lte(userActivity.occurredAt, rangeEnd),
    ];
    if (repoId !== null) filters.push(eq(userActivity.gitlabProjectId, repoId));
    if (userParam) filters.push(eq(userActivity.userUsername, userParam.toLowerCase()));

    const rows = await db
      .select({
        userUsername: userActivity.userUsername,
        userName: sqlName(),
        activityType: userActivity.activityType,
        occurredAt: userActivity.occurredAt,
      })
      .from(userActivity)
      .where(and(...filters));

    // Bucket rows into weeks
    const weekStarts: Date[] = [];
    for (let i = 0; i < weekCount; i++) {
      const w = new Date(rangeStart);
      w.setDate(w.getDate() + i * 7);
      weekStarts.push(w);
    }
    const weekIndex = new Map<string, number>();
    weekStarts.forEach((w, i) => weekIndex.set(w.toISOString().slice(0, 10), i));

    const buckets: WeekBucket[] = weekStarts.map((weekStart) => ({
      weekStart,
      issuesCreated: 0,
      issuesClosed: 0,
      mrsMerged: 0,
      commits: 0,
    }));

    // Per-person weekly counters
    const people = new Map<
      string,
      { username: string; name: string; commits: number[]; mrsMerged: number[] }
    >();

    for (const r of rows) {
      const idx = weekIndex.get(mondayStart(new Date(r.occurredAt)).toISOString().slice(0, 10));
      if (idx === undefined) continue;

      buckets[idx][activityColumn(r.activityType)]++;

      if (r.userUsername) {
        let p = people.get(r.userUsername);
        if (!p) {
          p = {
            username: r.userUsername,
            name: r.userName,
            commits: new Array(weekCount).fill(0),
            mrsMerged: new Array(weekCount).fill(0),
          };
          people.set(r.userUsername, p);
        }
        if (r.activityType === "commit") p.commits[idx]++;
        else if (r.activityType === "mr_merged") p.mrsMerged[idx]++;
      }
    }

    const peopleArray = Array.from(people.values()).sort(
      (a, b) =>
        b.commits.reduce((x, y) => x + y, 0) + b.mrsMerged.reduce((x, y) => x + y, 0) -
        (a.commits.reduce((x, y) => x + y, 0) + a.mrsMerged.reduce((x, y) => x + y, 0))
    );

    return NextResponse.json({
      weeks: buckets.map((b) => ({
        weekStart: b.weekStart.toISOString(),
        issuesCreated: b.issuesCreated,
        issuesClosed: b.issuesClosed,
        mrsMerged: b.mrsMerged,
        commits: b.commits,
      })),
      people: peopleArray,
    });
  } catch (error) {
    console.error("Failed to fetch trends:", error);
    return NextResponse.json({ error: "Failed to fetch trends" }, { status: 500 });
  }
}

function activityColumn(type: string): keyof WeekBucket {
  switch (type) {
    case "issue_created":
      return "issuesCreated";
    case "issue_closed":
      return "issuesClosed";
    case "mr_merged":
      return "mrsMerged";
    case "commit":
      return "commits";
    default:
      return "issuesCreated"; // neutral bucket; other types aren't charted
  }
}

function sqlName() {
  return sql<string>`max(${userActivity.userName})`;
}
