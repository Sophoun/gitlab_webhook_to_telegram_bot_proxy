import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { issueAnalytics } from "@/db/schema";
import { eq, desc, asc, sql, and, like, isNull, isNotNull } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const status = searchParams.get("status"); // "open", "closed", or null for all
    const project = searchParams.get("project"); // gitlab project id
    const author = searchParams.get("author"); // username
    const label = searchParams.get("label"); // label name
    const search = searchParams.get("search"); // search in title
    const sortBy = searchParams.get("sortBy") || "createdAt"; // createdAt, timeToCloseHours, commentCount, timeToFirstResponseHours
    const sortOrder = searchParams.get("sortOrder") || "desc";

    const db = getDb();

    // Build where conditions
    const conditions = [];

    if (status === "open") {
      conditions.push(eq(issueAnalytics.state, "open"));
    } else if (status === "closed") {
      conditions.push(eq(issueAnalytics.state, "closed"));
    }

    if (project) {
      conditions.push(eq(issueAnalytics.gitlabProjectId, parseInt(project)));
    }

    if (author) {
      conditions.push(eq(issueAnalytics.authorUsername, author));
    }

    if (label) {
      conditions.push(sql`(${issueAnalytics.labels} LIKE '%${label}%')`);
    }

    if (search) {
      conditions.push(sql`(${issueAnalytics.issueTitle} LIKE '%${search}%')`);
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Get total count
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(issueAnalytics)
      .where(whereClause);
    const totalCount = countResult[0]?.count || 0;

    // Determine sort column
    let orderClause;
    const sortDir = sortOrder === "asc" ? asc : desc;
    switch (sortBy) {
      case "timeToCloseHours":
        orderClause = sortDir(issueAnalytics.timeToCloseHours);
        break;
      case "commentCount":
        orderClause = sortDir(issueAnalytics.commentCount);
        break;
      case "timeToFirstResponseHours":
        orderClause = sortDir(issueAnalytics.timeToFirstResponseHours);
        break;
      default:
        orderClause = sortDir(issueAnalytics.createdAt);
    }

    // Fetch issues
    const issues = await db
      .select()
      .from(issueAnalytics)
      .where(whereClause)
      .orderBy(orderClause)
      .limit(limit)
      .offset((page - 1) * limit);

    return NextResponse.json({
      issues,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
    });
  } catch (error) {
    console.error("Failed to fetch issues:", error);
    return NextResponse.json(
      { error: "Failed to fetch issues" },
      { status: 500 }
    );
  }
}
