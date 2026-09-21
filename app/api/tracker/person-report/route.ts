import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { userActivity, issueAnalytics, issueProgressHistory, issueProgress, issueTasks, gitlabRepos } from "@/db/schema";
import { and, eq, gte, lte, asc, like } from "drizzle-orm";
import { parseBoardLabels } from "@/app/components/dashboard/review/types";

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
    const issueFilter =
      repoId !== null ? eq(issueAnalytics.gitlabProjectId, repoId) : undefined;

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

    // ---- Assignee-based issue lists ----
    // Issues are attributed to the person whose name is on the assignee
    // field — NOT who created or moved them.
    const repoNames = new Map(
      (await db.select({ id: gitlabRepos.id, name: gitlabRepos.name }).from(gitlabRepos))
        .map((r) => [r.id, r.name])
    );

    const userLower = user.toLowerCase();

    const assignedCreatedRows = await db
      .select({
        gitlabProjectId: issueAnalytics.gitlabProjectId,
        issueIid: issueAnalytics.issueIid,
        issueTitle: issueAnalytics.issueTitle,
        issueUrl: issueAnalytics.issueUrl,
        assigneeUsernames: issueAnalytics.assigneeUsernames,
        createdAt: issueAnalytics.createdAt,
      })
      .from(issueAnalytics)
      .where(
        and(
          gte(issueAnalytics.createdAt, from),
          lte(issueAnalytics.createdAt, to),
          like(issueAnalytics.assigneeUsernames, `%${userLower}%`),
          issueFilter
        )
      );

    const assignedClosedRows = await db
      .select({
        gitlabProjectId: issueAnalytics.gitlabProjectId,
        issueIid: issueAnalytics.issueIid,
        issueTitle: issueAnalytics.issueTitle,
        issueUrl: issueAnalytics.issueUrl,
        assigneeUsernames: issueAnalytics.assigneeUsernames,
        closedAt: issueAnalytics.closedAt,
      })
      .from(issueAnalytics)
      .where(
        and(
          gte(issueAnalytics.closedAt, from),
          lte(issueAnalytics.closedAt, to),
          like(issueAnalytics.assigneeUsernames, `%${userLower}%`),
          issueFilter
        )
      );

    const isAssignee = (assignees: string | null): boolean =>
      (assignees || "")
        .split(",")
        .map((a) => a.trim())
        .includes(userLower);

    const toAssignedItem = (
      r: { gitlabProjectId: number; issueIid: number; issueTitle: string | null; issueUrl: string | null },
      occurredAt: Date
    ) => ({
      itemIid: r.issueIid,
      itemTitle: r.issueTitle,
      itemUrl: r.issueUrl,
      projectName: repoNames.get(r.gitlabProjectId) ?? String(r.gitlabProjectId),
      occurredAt: occurredAt.toISOString(),
    });

    // Closed issues first, so we can deduplicate Created against them
    const closedIssues = assignedClosedRows
      .filter((r) => isAssignee(r.assigneeUsernames))
      .map((r) => toAssignedItem(r, new Date(r.closedAt!)));

    // Created issues: exclude any that also appear in Closed (same project+iid)
    // so issues the person both created AND closed only show under "Closed"
    const closedSet = new Set(closedIssues.map((i) => `${i.projectName}-${i.itemIid}`));
    const createdIssues = assignedCreatedRows
      .filter((r) => isAssignee(r.assigneeUsernames))
      .map((r) => toAssignedItem(r, new Date(r.createdAt)))
      .filter((i) => !closedSet.has(`${i.projectName}-${i.itemIid}`));

    // ---- Summary counts ----
    const count = (type: string): number =>
      rows.filter((r) => r.activityType === type).length;

    const summary = {
      issuesCreated: createdIssues.length,
      issuesClosed: closedIssues.length,
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

    // ---- Open tasks across ALL projects ----
    // Every open issue in any synced repo where the person is an assignee —
    // the full cross-project workload, not just the main board.
    // Attribution is assignee-only: issues the person merely created (but is
    // not assigned to) are NOT included.
    // LIKE is only a prefilter; assignees are comma-separated so an exact
    // token check in JS prevents partial-username matches.
    const openTaskRows = await db
      .select({
        gitlabProjectId: issueAnalytics.gitlabProjectId,
        issueIid: issueAnalytics.issueIid,
        issueTitle: issueAnalytics.issueTitle,
        issueUrl: issueAnalytics.issueUrl,
        labels: issueAnalytics.labels,
        assigneeUsernames: issueAnalytics.assigneeUsernames,
        createdAt: issueAnalytics.createdAt,
        weight: issueAnalytics.weight,
        stageEnteredAt: issueAnalytics.stageEnteredAt,
        inProgressAt: issueAnalytics.inProgressAt,
      })
      .from(issueAnalytics)
      .where(
        and(
          eq(issueAnalytics.state, "opened"),
          like(issueAnalytics.assigneeUsernames, `%${user.toLowerCase()}%`)
        )
      );

    // ---- Earliest /dev timestamp per issue (start date) ----
    const devHistoryRows = await db
      .select({
        gitlabProjectId: issueProgressHistory.gitlabProjectId,
        issueIid: issueProgressHistory.issueIid,
        occurredAt: issueProgressHistory.occurredAt,
      })
      .from(issueProgressHistory)
      .where(eq(issueProgressHistory.stage, "dev"))
      .orderBy(issueProgressHistory.occurredAt);
    const startDateByKey = new Map<string, Date>();
    for (const h of devHistoryRows) {
      const key = `${h.gitlabProjectId}:${h.issueIid}`;
      if (!startDateByKey.has(key)) {
        startDateByKey.set(key, h.occurredAt);
      }
    }

    // ---- Fetch progress values (set via /dev, /test, /uat comment commands) ----
    const progressRows = await db.select().from(issueProgress);
    const progressByKey = new Map<string, { dev: number | null; qa: number | null }>();
    for (const p of progressRows) {
      const key = `${p.gitlabProjectId}:${p.issueIid}`;
      const current = progressByKey.get(key) ?? { dev: null, qa: null };
      if (p.stage === "dev") current.dev = p.progress;
      else if (p.stage === "qa") current.qa = p.progress;
      progressByKey.set(key, current);
    }

    const openTasks: Array<{
      gitlabProjectId: number;
      issueIid: number;
      issueTitle: string | null;
      issueUrl: string | null;
      projectName: string;
      boardStage: string;
      priority: string;
      devProgress: number | null;
      qaProgress: number | null;
      isAssignee: boolean;
      createdAt: string | null;
      weight: number | null;
      stageEnteredAt: string | null;
      startDate: number | null;
      inProgressAt: number | null;
    }> = [];

    for (const r of openTaskRows) {
      const assignees = (r.assigneeUsernames || "").split(",").map((a) => a.trim());
      const isAssignee = assignees.includes(user.toLowerCase());
      if (!isAssignee) continue;
      const board = parseBoardLabels(r.labels, "open");
      const prog = progressByKey.get(`${r.gitlabProjectId}:${r.issueIid}`) ?? { dev: null, qa: null };
      openTasks.push({
        gitlabProjectId: r.gitlabProjectId,
        issueIid: r.issueIid,
        issueTitle: r.issueTitle,
        issueUrl: r.issueUrl,
        projectName: repoNames.get(r.gitlabProjectId) ?? String(r.gitlabProjectId),
        boardStage: board.boardStage,
        priority: board.priority ?? "",
        devProgress: prog.dev,
        qaProgress: prog.qa,
        isAssignee,
        createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : null,
        weight: r.weight ?? null,
        stageEnteredAt:
          board.boardStage === "In Progress" && r.stageEnteredAt
            ? new Date(r.stageEnteredAt).toISOString()
            : null,
        startDate: startDateByKey.get(`${r.gitlabProjectId}:${r.issueIid}`)?.getTime() ?? null,
        inProgressAt: r.inProgressAt ? new Date(r.inProgressAt).getTime() : null,
      });
    }
    openTasks.sort((a, b) => a.issueIid - b.issueIid);

    // Fetch assigned checklist tasks from issue descriptions
    const taskRows = await db
      .select({
        gitlabProjectId: issueTasks.gitlabProjectId,
        issueIid: issueTasks.issueIid,
        taskText: issueTasks.taskText,
        isCompleted: issueTasks.isCompleted,
      })
      .from(issueTasks)
      .where(eq(issueTasks.assigneeUsername, user.toLowerCase()));

    const assignedTasks = taskRows.map((t) => ({
      gitlabProjectId: t.gitlabProjectId,
      issueIid: t.issueIid,
      taskText: t.taskText,
      isCompleted: !!t.isCompleted,
    }));

    return NextResponse.json({
      user: { username: user, name: displayName },
      range: { from: from.toISOString(), to: to.toISOString() },
      summary,
      createdIssues,
      closedIssues,
      reopenedIssues: byType("issue_reopened"),
      commentedOn,
      createdMrs: byType("mr_created"),
      mergedMrs: byType("mr_merged"),
      commits: byType("commit"),
      openTasks,
      assignedTasks,
      dailyActivity,
    });
  } catch (error) {
    console.error("Failed to fetch person report:", error);
    return NextResponse.json({ error: "Failed to fetch person report" }, { status: 500 });
  }
}
