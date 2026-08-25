import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { userActivity } from "@/db/schema";
import { calculateUserStats } from "@/lib/tracker-stats";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("project_id");

    const db = getDb();

    // Fetch all activities
    const allActivities = await db.select().from(userActivity);

    // Filter by project if specified
    let filteredActivities = allActivities;
    if (projectId) {
      const projectIdNum = parseInt(projectId, 10);
      filteredActivities = allActivities.filter(
        (activity) => activity.projectId === projectIdNum
      );
    }

    // Calculate user stats
    const userStats = calculateUserStats(filteredActivities);

    return NextResponse.json({ users: userStats });
  } catch (error) {
    console.error("Users error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
