import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { userActivity, issueAnalytics, issueTasks, gitlabRepos } from "@/db/schema";
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
      })
      .from(issueAnalytics)
      .where(
        and(
          eq(issueAnalytics.state, "opened"),
          like(issueAnalytics.assigneeUsernames, `%${user.toLowerCase()}%`)
        )
      );

    const openTasks: Array<{
      gitlabProjectId: number;
      issueIid: number;
      issueTitle: string | null;
      issueUrl: string | null;
      projectName: string;
      boardStage: string;
      isAssignee: boolean;
      createdAt: string | null;
    }> = [];

    for (const r of openTaskRows) {
      const assignees = (r.assigneeUsernames || "").split(",").map((a) => a.trim());
      const isAssignee = assignees.includes(user.toLowerCase());
      if (!isAssignee) continue;
      openTasks.push({
        gitlabProjectId: r.gitlabProjectId,
        issueIid: r.issueIid,
        issueTitle: r.issueTitle,
        issueUrl: r.issueUrl,
        projectName: repoNames.get(r.gitlabProjectId) ?? String(r.gitlabProjectId),
        boardStage: parseBoardLabels(r.labels, "open").boardStage,
        isAssignee,
        createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : null,
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
