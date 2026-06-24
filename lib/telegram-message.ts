/* eslint-disable @typescript-eslint/no-explicit-any */
import { InlineKeyboard } from "grammy";

export interface MessageResult {
  text: string;
  keyboard: InlineKeyboard;
}

export function escapeMarkdown(text: string): string {
  return text.replace(/([_*[\]()~`>#+=|{}.!-])/g, "\\$1");
}

export function buildIssueMessage(body: any, isIgnoredUser: boolean): MessageResult {
  const attrs = body.object_attributes || {};
  const action = attrs.action || "updated";
  const title = attrs.title || "Unknown Title";
  const url = attrs.url || "";
  const iid = attrs.iid || "";
  const state = attrs.state || "";
  const projectUrl = body.project?.web_url || "";

  let text = `📋 Issue *#${iid}* ${action}`;
  if (isIgnoredUser) text += ` 🤖`;
  text += "\n";

  text += `📝 *${escapeMarkdown(title)}*\n`;

  const changes: string[] = [];

  if (body.changes) {
    if (body.changes.labels) {
      const prev = body.changes.labels.previous?.map((l: any) => l.title).join(", ") || "None";
      const curr = body.changes.labels.current?.map((l: any) => l.title).join(", ") || "None";
      changes.push("🏷 Labels: `" + escapeMarkdown(prev) + "` → `" + escapeMarkdown(curr) + "`");
    }

    if (body.changes.assignees) {
      const prev = body.changes.assignees.previous?.map((a: any) => a.name).join(", ") || "Unassigned";
      const curr = body.changes.assignees.current?.map((a: any) => a.name).join(", ") || "Unassigned";
      changes.push(`👤 Assignee: ${escapeMarkdown(prev)} → ${escapeMarkdown(curr)}`);
    }

    if (body.changes.milestone_id) {
      const prev = body.changes.milestone_id.previous?.title || "None";
      const curr = body.changes.milestone_id.current?.title || "None";
      changes.push(`🎯 Milestone: ${escapeMarkdown(prev)} → ${escapeMarkdown(curr)}`);
    }

    if (body.changes.state_id || (body.changes.updated_at && !body.changes.labels && !body.changes.assignees && !body.changes.milestone_id)) {
      if (state === "closed" || state === "reopened") {
        changes.push(`🚦 Status: *${state.toUpperCase()}*`);
      }
    }
  }

  if (changes.length > 0) {
    text += "\n" + changes.join("\n") + "\n";
  }

  const keyboard = new InlineKeyboard();
  if (url) keyboard.url("View Issue", url);
  if (projectUrl) keyboard.url("View Project", projectUrl);

  return { text, keyboard };
}

export function buildMergeRequestMessage(body: any, isIgnoredUser: boolean): MessageResult {
  const attrs = body.object_attributes || {};
  const action = attrs.action || "updated";
  const title = attrs.title || "Unknown MR";
  const url = attrs.url || "";
  const iid = attrs.iid || "";
  const source = attrs.source_branch || "";
  const target = attrs.target_branch || "";
  const projectUrl = body.project?.web_url || "";

  let text = `🔀 Merge Request *!${iid}* ${action}`;
  if (isIgnoredUser) text += ` 🤖`;
  text += "\n";

  text += `📝 *${escapeMarkdown(title)}*\n`;

  if (source && target) {
    text += `${escapeMarkdown(source)} → ${escapeMarkdown(target)}\n`;
  }

  const changes: string[] = [];

  if (body.changes) {
    if (body.changes.labels) {
      const prev = body.changes.labels.previous?.map((l: any) => l.title).join(", ") || "None";
      const curr = body.changes.labels.current?.map((l: any) => l.title).join(", ") || "None";
      changes.push("🏷 Labels: `" + escapeMarkdown(prev) + "` → `" + escapeMarkdown(curr) + "`");
    }
    if (body.changes.assignees) {
      const prev = body.changes.assignees.previous?.map((a: any) => a.name).join(", ") || "Unassigned";
      const curr = body.changes.assignees.current?.map((a: any) => a.name).join(", ") || "Unassigned";
      changes.push(`👤 Assignee: ${escapeMarkdown(prev)} → ${escapeMarkdown(curr)}`);
    }
    if (body.changes.state_id) {
      const state = attrs.state || "updated";
      if (state === "merged" || state === "closed") {
        changes.push(`🚦 Status: *${state.toUpperCase()}*`);
      }
    }
  }

  if (changes.length > 0) {
    text += "\n" + changes.join("\n") + "\n";
  }

  const keyboard = new InlineKeyboard();
  if (url) keyboard.url("View MR", url);
  if (projectUrl) keyboard.url("View Project", projectUrl);

  return { text, keyboard };
}

export function buildPushMessage(body: any, isIgnoredUser: boolean): MessageResult {
  const branch = body.ref?.replace("refs/heads/", "") || "unknown";
  const commits = body.total_commits_count || 0;
  const projectUrl = body.project?.web_url || "";
  const compareUrl = body.project?.web_url ? `${body.project.web_url}/-/compare/${body.before}...${body.after}` : "";

  let text = `🚀 Push to \`${escapeMarkdown(branch)}\``;
  if (isIgnoredUser) text += ` 🤖`;
  text += "\n";

  text += `${commits} commit(s) pushed\n`;

  if (body.commits && body.commits.length > 0) {
    const commitList = body.commits.slice(0, 3).map((c: any) => {
      const msg = (c.message || "").split("\n")[0].substring(0, 50);
      return `• \`${c.id?.substring(0, 7)}\` ${escapeMarkdown(msg)}`;
    });
    text += "\n" + commitList.join("\n");
    if (body.commits.length > 3) {
      text += `\n_and ${body.commits.length - 3} more..._`;
    }
    text += "\n";
  }

  const keyboard = new InlineKeyboard();
  if (compareUrl) keyboard.url("View Commits", compareUrl);
  if (projectUrl) keyboard.url("View Project", projectUrl);

  return { text, keyboard };
}

export function buildPipelineMessage(body: any, isIgnoredUser: boolean): MessageResult {
  const attrs = body.object_attributes || {};
  const status = attrs.status || "unknown";
  const projectUrl = body.project?.web_url || "";
  const pipelineUrl = projectUrl ? `${projectUrl}/-/pipelines/${attrs.id}` : "";
  const duration = attrs.duration ? ` (${Math.round(attrs.duration)}s)` : "";

  const statusEmoji: Record<string, string> = {
    success: "✅",
    failed: "❌",
    canceled: "🚫",
    running: "🔄",
    pending: "⏳",
  };

  let text = `${statusEmoji[status] || "🛠"} Pipeline *${status.toUpperCase()}*${duration}`;
  if (isIgnoredUser) text += ` 🤖`;
  text += "\n";

  if (body.commit?.message) {
    const msg = (body.commit.message || "").split("\n")[0].substring(0, 60);
    text += `\`${body.commit.id?.substring(0, 7)}\` ${escapeMarkdown(msg)}\n`;
  }

  const keyboard = new InlineKeyboard();
  if (pipelineUrl) keyboard.url("View Pipeline", pipelineUrl);
  if (projectUrl) keyboard.url("View Project", projectUrl);

  return { text, keyboard };
}

export function buildCommentMessage(body: any, isIgnoredUser: boolean): MessageResult {
  const attrs = body.object_attributes || {};
  const noteableType = attrs.noteable_type || "Item";
  const note = attrs.note?.substring(0, 150) || "";
  const url = attrs.url || "";

  let text = `💬 Comment on ${noteableType}`;
  if (isIgnoredUser) text += ` 🤖`;
  text += "\n\n";

  if (note) {
    text += `_${escapeMarkdown(note)}${attrs.note?.length > 150 ? "..." : ""}_\n`;
  }

  const keyboard = new InlineKeyboard();
  if (url) keyboard.url("View Comment", url);

  return { text, keyboard };
}

export function buildMessage(
  eventType: string,
  body: any,
  projectName: string,
  userName: string,
  isIgnoredUser: boolean
): MessageResult {
  const displayUser = isIgnoredUser ? "🤖 Robot/Bot" : userName;
  const robotMarker = isIgnoredUser ? "🤖 *[AUTOMATED UPDATE]*\n" : "";

  let result: MessageResult;

  switch (eventType) {
    case "Issue Hook":
    case "Confidential Issue Hook":
    case "Work Item Hook":
      result = buildIssueMessage(body, isIgnoredUser);
      break;

    case "Merge Request Hook":
      result = buildMergeRequestMessage(body, isIgnoredUser);
      break;

    case "Push Hook":
      result = buildPushMessage(body, isIgnoredUser);
      break;

    case "Pipeline Hook":
      result = buildPipelineMessage(body, isIgnoredUser);
      break;

    case "Note Hook":
    case "Confidential Note Hook":
      result = buildCommentMessage(body, isIgnoredUser);
      break;

    case "Tag Push Hook": {
      const tag = body.ref?.replace("refs/tags/", "") || "unknown";
      const url = body.project?.web_url || "";
      result = {
        text: `🏷 Tag \`${escapeMarkdown(tag)}\` pushed${isIgnoredUser ? " 🤖" : ""}\n`,
        keyboard: new InlineKeyboard().url("View Tag", `${url}/-/tags/${tag}`).url("View Project", url),
      };
      break;
    }

    case "Build Hook":
    case "Job Hook": {
      const status = body.build_status || "unknown";
      const name = body.build_name || "unknown";
      const url = body.repository?.homepage || "";
      result = {
        text: `⚙️ Job \`${escapeMarkdown(name)}\` *${status.toUpperCase()}*${isIgnoredUser ? " 🤖" : ""}\n`,
        keyboard: new InlineKeyboard().url("View Job", url),
      };
      break;
    }

    case "Deployment Hook": {
      const env = body.environment || "unknown";
      const status = body.status || "unknown";
      const url = body.project?.web_url || "";
      result = {
        text: `🚀 Deployment to \`${escapeMarkdown(env)}\` is *${status.toUpperCase()}*${isIgnoredUser ? " 🤖" : ""}\n`,
        keyboard: new InlineKeyboard().url("View Environment", url),
      };
      break;
    }

    case "Release Hook": {
      const name = body.name || "unknown";
      const action = body.action || "updated";
      const url = body.url || "";
      result = {
        text: `📦 Release \`${escapeMarkdown(name)}\` ${action}${isIgnoredUser ? " 🤖" : ""}\n`,
        keyboard: new InlineKeyboard().url("View Release", url),
      };
      break;
    }

    case "Wiki Page Hook": {
      const title = body.object_attributes?.title || "unknown";
      const action = body.object_attributes?.action || "updated";
      const url = body.object_attributes?.url || "";
      result = {
        text: `📝 Wiki page "${escapeMarkdown(title)}" ${action}${isIgnoredUser ? " 🤖" : ""}\n`,
        keyboard: new InlineKeyboard().url("View Wiki", url),
      };
      break;
    }

    case "Milestone Hook": {
      const title = body.object_attributes?.title || "unknown";
      const action = body.object_attributes?.action || "updated";
      result = {
        text: `🎯 Milestone "${escapeMarkdown(title)}" ${action}${isIgnoredUser ? " 🤖" : ""}\n`,
        keyboard: new InlineKeyboard(),
      };
      break;
    }

    case "Vulnerability Hook": {
      const severity = body.vulnerability?.severity || "unknown";
      const url = body.vulnerability?.url || body.project?.web_url || "";
      result = {
        text: `🛡 Vulnerability: *${severity.toUpperCase()}*${isIgnoredUser ? " 🤖" : ""}\n`,
        keyboard: new InlineKeyboard().url("View Vulnerability", url),
      };
      break;
    }

    default:
      result = {
        text: `ℹ️ ${eventType}${isIgnoredUser ? " 🤖" : ""}\n_Unhandled event type_\n`,
        keyboard: new InlineKeyboard(),
      };
  }

  // Prepend header with project and user info
  const header = `${robotMarker}📂 *${escapeMarkdown(projectName)}* · 👤 ${escapeMarkdown(displayUser)}\n`;
  result.text = header + result.text;

  return result;
}
