import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { userActivity, issueAnalytics } from "@/db/schema";
import { calculateTrackerStats, filterActivities, calculateUserInsights } from "@/lib/tracker-stats";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("project_id");
    const username = searchParams.get("user");
    const period = searchParams.get("period") || "all";
    const fromDate = searchParams.get("from_date");
    const toDate = searchParams.get("to_date");

    const db = getDb();

    // Fetch all activities and issue analytics
    const [allActivities, allIssueAnalytics] = await Promise.all([
      db.select().from(userActivity),
      db.select().from(issueAnalytics),
    ]);

    // Apply filters to activities
    const filters: {
      projectId?: number;
      username?: string;
      fromDate?: string;
      toDate?: string;
    } = {};

    if (projectId) {
      filters.projectId = parseInt(projectId, 10);
    }

    if (username) {
      filters.username = username;
    }

    // Apply period filter
    const now = new Date();
    if (period !== "all") {
      const periodStart = new Date();
      switch (period) {
        case "week":
          periodStart.setDate(now.getDate() - 7);
          break;
        case "month":
          periodStart.setMonth(now.getMonth() - 1);
          break;
        case "quarter":
          periodStart.setMonth(now.getMonth() - 3);
          break;
        case "year":
          periodStart.setFullYear(now.getFullYear() - 1);
          break;
      }
      filters.fromDate = periodStart.toISOString();
    }

    // Apply custom date filters
    if (fromDate) {
      filters.fromDate = fromDate;
    }

    if (toDate) {
      filters.toDate = toDate;
    }

    const filteredActivities = filterActivities(allActivities, filters);
    const stats = calculateTrackerStats(filteredActivities);

    // Calculate user insights from issue analytics
    const userInsights = calculateUserInsights(allIssueAnalytics);

    return NextResponse.json({
      ...stats,
      userInsights,
    });
  } catch (error) {
    console.error("Stats error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
