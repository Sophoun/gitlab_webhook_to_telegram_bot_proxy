import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { projects } from "@/db/schema";
import { randomBytes } from "crypto";
import { desc } from "drizzle-orm";

function generateWebhookSecret(): string {
  return randomBytes(16).toString("hex");
}

export async function GET() {
  try {
    const db = getDb();
    const allProjects = db.select().from(projects).orderBy(desc(projects.createdAt)).all();

    return NextResponse.json({ projects: allProjects });
  } catch (error) {
    console.error("Failed to fetch projects:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const db = getDb();

    const result = db.insert(projects).values({
      name: body.name,
      gitlabApiBase: body.gitlab_api_base || "https://gitlab.com/api/v4",
      gitlabPat: body.gitlab_pat,
      mgmtId: body.mgmt_id,
      namespace: body.namespace,
      masterIid: body.master_iid || null,
      telegramBotToken: body.telegram_bot_token,
      telegramChatId: body.telegram_chat_id,
      ignoreUsers: body.ignore_users || "",
      webhookSecret: body.webhook_secret || generateWebhookSecret(),
      labelsTodo: body.labels_todo || "Backlog, Refinement, Ready for Dev",
      labelsInProgress: body.labels_in_progress || "In Progress, Peer Review, Testing/QA",
      labelsIntegrated: body.labels_integrated || "Completed, Closed",
      skipIgnoredUsers: body.skip_ignored_users === true ? true : false,
      skipDescriptionOnlyUpdates: body.skip_description_only_updates === true ? true : false,
    }).returning({ id: projects.id }).get();

    return NextResponse.json({ id: result.id }, { status: 201 });
  } catch (error) {
    console.error("Failed to create project:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
