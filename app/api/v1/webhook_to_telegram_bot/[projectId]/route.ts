/* eslint-disable @typescript-eslint/no-explicit-any */
import { Bot } from "grammy";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { projects } from "@/db/schema";
import { eq } from "drizzle-orm";
import { buildMessage } from "@/lib/telegram-message";

const GitLabWebhookToTelegramResponse = z.object({
  status: z.object({
    success: z.boolean(),
    code: z.string().optional(),
    msg: z.string().optional(),
  }),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  // Lookup project config from database
  const db = getDb();
  const project = db.select().from(projects).where(eq(projects.id, Number(projectId))).get();

  if (!project) {
    return NextResponse.json(
      GitLabWebhookToTelegramResponse.parse({
        status: { success: false, code: "GL-004", msg: "Project not found" },
      }),
      { status: 404 }
    );
  }

  const eventType = req.headers.get("x-gitlab-event") || "";
  const auth = req.headers.get("x-gitlab-token");

  // Validate webhook secret
  if (auth !== project.webhookSecret) {
    return NextResponse.json(
      GitLabWebhookToTelegramResponse.parse({
        status: { success: false, code: "GL-001", msg: "Unauthorized" },
      }),
    );
  }

  const botToken = project.telegramBotToken;
  const chatId = project.telegramChatId;

  // Extract Gitlab issue body
  const body = await req.json();

  // Extract common attributes safely
  const projectName =
    body.project?.name || body.repository?.name || "Unknown Project";
  const userName = body.user_name || body.user?.name || "Someone";
  const userUsername = body.user?.username || "";

  // 1. Check if user is in ignore list (bot accounts)
  const ignoreUsers = project.ignoreUsers?.split(",").map((u) => u.trim()) || [];
  const isIgnoredUser =
    ignoreUsers.includes(userName) ||
    (userUsername && ignoreUsers.includes(userUsername));

  if (isIgnoredUser) {
    console.log(`🤖 Ignored user detected: ${userName} — sending as robot update`);
  }

  // 2. Smart filter for gitlab_sync_tasks automated updates
  const isSyncUpdate =
    body.object_attributes?.description?.includes("<!-- gitlab_sync_task_update -->") ||
    (body.object_attributes?.description?.includes("## 📊 Development Status") &&
      body.object_attributes?.description?.includes("_🕒 Last Sync:"));

  if (isSyncUpdate && body.object_attributes?.action === "update") {
    const changedKeys = Object.keys(body.changes || {});
    const isOnlySyncFields = changedKeys.every((k) =>
      ["description", "labels", "updated_at"].includes(k),
    );

    if (isOnlySyncFields) {
      console.log(`⏭️ Skipping automated sync update notification.`);
      return NextResponse.json(
        GitLabWebhookToTelegramResponse.parse({
          status: { success: true },
        }),
      );
    }
  }

  // Build message and keyboard
  const { text, keyboard } = buildMessage(eventType, body, projectName, userName, isIgnoredUser);

  // Create bot instance and send message
  const bot = new Bot(botToken);
  try {
    await bot.api.sendMessage(chatId, text, {
      parse_mode: "Markdown",
      reply_markup: keyboard,
    });
  } catch (error) {
    console.error("Failed to send Telegram message:", error);
    return NextResponse.json(
      GitLabWebhookToTelegramResponse.parse({
        status: {
          success: false,
          code: "TG-001",
          msg: "Failed to forward to Telegram",
        },
      }),
    );
  }

  return NextResponse.json(
    GitLabWebhookToTelegramResponse.parse({
      status: { success: true },
    }),
  );
}
