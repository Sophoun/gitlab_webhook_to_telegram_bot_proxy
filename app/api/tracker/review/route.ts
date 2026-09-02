import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import {
  issueAnalytics,
  userActivity,
  projects,
  issueProgress,
  issueLinks,
  issueTasks,
  gitlabRepos,
} from "@/db/schema";
import { and, eq, gte, desc, inArray, like, sql, type SQL } from "drizzle-orm";
import {
  CYCLE_BUCKETS,
  AGE_BUCKETS,
  bucketFor,
  parseBoardLabels,
  WORKFLOW_STAGES,
  WIP_LIMIT,
  type ReviewIssue,
  type LinkedIssueInfo,
  type PersonStat,
} from "@/app/components/dashboard/review/types";

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

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
    const project = searchParams.get("project"); // DB project id
    const author = searchParams.get("author"); // username
    const status = searchParams.get("status"); // open | closed
    const period = searchParams.get("period") || "all"; // 7 | 30 | 90 | all (days)
    const sprintWeeks = Math.max(1, parseInt(searchParams.get("sprintWeeks") || "2"));

    const db = getDb();
    const now = Date.now();

    // ---- Project name lookup + main-project scoping ----
    const projectRows = await db
      .select({ id: projects.id, name: projects.name, mgmtId: projects.mgmtId })
      .from(projects);
    const projectNameById = new Map(projectRows.map((p) => [p.id, p.name]));

    // Collect all GitLab project IDs across all configs (main + children)
    // so the default view shows issues from all repos.
    const allGitlabProjectIds = (await db.select({ id: gitlabRepos.id }).from(gitlabRepos))
      .map((r) => r.id);

    // ---- Repo scoping ----
    // Default: ALL repos. `repo=<gitlab_project_id>` re-scopes the
    // whole review to a single repo (e.g. a child project with its own board).
    const repoParam = searchParams.get("repo");
    const scopeFilter: SQL =
      repoParam && !isNaN(parseInt(repoParam))
        ? eq(issueAnalytics.gitlabProjectId, parseInt(repoParam))
        : allGitlabProjectIds.length > 0
          ? inArray(issueAnalytics.gitlabProjectId, allGitlabProjectIds)
          : sql`1=1`; // no repos cached yet — show everything

    // ---- Build shared filters ----
    const cutoff =
      period !== "all" && !isNaN(parseInt(period))
        ? new Date(now - parseInt(period) * DAY_MS)
        : null;

    const issueConditions: SQL[] = [scopeFilter];
    if (project && !isNaN(parseInt(project))) {
      issueConditions.push(eq(issueAnalytics.projectId, parseInt(project)));
    }
    if (author) {
      issueConditions.push(like(issueAnalytics.assigneeUsernames, `%${author}%`));
    }
    // Note: status filtering happens in JS after normalization below
    // (GitLab stores "opened", we normalize to "open")
    if (cutoff) {
      issueConditions.push(gte(issueAnalytics.createdAt, cutoff));
    }

    // ---- Project name lookup ----
    // (moved above: projectRows now also provides main-project scoping)

    // ---- Fetch filtered issues ----
    const rows = await db
      .select()
      .from(issueAnalytics)
      .where(issueConditions.length > 0 ? and(...issueConditions) : undefined);

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

    // ---- Fetch linked (child) issues for master tickets ----
    const linkRows = await db.select().from(issueLinks);
    const linksByMaster = new Map<string, LinkedIssueInfo[]>();
    // Child analytics rows, fetched per child project so titles/states/URLs resolve
    const childProjectIds = [...new Set(linkRows.map((l) => l.linkedGitlabProjectId))];
    const childAnalyticsByKey = new Map<
      string,
      { issueTitle: string | null; state: string | null; issueUrl: string | null; assigneeUsernames: string | null }
    >();
    for (const pid of childProjectIds) {
      const iids = [
        ...new Set(
          linkRows.filter((l) => l.linkedGitlabProjectId === pid).map((l) => l.linkedIssueIid)
        ),
      ];
      if (iids.length === 0) continue;
      const childRows = await db
        .select({
          issueIid: issueAnalytics.issueIid,
          issueTitle: issueAnalytics.issueTitle,
          state: issueAnalytics.state,
          issueUrl: issueAnalytics.issueUrl,
          assigneeUsernames: issueAnalytics.assigneeUsernames,
        })
        .from(issueAnalytics)
        .where(and(eq(issueAnalytics.gitlabProjectId, pid), inArray(issueAnalytics.issueIid, iids)));
      for (const c of childRows) {
        childAnalyticsByKey.set(`${pid}:${c.issueIid}`, {
          issueTitle: c.issueTitle,
          state: c.state,
          issueUrl: c.issueUrl,
          assigneeUsernames: c.assigneeUsernames,
        });
      }
    }
    for (const l of linkRows) {
      const key = `${l.gitlabProjectId}:${l.issueIid}`;
      const list = linksByMaster.get(key) ?? [];
      // Same pair may arrive from two sources (formal link + subtask_ref)
      const targetKey = `${l.linkedGitlabProjectId}:${l.linkedIssueIid}`;
      if (list.some((x) => `${x.gitlabProjectId}:${x.issueIid}` === targetKey)) {
        continue;
      }
      const child = childAnalyticsByKey.get(targetKey);
      const prog = progressByKey.get(targetKey);
      list.push({
        gitlabProjectId: l.linkedGitlabProjectId,
        issueIid: l.linkedIssueIid,
        title: child?.issueTitle ?? null,
        state: child?.state ?? "unknown",
        issueUrl: child?.issueUrl ?? null,
        devProgress: prog?.dev ?? null,
        qaProgress: prog?.qa ?? null,
        assigneeUsernames: child?.assigneeUsernames ?? null,
      });
      linksByMaster.set(key, list);
    }

    // Fetch task assignees for all issues
    const taskRows = await db
      .select({
        gitlabProjectId: issueTasks.gitlabProjectId,
        issueIid: issueTasks.issueIid,
        assigneeUsername: issueTasks.assigneeUsername,
        taskText: issueTasks.taskText,
        isCompleted: issueTasks.isCompleted,
      })
      .from(issueTasks);
    // Group tasks by issue key, collect unique assignee usernames per issue
    const taskAssigneesByKey = new Map<string, string[]>();
    const tasksByKey = new Map<string, Array<{ assigneeUsername: string | null; taskText: string; isCompleted: boolean }>>();
    for (const t of taskRows) {
      const key = `${t.gitlabProjectId}:${t.issueIid}`;
      const existing = tasksByKey.get(key) ?? [];
      existing.push({ assigneeUsername: t.assigneeUsername, taskText: t.taskText, isCompleted: !!t.isCompleted });
      tasksByKey.set(key, existing);
      if (t.assigneeUsername) {
        const assignees = taskAssigneesByKey.get(key) ?? [];
        if (!assignees.includes(t.assigneeUsername)) {
          assignees.push(t.assigneeUsername);
          taskAssigneesByKey.set(key, assignees);
        }
      }
    }

    const issues: ReviewIssue[] = rows
      .map((r) => {
        // Normalize GitLab's "opened" to "open"
        const state = r.state === "closed" ? "closed" : "open";
        const board = parseBoardLabels(r.labels, state);
        const progress =
          progressByKey.get(`${r.gitlabProjectId}:${r.issueIid}`) ?? {
            dev: null,
            qa: null,
          };
        return {
          id: r.id,
          projectId: r.projectId,
          projectName: projectNameById.get(r.projectId) ?? null,
          gitlabProjectId: r.gitlabProjectId,
          issueIid: r.issueIid,
          issueTitle: r.issueTitle,
          issueUrl: r.issueUrl,
          authorUsername: r.authorUsername,
          authorName: r.authorName,
          assigneeUsernames: r.assigneeUsernames ?? null,
          state,
          labels: r.labels,
          createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : "",
          closedAt: r.closedAt ? new Date(r.closedAt).toISOString() : null,
          firstResponseAt: r.firstResponseAt
            ? new Date(r.firstResponseAt).toISOString()
            : null,
          timeToCloseHours: r.timeToCloseHours,
          timeToFirstResponseHours: r.timeToFirstResponseHours,
          commentCount: r.commentCount,
          uniqueCommenters: r.uniqueCommenters,
          devProgress: progress.dev,
          qaProgress: progress.qa,
          boardStage: board.boardStage,
          priority: board.priority,
          team: board.team,
          type: board.type,
          linkedIssues:
            linksByMaster.get(`${r.gitlabProjectId}:${r.issueIid}`) ?? [],
          taskAssignees:
            taskAssigneesByKey.get(`${r.gitlabProjectId}:${r.issueIid}`) ?? [],
          stageEnteredAt: r.stageEnteredAt
            ? new Date(r.stageEnteredAt).toISOString()
            : null,
        };
      })
      .filter((i) => (status === "open" || status === "closed" ? i.state === status : true));

    const ageHoursOf = (iso: string): number =>
      iso ? Math.floor((now - new Date(iso).getTime()) / HOUR_MS) : 0;

    // ---- KPIs ----
    const closedIssuesList = issues.filter((i) => i.state === "closed");
    const cycleTimes = closedIssuesList
      .map((i) => i.timeToCloseHours)
      .filter((h): h is number => h !== null);
    const responseTimes = issues
      .map((i) => i.timeToFirstResponseHours)
      .filter((h): h is number => h !== null);
    const avg = (arr: number[]): number | null =>
      arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;

    // Sprint buckets (epoch-aligned, N weeks each)
    const msPerSprint = sprintWeeks * 7 * DAY_MS;
    const currentSprintIdx = Math.floor(now / msPerSprint);
    const sprintAgg = new Map<number, { count: number; cycleTimes: number[] }>();
    for (const i of closedIssuesList) {
      if (!i.closedAt) continue;
      const idx = Math.floor(new Date(i.closedAt).getTime() / msPerSprint);
      const entry = sprintAgg.get(idx) || { count: 0, cycleTimes: [] };
      entry.count++;
      if (i.timeToCloseHours !== null) entry.cycleTimes.push(i.timeToCloseHours);
      sprintAgg.set(idx, entry);
    }
    const sprintVelocity = Array.from(sprintAgg.entries())
      .map(([idx, v]) => ({
        sprintStart: new Date(idx * msPerSprint).toISOString().slice(0, 10),
        sprintEnd: new Date((idx + 1) * msPerSprint).toISOString().slice(0, 10),
        issuesCompleted: v.count,
        avgCycleTime: avg(v.cycleTimes),
      }))
      .sort((a, b) => b.sprintStart.localeCompare(a.sprintStart));

    const kpis = {
      totalIssues: issues.length,
      openIssues: issues.length - closedIssuesList.length,
      closedIssues: closedIssuesList.length,
      closeRate:
        issues.length > 0
          ? Math.round((closedIssuesList.length / issues.length) * 1000) / 10
          : 0,
      avgCycleTime: avg(cycleTimes),
      avgFirstResponse: avg(responseTimes),
      totalComments: issues.reduce((s, i) => s + (i.commentCount || 0), 0),
      currentSprintCompleted: sprintAgg.get(currentSprintIdx)?.count ?? 0,
      previousSprintCompleted: sprintAgg.get(currentSprintIdx - 1)?.count ?? 0,
      avgPerSprint:
        sprintVelocity.length > 0
          ? Math.round(
              sprintVelocity.reduce((s, v) => s + v.issuesCompleted, 0) /
                sprintVelocity.length
            )
          : 0,
      staleOpenIssues: issues.filter(
        (i) => i.state === "open" && ageHoursOf(i.createdAt) >= 336
      ).length,
    };

    // ---- Cycle Time Distribution ----
    const totalClosedWithCycle = cycleTimes.length || 1;
    const cycleTimeDistribution = CYCLE_BUCKETS.map((b) => {
      const count = cycleTimes.filter((h) => bucketFor(h) === b.label).length;
      return {
        bucket: b.label,
        count,
        percentage: Math.round((count / totalClosedWithCycle) * 1000) / 10,
      };
    }).filter((b) => b.count > 0);

    // ---- Board Distribution (team's Kanban stages, in board order) ----
    const stageCounts = new Map<string, number>();
    for (const i of issues) {
      stageCounts.set(i.boardStage, (stageCounts.get(i.boardStage) || 0) + 1);
    }
    const boardDistribution = [
      ...WORKFLOW_STAGES.map((stage) => ({
        stage,
        count: stageCounts.get(stage) || 0,
      })),
      // Fallback stages at the bottom
      ...(["Opened", "Closed"] as const)
        .filter((s) => (stageCounts.get(s) || 0) > 0)
        .map((s) => ({ stage: s, count: stageCounts.get(s)! })),
    ];

    // ---- Priority Breakdown (open issues) ----
    const prioCounts = new Map<string, number>();
    for (const i of issues) {
      if (i.state !== "open") continue;
      const key = i.priority || "No Priority";
      prioCounts.set(key, (prioCounts.get(key) || 0) + 1);
    }
    const priorityBreakdown = ["P0", "P1", "P2", "P3"]
      .map((priority) => ({ priority, openCount: prioCounts.get(priority) || 0 }))
      .concat(
        prioCounts.has("No Priority")
          ? [{ priority: "No Priority", openCount: prioCounts.get("No Priority")! }]
          : []
      );

    // ---- Team Breakdown (open issues by team label) ----
    const teamCounts = new Map<string, number>();
    for (const i of issues) {
      if (i.state !== "open") continue;
      const key = i.team || "No Team";
      teamCounts.set(key, (teamCounts.get(key) || 0) + 1);
    }
    const teamBreakdown = Array.from(teamCounts.entries())
      .map(([team, openCount]) => ({ team, openCount }))
      .sort((a, b) => b.openCount - a.openCount);

    // ---- Throughput Trend (weekly, last 12 weeks of filtered data) ----
    const twelveWeeksAgo = now - 84 * DAY_MS;
    const weekMap = new Map<string, number>();
    for (const i of closedIssuesList) {
      if (!i.closedAt) continue;
      const t = new Date(i.closedAt).getTime();
      if (t < twelveWeeksAgo) continue;
      const key = toIsoWeekKey(new Date(t));
      weekMap.set(key, (weekMap.get(key) || 0) + 1);
    }
    const throughputTrend = Array.from(weekMap.entries())
      .map(([week, c]) => ({ week, issuesCompleted: c }))
      .sort((a, b) => a.week.localeCompare(b.week));

    // ---- Aged Issues ----
    const agedIssues = AGE_BUCKETS.map((b) => {
      const matching = issues.filter(
        (i) => i.state === "open" && bucketFor(ageHoursOf(i.createdAt)) === b.label
      );
      return {
        ageBucket: b.label,
        count: matching.length,
        issues: matching.map((i) => `#${i.issueIid}`).join(", "),
      };
    }).filter((b) => b.count > 0);

    // ---- People (assignee-based attribution) ----
    const peopleMap = new Map<string, PersonStat>();
    const creditPerson = (username: string, name: string, issue: (typeof issues)[number]) => {
      const p =
        peopleMap.get(username) ||
        {
          username,
          name,
          totalIssues: 0,
          issuesClosed: 0,
          issuesOpen: 0,
          avgCycleTime: null,
          avgFirstResponse: null,
          totalComments: 0,
          closeRate: 0,
          oldestOpenAge: 0,
          wipCount: 0,
        };
      p.totalIssues++;
      if (issue.state === "closed") p.issuesClosed++;
      else {
        p.issuesOpen++;
        if (issue.boardStage === "In Progress") p.wipCount++;
        p.oldestOpenAge = Math.max(p.oldestOpenAge, ageHoursOf(issue.createdAt));
      }
      p.totalComments += issue.commentCount || 0;
      peopleMap.set(username, p);
    };
    for (const i of issues) {
      const assignees = (i.assigneeUsernames || "")
        .split(",")
        .map((a) => a.trim())
        .filter(Boolean);
      if (assignees.length === 0) continue;
      for (const a of assignees) {
        creditPerson(a, a, i);
      }
    }
    const people = Array.from(peopleMap.values())
      .map((p) => {
        const userIssues = issues.filter((i) =>
          (i.assigneeUsernames || "")
            .split(",")
            .map((a) => a.trim())
            .includes(p.username)
        );
        const uCycle = userIssues
          .filter((i) => i.state === "closed" && i.timeToCloseHours !== null)
          .map((i) => i.timeToCloseHours!);
        const uResp = userIssues
          .filter((i) => i.timeToFirstResponseHours !== null)
          .map((i) => i.timeToFirstResponseHours!);
        return {
          ...p,
          avgCycleTime: avg(uCycle),
          avgFirstResponse: avg(uResp),
          closeRate:
            p.totalIssues > 0
              ? Math.round((p.issuesClosed / p.totalIssues) * 1000) / 10
              : 0,
        };
      })
      .sort((a, b) => b.totalIssues - a.totalIssues);

    // ---- Activity (same shared filters mapped to user_activity) ----
    const activityScopeFilter: SQL =
      repoParam && !isNaN(parseInt(repoParam))
        ? eq(userActivity.gitlabProjectId, parseInt(repoParam))
        : allGitlabProjectIds.length > 0
          ? inArray(userActivity.gitlabProjectId, allGitlabProjectIds)
          : sql`1=1`;

    const activityConditions: SQL[] = [activityScopeFilter];
    if (project && !isNaN(parseInt(project))) {
      activityConditions.push(eq(userActivity.projectId, parseInt(project)));
    }
    if (author) {
      activityConditions.push(eq(userActivity.userUsername, author));
    }
    if (cutoff) {
      activityConditions.push(gte(userActivity.occurredAt, cutoff));
    }
    const activityRows = await db
      .select({
        id: userActivity.id,
        projectName: userActivity.projectName,
        userName: userActivity.userName,
        userUsername: userActivity.userUsername,
        activityType: userActivity.activityType,
        itemIid: userActivity.itemIid,
        itemTitle: userActivity.itemTitle,
        itemUrl: userActivity.itemUrl,
        occurredAt: userActivity.occurredAt,
      })
      .from(userActivity)
      .where(activityConditions.length > 0 ? and(...activityConditions) : undefined)
      .orderBy(desc(userActivity.occurredAt))
      .limit(50);

    const activity = activityRows.map((a) => ({
      ...a,
      occurredAt: new Date(a.occurredAt).toISOString(),
    }));

    // ---- Facets (scoped to the selected repo, for dropdown options) ----
    const allAuthors = await db
      .select({
        username: issueAnalytics.authorUsername,
        name: issueAnalytics.authorName,
      })
      .from(issueAnalytics)
      .where(scopeFilter)
      .groupBy(issueAnalytics.authorUsername);

    const repoRows = await db.select().from(gitlabRepos);
    const facets = {
      projects: projectRows,
      authors: allAuthors.sort((a, b) => a.name.localeCompare(b.name)),
      repos: repoRows
        .sort((a, b) =>
          a.isMain === b.isMain
            ? a.pathWithNamespace.localeCompare(b.pathWithNamespace)
            : a.isMain
              ? -1
              : 1
        )
        .map((r) => ({
          id: r.id,
          name: r.name,
          pathWithNamespace: r.pathWithNamespace,
          isMain: r.isMain,
        })),
    };

    return NextResponse.json({
      kpis,
      issues,
      sprintVelocity,
      cycleTimeDistribution,
      boardDistribution,
      priorityBreakdown,
      teamBreakdown,
      throughputTrend,
      agedIssues,
      people,
      activity,
      facets,
      wipLimit: WIP_LIMIT,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Failed to fetch review data:", error);
    return NextResponse.json({ error: "Failed to fetch review data" }, { status: 500 });
  }
}
