/* eslint-disable @typescript-eslint/no-explicit-any */
import { Bot } from "grammy";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

/**
 * This will be assign to the GitLab "X-Gitlab-Token" header.
 */
const SECRET = "Lek1cTFVBDp/gY7uEp3g8WAdseIqdIetubQ961NYEu0=";

const GitLabWebhookToTelegramHeaders = z.object({
  "x-gitlab-token": z
    .string()
    .describe("The Default input form from GitLab webhook option."),
  "x-gitlab-event": z.string().describe("The Default GitLab event type."),
});

const GitLabWebhookToTelegramParams = z.object({
  botToken: z.string().describe("Telegram bot token"),
  chatId: z.string().describe("Telegram chat ID"),
});

const GitLabWebhookToTelegramResponse = z.object({
  status: z.object({
    success: z.boolean(),
    code: z.string().optional(),
    msg: z.string().optional(),
  }),
});

/**
 * GitLab webhook to Telegram
 * @description Send message via provided bot token to a specific conversion id. This will work with GitLab webhook only!
 * @queryParams GitLabWebhookToTelegramParams
 * @header GitLabWebhookToTelegramHeaders
 * @response 200:GitLabWebhookToTelegramResponse
 * @openapi
 */
export async function POST(req: NextRequest) {
  const eventType = req.headers.get("x-gitlab-event");
  const auth = req.headers.get("x-gitlab-token");

  const isSecretMatch = auth === SECRET;
  if (!isSecretMatch) {
    return NextResponse.json(
      GitLabWebhookToTelegramResponse.parse({
        status: { success: false, code: "GL-001", msg: "Unauthorized" },
      }),
    );
  }

  const { searchParams } = new URL(req.url);
  const botToken = searchParams.get("botToken");
  if (!botToken) {
    return NextResponse.json(
      GitLabWebhookToTelegramResponse.parse({
        status: {
          success: false,
          code: "GL-002",
          msg: "Bad Request: Missing botToken",
        },
      }),
    );
  }

  const chatId = searchParams.get("chatId");
  if (!chatId) {
    return NextResponse.json(
      GitLabWebhookToTelegramResponse.parse({
        status: {
          success: false,
          code: "GL-003",
          msg: "Bad Request: Missing chatId",
        },
      }),
    );
  }

  // Extract Gitlab issue body
  const body = await req.json();

  // Extract common attributes safely
  const projectName =
    body.project?.name || body.repository?.name || "Unknown Project";
  const userName = body.user_name || body.user?.name || "Someone";
  const userUsername = body.user?.username || "";

  // 1. Filter by ignored users (bot accounts)
  const ignoreUsers = searchParams.get("ignoreUsers")?.split(",").map(u => u.trim()) || [];
  if (
    ignoreUsers.includes(userName) ||
    (userUsername && ignoreUsers.includes(userUsername))
  ) {
    console.log(`⏭️ Skipping notification for ignored user: ${userName}`);
    return NextResponse.json(
      GitLabWebhookToTelegramResponse.parse({
        status: { success: true },
      }),
    );
  }

  // 2. Smart filter for gitlab_sync_tasks automated updates
  const isSyncUpdate =
    body.object_attributes?.description?.includes("<!-- gitlab_sync_task_update -->") ||
    (body.object_attributes?.description?.includes("## 📊 Development Status") &&
      body.object_attributes?.description?.includes("_🕒 Last Sync:"));

  if (isSyncUpdate && body.object_attributes?.action === "update") {
    // Only skip if the only changes are description, labels or updated_at
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

  // Base message
  let message = `📂 *Project:* ${projectName}\n👤 *User:* ${userName}\n\n`;

  // Handle all major event types based on GitLab Webhook Headers
  console.log(`🔔 *GitLab Event:* ${eventType}`);
  switch (eventType) {
    case "Push Hook":
      const branch = body.ref?.replace("refs/heads/", "") || "unknown branch";
      message += `🚀 Pushed ${body.total_commits_count || 0} commit(s) to \`${branch}\`.\n🔗 [View Commits](${body.project?.web_url})`;
      break;

    case "Tag Push Hook":
      const tag = body.ref?.replace("refs/tags/", "") || "unknown tag";
      message += `🏷 Pushed new tag \`${tag}\`.\n🔗 [View Tag](${body.project?.web_url})`;
      break;

    case "Issue Hook":
    case "Confidential Issue Hook":
    case "Work Item Hook": // Future-proofing for GitLab's "Work Item" transition
      const issueAction = body.object_attributes?.action || "updated";
      const issueTitle = body.object_attributes?.title || "Unknown Title";
      const issueUrl = body.object_attributes?.url || "";

      message += `📋 Issue *${issueAction}*: "${issueTitle}"\n`;

      // Extract specific changes to make the alert actionable
      if (body.changes) {
        // 1. Label Changes (Crucial for Kanban column movement)
        if (body.changes.labels) {
          const prevLabels =
            body.changes.labels.previous?.map((l: any) => l.title).join(", ") ||
            "None";
          const currLabels =
            body.changes.labels.current?.map((l: any) => l.title).join(", ") ||
            "None";
          message += `🏷 *Labels:* \`[${prevLabels}]\` ➡️ \`[${currLabels}]\`\n`;
        }

        // 2. Assignee Changes (When a task is handed off)
        if (body.changes.assignees) {
          const prevAssignees =
            body.changes.assignees.previous
              ?.map((a: any) => a.name)
              .join(", ") || "Unassigned";
          const currAssignees =
            body.changes.assignees.current
              ?.map((a: any) => a.name)
              .join(", ") || "Unassigned";
          message += `👤 *Assignee:* ${prevAssignees} ➡️ ${currAssignees}\n`;
        }

        // 3. State Changes (e.g., closing or reopening an issue)
        if (
          body.changes.state_id ||
          (body.changes.updated_at &&
            !body.changes.labels &&
            !body.changes.assignees)
        ) {
          // Fallback if it's just a general update without label/assignee changes
          const state = body.object_attributes?.state || "updated";
          if (state === "closed" || state === "reopened") {
            message += `🚦 *Status:* ${state.toUpperCase()}\n`;
          }
        }
      }

      message += `🔗 [View Issue](${issueUrl})`;
      break;

    case "Note Hook":
    case "Confidential Note Hook":
      const noteableType = body.object_attributes?.noteable_type || "Item";
      const commentPreview =
        body.object_attributes?.note?.substring(0, 100) || "";
      message += `💬 Commented on ${noteableType}:\n_"${commentPreview}..."_\n🔗 [View Comment](${body.object_attributes?.url})`;
      break;

    case "Merge Request Hook":
      const mrAction = body.object_attributes?.action || "updated";
      const mrTitle = body.object_attributes?.title || "Unknown MR";
      message += `🔀 Merge Request *${mrAction}*: "${mrTitle}"\n🔗 [View MR](${body.object_attributes?.url})`;
      break;

    case "Pipeline Hook":
      const pipeStatus = body.object_attributes?.status || "unknown";
      message += `🛠 Pipeline finished with status: *${pipeStatus.toUpperCase()}*.\n🔗 [View Pipeline](${body.project?.web_url}/-/pipelines/${body.object_attributes?.id})`;
      break;

    case "Build Hook":
    case "Job Hook":
      const buildStatus = body.build_status || "unknown";
      message += `⚙️ Job \`${body.build_name}\` finished with status: *${buildStatus.toUpperCase()}*.\n🔗 [View Job](${body.repository?.homepage})`;
      break;

    case "Deployment Hook":
      message += `🚀 Deployment to \`${body.environment}\` is *${body.status}*.\n🔗 [View Environment](${body.project?.web_url})`;
      break;

    case "Release Hook":
      message += `📦 Release \`${body.name}\` was ${body.action}.\n🔗 [View Release](${body.url})`;
      break;

    case "Wiki Page Hook":
      message += `📝 Wiki page "${body.object_attributes?.title}" was ${body.object_attributes?.action}.`;
      break;

    case "Feature Flag Hook":
      const ffName = body.object_attributes?.name || "unknown flag";
      message += `🚩 Feature flag \`${ffName}\` was updated.`;
      break;

    case "Milestone Hook":
      message += `🎯 Milestone "${body.object_attributes?.title}" was ${body.object_attributes?.action}.`;
      break;

    case "Vulnerability Hook":
      // Usually requires GitLab Ultimate
      const vulnSeverity = body.vulnerability?.severity || "unknown severity";
      message += `🛡 Vulnerability detected: *${vulnSeverity}*.\n🔗 [View Vulnerability](${body.vulnerability?.url || body.project?.web_url})`;
      break;

    default:
      message += `ℹ️ Event triggered, but specific parsing is not defined for this hook type yet.`;
      console.log(`Unhandled Event Type: ${eventType}`);
  }

  /**
   * Create bot instance and send message
   */
  const bot = new Bot(botToken);
  try {
    // Send message using Markdown format for better readability
    await bot.api.sendMessage(chatId, message, { parse_mode: "Markdown" });
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
