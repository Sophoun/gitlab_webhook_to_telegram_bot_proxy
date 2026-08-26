import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { userActivity, issueAnalytics, issueProgressHistory } from "@/db/schema";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { computeProgressDelivered } from "@/lib/progress-parser";
import { parseBoardLabels, WORKFLOW_STAGES } from "@/app/components/dashboard/review/types";

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

    // Scope semantics:
    // - `repo=<gitlab_project_id>` → that single repo (squad drill-down)
    // - no repo param → ALL repos, so the main view shows each person's total
    //   work (most coding happens in child repos, not the management repo)
    const repoParam = searchParams.get("repo");
    const repoId = repoParam && !isNaN(parseInt(repoParam)) ? parseInt(repoParam) : null;
    const mainFilter =
      repoId !== null ? eq(userActivity.gitlabProjectId, repoId) : undefined;

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
    // GROUP BY username (not DISTINCT on the pair): the same person can appear
    // under name variants across repos, which would produce duplicate keys.
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
      }));
    // Defensive: guarantee unique usernames in the response (React keys and
    // per-person lookups depend on it)
    const seen = new Set<string>();
    const everyone: typeof people = [];
    for (const p of [...people, ...inactive]) {
      if (seen.has(p.username)) continue;
      seen.add(p.username);
      everyone.push(p);
    }

    // ---- Progress delivered per person ----
    // Full history is fetched so deltas are computed against prior values;
    // crediting is limited to the selected period (see computeProgressDelivered).
    // Scoped to the same repo selection as the activity query.
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
      };
    });

    // ---- Open tasks per person across ALL projects ----
    // Every open issue in any synced repo where the person is author or
    // assignee, counted total and per board stage. LIKE is only a prefilter;
    // the exact comma-token check below prevents partial-username matches.
    const openRows = await db
      .select({
        labels: issueAnalytics.labels,
        authorUsername: issueAnalytics.authorUsername,
        assigneeUsernames: issueAnalytics.assigneeUsernames,
      })
      .from(issueAnalytics)
      // Raw GitLab state value — "opened", not "open"
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
      credit(r.authorUsername, stage);
      for (const a of (r.assigneeUsernames || "").split(",")) {
        const t = a.trim();
        if (t && t !== r.authorUsername) credit(t, stage);
      }
    }

    const peopleWithOpenTasks = peopleWithProgress.map((p) => {
      const byStage = openTasksByStage.get(p.username) || {};
      // Only keep stages that exist on the workflow so unknown labels
      // ("No Stage") don't render as mystery chips
      const stages: Record<string, number> = {};
      for (const stage of WORKFLOW_STAGES) {
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
      people: peopleWithOpenTasks,
    });
  } catch (error) {
    console.error("Failed to fetch team week:", error);
    return NextResponse.json({ error: "Failed to fetch team week" }, { status: 500 });
  }
}
