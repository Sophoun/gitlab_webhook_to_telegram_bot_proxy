import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { syncLogs } from "@/db/schema";
import { desc, eq } from "drizzle-orm";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId");
    const limit = parseInt(searchParams.get("limit") || "50");

    const db = getDb();

    let logs;
    if (projectId) {
      logs = db.select().from(syncLogs).where(eq(syncLogs.projectId, Number(projectId))).orderBy(desc(syncLogs.createdAt)).limit(limit).all();
    } else {
      logs = db.select().from(syncLogs).orderBy(desc(syncLogs.createdAt)).limit(limit).all();
    }

    return NextResponse.json({ logs });
  } catch (error) {
    console.error("Failed to fetch logs:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const db = getDb();

    const result = db.insert(syncLogs).values({
      projectId: body.project_id || null,
      eventType: body.event_type || null,
      masterIid: body.master_iid || null,
      status: body.status || "info",
      message: body.message || "",
    }).returning({ id: syncLogs.id }).get();

    return NextResponse.json({ id: result.id }, { status: 201 });
  } catch (error) {
    console.error("Failed to create log:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
