import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { userActivity } from "@/db/schema";
import { and, eq, gte, lte, asc } from "drizzle-orm";

interface ActivityRow {
  activityType: string;
  itemIid: number;
  itemTitle: string | null;
  itemUrl: string | null;
  projectName: string;
  occurredAt: Date;
}

function defaultWeek(): { from: Date; to: Date } {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Monday
  const from = new Date(now);
  from.setDate(diff);
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(from.getDate() + 7); // exclusive end: next Monday
  return { from, to };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const user = searchParams.get("user");
    if (!user) {
      return NextResponse.json({ error: "user is required" }, { status: 400 });
    }

    let from: Date;
    let to: Date;
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");
    if (fromParam && toParam) {
      from = new Date(fromParam);
      to = new Date(toParam);
      if (isNaN(from.getTime()) || isNaN(to.getTime()) || from >= to) {
        return NextResponse.json({ error: "invalid date range" }, { status: 400 });
      }
    } else {
      ({ from, to } = defaultWeek());
    }

    const db = getDb();

    // Scope semantics:
    // - `repo=<gitlab_project_id>` → that single repo (squad drill-down)
    // - no repo param → ALL repos, matching team-week so expanded details
    //   always match the table numbers
    const repoParam = searchParams.get("repo");
    const repoId = repoParam && !isNaN(parseInt(repoParam)) ? parseInt(repoParam) : null;
    const mainFilter =
      repoId !== null ? eq(userActivity.gitlabProjectId, repoId) : undefined;

    const rows: ActivityRow[] = await db
      .select({
        activityType: userActivity.activityType,
        itemIid: userActivity.itemIid,
        itemTitle: userActivity.itemTitle,
        itemUrl: userActivity.itemUrl,
        projectName: userActivity.projectName,
        occurredAt: userActivity.occurredAt,
      })
      .from(userActivity)
      .where(
        and(
          eq(userActivity.userUsername, user),
          gte(userActivity.occurredAt, from),
          lte(userActivity.occurredAt, to),
          mainFilter
        )
      )
      .orderBy(asc(userActivity.occurredAt));

    const displayName =
      (
        await db
          .select({ name: userActivity.userName })
          .from(userActivity)
          .where(eq(userActivity.userUsername, user))
          .limit(1)
      )[0]?.name ?? user;

    // ---- Summary counts ----
    const count = (type: string): number =>
      rows.filter((r) => r.activityType === type).length;

    const summary = {
      issuesCreated: count("issue_created"),
      issuesClosed: count("issue_closed"),
      issuesReopened: count("issue_reopened"),
      issueComments: count("issue_comment"),
      mrsCreated: count("mr_created"),
      mrsMerged: count("mr_merged"),
      mrsClosed: count("mr_closed"),
      mrComments: count("mr_comment"),
      commits: count("commit"),
      totalEvents: rows.length,
    };

    // ---- Itemized lists ----
    const toItem = (r: ActivityRow) => ({
      itemIid: r.itemIid,
      itemTitle: r.itemTitle,
      itemUrl: r.itemUrl,
      projectName: r.projectName,
      occurredAt: new Date(r.occurredAt).toISOString(),
    });

    const byType = (type: string) => rows.filter((r) => r.activityType === type).map(toItem);

    // Commented-on: dedupe by project+iid across issue & MR comments
    const seenComments = new Set<string>();
    const commentedOn = rows
      .filter((r) => r.activityType === "issue_comment" || r.activityType === "mr_comment")
      .filter((r) => {
        const key = `${r.projectName}-${r.itemIid}`;
        if (seenComments.has(key)) return false;
        seenComments.add(key);
        return true;
      })
      .map(toItem);

    // ---- Daily breakdown ----
    const dailyMap = new Map<string, number>();
    for (let d = new Date(from); d < to; d.setDate(d.getDate() + 1)) {
      dailyMap.set(d.toISOString().slice(0, 10), 0);
    }
    for (const r of rows) {
      const key = new Date(r.occurredAt).toISOString().slice(0, 10);
      dailyMap.set(key, (dailyMap.get(key) || 0) + 1);
    }
    const dailyActivity = Array.from(dailyMap.entries()).map(([date, events]) => ({
      date,
      events,
    }));

    return NextResponse.json({
      user: { username: user, name: displayName },
      range: { from: from.toISOString(), to: to.toISOString() },
      summary,
      createdIssues: byType("issue_created"),
      closedIssues: byType("issue_closed"),
      reopenedIssues: byType("issue_reopened"),
      commentedOn,
      createdMrs: byType("mr_created"),
      mergedMrs: byType("mr_merged"),
      commits: byType("commit"),
      dailyActivity,
    });
  } catch (error) {
    console.error("Failed to fetch person report:", error);
    return NextResponse.json({ error: "Failed to fetch person report" }, { status: 500 });
  }
}
