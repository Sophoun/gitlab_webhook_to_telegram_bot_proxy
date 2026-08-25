import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { userActivity, projects, issueProgressHistory } from "@/db/schema";
import { and, eq, gte, lte, inArray, sql } from "drizzle-orm";
import { computeProgressDelivered } from "@/lib/progress-parser";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");

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

    // Main projects only (each config's mgmt_id)
    const projectRows = await db.select({ mgmtId: projects.mgmtId }).from(projects);
    const mainProjectIds = projectRows
      .map((p) => parseInt(p.mgmtId))
      .filter((n) => !isNaN(n));
    // Main projects only by default; `repo=<gitlab_project_id>` re-scopes to
    // a single repo (e.g. a child project with its own team).
    const repoParam = searchParams.get("repo");
    const repoId = repoParam && !isNaN(parseInt(repoParam)) ? parseInt(repoParam) : null;
    const mainFilter =
      repoId !== null
        ? eq(userActivity.gitlabProjectId, repoId)
        : mainProjectIds.length > 0
          ? inArray(userActivity.gitlabProjectId, mainProjectIds)
          : sql`0`;

    const rows = await db
      .select({
        userUsername: userActivity.userUsername,
        userName: userActivity.userName,
        activityType: userActivity.activityType,
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
        comments: number;
        mrsCreated: number;
        mrsMerged: number;
        commits: number;
        totalEvents: number;
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
          comments: 0,
          mrsCreated: 0,
          mrsMerged: 0,
          commits: 0,
          totalEvents: 0,
        };
      switch (r.activityType) {
        case "issue_created":
          p.issuesCreated++;
          break;
        case "issue_closed":
          p.issuesClosed++;
          break;
        case "issue_comment":
        case "mr_comment":
          p.comments++;
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
      map.set(r.userUsername, p);
    }

    const people = Array.from(map.values()).sort(
      (a, b) => b.totalEvents - a.totalEvents
    );

    // ---- Include EVERYONE ever seen in this scope, even with no activity ----
    // Members without events in the period still appear (zero-filled) so the
    // roster is complete for performance review.
    const allUsers = await db
      .selectDistinct({
        username: userActivity.userUsername,
        name: userActivity.userName,
      })
      .from(userActivity)
      .where(mainFilter);

    const known = new Set(people.map((p) => p.username));
    const inactive = allUsers
      .filter((u) => u.username && !known.has(u.username))
      .map((u) => ({
        username: u.username,
        name: u.name,
        issuesCreated: 0,
        issuesClosed: 0,
        comments: 0,
        mrsCreated: 0,
        mrsMerged: 0,
        commits: 0,
        totalEvents: 0,
      }));
    const everyone = [...people, ...inactive];

    // ---- Progress delivered per person ----
    // Full history is fetched so deltas are computed against prior values;
    // crediting is limited to the selected period (see computeProgressDelivered).
    // Scoped to the same repo selection as the activity query.
    const historyFilter =
      repoId !== null
        ? eq(issueProgressHistory.gitlabProjectId, repoId)
        : mainProjectIds.length > 0
          ? inArray(issueProgressHistory.gitlabProjectId, mainProjectIds)
          : sql`0`;
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
      };
    });

    return NextResponse.json({
      range: { from: from.toISOString(), to: to.toISOString() },
      people: peopleWithProgress,
    });
  } catch (error) {
    console.error("Failed to fetch team week:", error);
    return NextResponse.json({ error: "Failed to fetch team week" }, { status: 500 });
  }
}
