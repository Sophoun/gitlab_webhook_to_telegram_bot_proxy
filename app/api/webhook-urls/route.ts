import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { projects } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId");

    if (!projectId) {
      return NextResponse.json(
        { error: "projectId is required" },
        { status: 400 }
      );
    }

    const db = getDb();
    const project = db.select().from(projects).where(eq(projects.id, Number(projectId))).get();

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const baseUrl = `${req.headers.get("x-forwarded-proto") || "http"}://${req.headers.get("host")}`;

    const telegramWebhook = `${baseUrl}/api/v1/webhook_to_telegram_bot/${project.id}`;
    const syncWebhook = `${baseUrl}/api/v1/gitlab_sync_tasks/${project.id}`;

    return NextResponse.json({
      telegramWebhook,
      syncWebhook,
      webhookSecret: project.webhookSecret,
    });
  } catch (error) {
    console.error("Failed to generate webhook URLs:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
