import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { issueAnalytics } from "@/db/schema";
import { sql, eq, and, asc, desc } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const project = searchParams.get("project");
    const author = searchParams.get("author");

    const db = getDb();

    // Build base conditions
    const conditions = [];
    if (project) {
      conditions.push(eq(issueAnalytics.gitlabProjectId, parseInt(project)));
    }
    if (author) {
      conditions.push(eq(issueAnalytics.authorUsername, author));
    }
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // 1. Overall summary
    const summary = await db
      .select({
        totalIssues: sql<number>`count(*)`,
        openIssues: sql<number>`sum(case when ${issueAnalytics.state} = 'open' then 1 else 0 end)`,
        closedIssues: sql<number>`sum(case when ${issueAnalytics.state} = 'closed' then 1 else 0 end)`,
        avgTimeToClose: sql<number>`avg(${issueAnalytics.timeToCloseHours})`,
        avgTimeToFirstResponse: sql<number>`avg(${issueAnalytics.timeToFirstResponseHours})`,
        totalComments: sql<number>`sum(${issueAnalytics.commentCount})`,
      })
      .from(issueAnalytics)
      .where(whereClause);

    // 2. Issues by label (simplified - get all labels for analysis)
    const byLabel = await db
      .select({
        labels: issueAnalytics.labels,
        count: sql<number>`count(*)`,
        avgTimeToClose: sql<number>`avg(${issueAnalytics.timeToCloseHours})`,
      })
      .from(issueAnalytics)
      .where(whereClause)
      .groupBy(issueAnalytics.labels)
      .orderBy(sql`count(*) desc`)
      .limit(10);

    // 3. Slowest issues (open, sorted by age)
    const slowestOpen = await db
      .select({
        issueIid: issueAnalytics.issueIid,
        issueTitle: issueAnalytics.issueTitle,
        issueUrl: issueAnalytics.issueUrl,
        projectName: sql<string>`(select p.name from projects p where p.id = ${issueAnalytics.projectId})`,
        authorUsername: issueAnalytics.authorUsername,
        createdAt: issueAnalytics.createdAt,
        commentCount: issueAnalytics.commentCount,
        ageHours: sql<number>`cast((julianday('now') - julianday(${issueAnalytics.createdAt})) * 24 as integer)`,
      })
      .from(issueAnalytics)
      .where(whereClause ? and(whereClause, eq(issueAnalytics.state, "open")) : eq(issueAnalytics.state, "open"))
      .orderBy(sql`${issueAnalytics.createdAt} asc`)
      .limit(10);

    // 4. Fastest resolved issues
    const fastestResolved = await db
      .select({
        issueIid: issueAnalytics.issueIid,
        issueTitle: issueAnalytics.issueTitle,
        issueUrl: issueAnalytics.issueUrl,
        projectName: sql<string>`(select p.name from projects p where p.id = ${issueAnalytics.projectId})`,
        authorUsername: issueAnalytics.authorUsername,
        timeToCloseHours: issueAnalytics.timeToCloseHours,
        closedAt: issueAnalytics.closedAt,
      })
      .from(issueAnalytics)
      .where(
        whereClause
          ? and(whereClause, eq(issueAnalytics.state, "closed"), sql`${issueAnalytics.timeToCloseHours} is not null`)
          : and(eq(issueAnalytics.state, "closed"), sql`${issueAnalytics.timeToCloseHours} is not null`)
      )
      .orderBy(asc(issueAnalytics.timeToCloseHours))
      .limit(10);

    // 5. Most commented issues
    const mostCommented = await db
      .select({
        issueIid: issueAnalytics.issueIid,
        issueTitle: issueAnalytics.issueTitle,
        issueUrl: issueAnalytics.issueUrl,
        projectName: sql<string>`(select p.name from projects p where p.id = ${issueAnalytics.projectId})`,
        authorUsername: issueAnalytics.authorUsername,
        state: issueAnalytics.state,
        commentCount: issueAnalytics.commentCount,
        uniqueCommenters: issueAnalytics.uniqueCommenters,
      })
      .from(issueAnalytics)
      .where(whereClause)
      .orderBy(desc(issueAnalytics.commentCount))
      .limit(10);

    // 6. Issues by project
    const byProject = await db
      .select({
        projectId: issueAnalytics.gitlabProjectId,
        projectName: sql<string>`(select p.name from projects p where p.id = ${issueAnalytics.projectId})`,
        totalIssues: sql<number>`count(*)`,
        openIssues: sql<number>`sum(case when ${issueAnalytics.state} = 'open' then 1 else 0 end)`,
        closedIssues: sql<number>`sum(case when ${issueAnalytics.state} = 'closed' then 1 else 0 end)`,
        avgTimeToClose: sql<number>`avg(${issueAnalytics.timeToCloseHours})`,
      })
      .from(issueAnalytics)
      .where(whereClause)
      .groupBy(issueAnalytics.gitlabProjectId)
      .orderBy(sql`count(*) desc`);

    // 7. Issues by author
    const byAuthor = await db
      .select({
        authorUsername: issueAnalytics.authorUsername,
        authorName: issueAnalytics.authorName,
        totalIssues: sql<number>`count(*)`,
        openIssues: sql<number>`sum(case when ${issueAnalytics.state} = 'open' then 1 else 0 end)`,
        closedIssues: sql<number>`sum(case when ${issueAnalytics.state} = 'closed' then 1 else 0 end)`,
        avgTimeToClose: sql<number>`avg(${issueAnalytics.timeToCloseHours})`,
        avgTimeToFirstResponse: sql<number>`avg(${issueAnalytics.timeToFirstResponseHours})`,
      })
      .from(issueAnalytics)
      .where(whereClause)
      .groupBy(issueAnalytics.authorUsername)
      .orderBy(sql`count(*) desc`);

    return NextResponse.json({
      summary: {
        totalIssues: summary[0]?.totalIssues || 0,
        openIssues: summary[0]?.openIssues || 0,
        closedIssues: summary[0]?.closedIssues || 0,
        avgTimeToClose: summary[0]?.avgTimeToClose || null,
        avgTimeToFirstResponse: summary[0]?.avgTimeToFirstResponse || null,
        totalComments: summary[0]?.totalComments || 0,
      },
      byLabel,
      slowestOpen,
      fastestResolved,
      mostCommented,
      byProject,
      byAuthor,
    });
  } catch (error) {
    console.error("Failed to fetch issue insights:", error);
    return NextResponse.json(
      { error: "Failed to fetch issue insights" },
      { status: 500 }
    );
  }
}
