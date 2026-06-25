import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { projects } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();
    const project = db.select().from(projects).where(eq(projects.id, Number(id))).get();

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    return NextResponse.json({ project });
  } catch (error) {
    console.error("Failed to fetch project:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const db = getDb();

    // Build dynamic update: only include fields that are provided
    const updateData: Record<string, unknown> = {};

    if (body.name !== undefined) updateData.name = body.name;
    if (body.gitlab_api_base !== undefined) updateData.gitlabApiBase = body.gitlab_api_base || "https://gitlab.com/api/v4";
    if (body.gitlab_pat) updateData.gitlabPat = body.gitlab_pat;
    if (body.mgmt_id !== undefined) updateData.mgmtId = body.mgmt_id;
    if (body.namespace !== undefined) updateData.namespace = body.namespace;
    if (body.master_iid !== undefined) updateData.masterIid = body.master_iid || null;
    if (body.telegram_bot_token) updateData.telegramBotToken = body.telegram_bot_token;
    if (body.telegram_chat_id !== undefined) updateData.telegramChatId = body.telegram_chat_id;
    if (body.ignore_users !== undefined) updateData.ignoreUsers = body.ignore_users || "";
    if (body.webhook_secret !== undefined) updateData.webhookSecret = body.webhook_secret;
    if (body.labels_todo !== undefined) updateData.labelsTodo = body.labels_todo;
    if (body.labels_in_progress !== undefined) updateData.labelsInProgress = body.labels_in_progress;
    if (body.labels_integrated !== undefined) updateData.labelsIntegrated = body.labels_integrated;
    if (body.skip_ignored_users !== undefined) updateData.skipIgnoredUsers = body.skip_ignored_users;
    if (body.skip_description_only_updates !== undefined) updateData.skipDescriptionOnlyUpdates = body.skip_description_only_updates;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    db.update(projects).set(updateData).where(eq(projects.id, Number(id))).run();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to update project:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();

    db.delete(projects).where(eq(projects.id, Number(id))).run();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete project:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
