import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { userActivity } from "@/db/schema";
import { filterActivities } from "@/lib/tracker-stats";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("project_id");
    const username = searchParams.get("user");
    const activityType = searchParams.get("activity_type");
    const fromDate = searchParams.get("from_date");
    const toDate = searchParams.get("to_date");
    const limit = parseInt(searchParams.get("limit") || "100", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    const db = getDb();

    // Fetch all activities
    const allActivities = await db.select().from(userActivity);

    // Apply filters
    const filters: {
      projectId?: number;
      username?: string;
      activityType?: string;
      fromDate?: string;
      toDate?: string;
    } = {};

    if (projectId) {
      filters.projectId = parseInt(projectId, 10);
    }

    if (username) {
      filters.username = username;
    }

    if (activityType) {
      filters.activityType = activityType;
    }

    if (fromDate) {
      filters.fromDate = fromDate;
    }

    if (toDate) {
      filters.toDate = toDate;
    }

    const filteredActivities = filterActivities(allActivities, filters);

    // Sort by date descending
    const sortedActivities = filteredActivities.sort((a, b) => {
      const dateA = typeof a.occurredAt === 'string' ? new Date(a.occurredAt) : a.occurredAt;
      const dateB = typeof b.occurredAt === 'string' ? new Date(b.occurredAt) : b.occurredAt;
      return dateB.getTime() - dateA.getTime();
    });

    // Apply pagination
    const paginatedActivities = sortedActivities.slice(offset, offset + limit);

    return NextResponse.json({
      activities: paginatedActivities,
      total: filteredActivities.length,
      limit,
      offset,
    });
  } catch (error) {
    console.error("Activity error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
