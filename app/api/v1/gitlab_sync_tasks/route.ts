/* eslint-disable prefer-const */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import z from "zod";

/**
 * Generic GitLab Sync Task Configuration
 */
const SyncTaskConfig = z.object({
  apiBase: z.string().url().default("https://gitlab.com/api/v4"),
  pat: z.string().describe("GitLab Personal Access Token"),
  mgmtId: z.string().describe("Management project ID"),
  namespace: z.string().describe("Default GitLab namespace for sub-projects"),
  secret: z
    .string()
    .optional()
    .describe("Webhook secret token for x-gitlab-token validation"),
});

type Config = z.infer<typeof SyncTaskConfig>;

/**
 * Extracts configuration from request URL search parameters.
 */
function extractConfig(searchParams: URLSearchParams): Partial<Config> {
  return {
    apiBase: searchParams.get("apiBase") || undefined,
    pat: searchParams.get("pat") || undefined,
    mgmtId: searchParams.get("mgmtId") || undefined,
    namespace: searchParams.get("namespace") || undefined,
    secret: searchParams.get("secret") || undefined,
  };
}

/**
 * GitLab manual sync sub task to parent issue board via Webhook
 * @description Automatically sync status when a sub-project issue is updated. This endpoint supports auto-discovery of the master ticket via native links, mentions, or regex.
 * @queryParams SyncTaskConfig
 * @response 200
 * @openapi
 */
export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const rawConfig = extractConfig(searchParams);

  const configParse = SyncTaskConfig.safeParse(rawConfig);
  if (!configParse.success) {
    return NextResponse.json(
      {
        error: "Missing or invalid configuration parameters",
        details: configParse.error.format(),
      },
      { status: 400 },
    );
  }
  const config = configParse.data;

  // Webhook Secret Validation
  if (config.secret) {
    const auth = req.headers.get("x-gitlab-token");
    if (auth !== config.secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let masterIid = searchParams.get("masterIid");
  let body: any = {};

  try {
    body = await req.json();
  } catch (_err) {
    // Body is optional if masterIid is provided in query params
    console.log(
      "No JSON body provided, proceeding with masterIid from query params if available.",
    );
  }

  // 1. Try extraction from body text (Master: #123)
  if (!masterIid && body) {
    const description = body.object_attributes?.description || "";
    const note = body.object_attributes?.note || "";
    const content = `${description} ${note}`;
    const match = content.match(/(?:Master|Parent)(?:\s+Ticket)?:\s*#(\d+)/i);
    if (match) masterIid = match[1];
  }

  // 2. Try Auto-Discovery from native links/mentions
  if (!masterIid && body) {
    const subProjectId = body.project?.id;
    const subIssueIid = body.object_attributes?.iid || body.issue?.iid;

    if (subProjectId && subIssueIid) {
      console.log(
        `🔍 POST Discovery: Attempting auto-discovery for Master Ticket...`,
      );
      masterIid = await discoverMasterIid(subProjectId, subIssueIid, config);
    }
  }

  if (!masterIid) {
    return NextResponse.json(
      {
        error:
          "Could not identify Master Ticket IID. Please link the issue, add 'Master: #123' to description, or provide masterIid in query params.",
      },
      { status: 400 },
    );
  }

  try {
    const report = await syncStatusToMaster(masterIid, config);
    return NextResponse.json({
      success: true,
      masterIid,
      summary: report,
    });
  } catch (err: any) {
    console.error("Sync failed:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * Helper to discover Master Ticket IID from a sub-task.
 */
async function discoverMasterIid(
  subProjectId: number,
  subIssueIid: number,
  config: Config,
): Promise<string | null> {
  const { apiBase, pat, mgmtId } = config;

  // Strategy A: Check Native Issue Links
  try {
    const linksRes = await fetch(
      `${apiBase}/projects/${subProjectId}/issues/${subIssueIid}/links`,
      { headers: { "PRIVATE-TOKEN": pat } },
    );
    if (linksRes.ok) {
      const links = await linksRes.json();
      const masterLink = links.find(
        (l: any) =>
          String(l.project_id) === String(mgmtId) ||
          l.web_url.includes(`/projects/${mgmtId}/`),
      );
      if (masterLink) return String(masterLink.iid);
    }
  } catch (err) {
    console.error("Discovery Strategy A failed:", err);
  }

  // Strategy B: Check System Notes (Mentions)
  try {
    const notesRes = await fetch(
      `${apiBase}/projects/${subProjectId}/issues/${subIssueIid}/notes?per_page=100`,
      { headers: { "PRIVATE-TOKEN": pat } },
    );
    if (notesRes.ok) {
      const notes = await notesRes.json();
      for (const note of notes) {
        if (note.system && note.body.includes("mentioned in issue")) {
          const match = note.body.match(/issue\s+([\w\-\.\/]+)?#(\d+)/);
          if (match) {
            const projectPath = match[1];
            const iid = match[2];
            if (!projectPath || projectPath.includes(String(mgmtId))) {
              return iid;
            }
          }
        }
      }
    }
  } catch (err) {
    console.error("Discovery Strategy B failed:", err);
  }

  return null;
}

async function syncStatusToMaster(masterIid: string, config: Config) {
  const { apiBase, pat, mgmtId, namespace } = config;
  const encodedMgmtId = encodeURIComponent(mgmtId);

  // 1. Fetch mentions AND links from the Master ticket to find all sub-tasks
  const uniqueRefs = new Set<string>();

  // Helper to normalize reference (e.g. "path/to/project#123" or just "project#123")
  const normalizeRef = (ref: string) => {
    if (!ref.includes("#")) return ref;
    let [path, iid] = ref.split("#");
    if (!path.includes("/")) {
      path = `${namespace}/${path}`;
    }
    return `${path}#${iid}`;
  };

  // 1a. Fetch notes (mentions)
  const notesRes = await fetch(
    `${apiBase}/projects/${encodedMgmtId}/issues/${masterIid}/notes?per_page=100`,
    { headers: { "PRIVATE-TOKEN": pat } },
  );

  if (notesRes.ok) {
    const notes = await notesRes.json();
    notes
      .filter((n: any) => n.system && n.body.includes("mentioned in issue"))
      .forEach((n: any) => {
        const m = n.body.match(/issue ([\w\-\.\/]+#\d+)/);
        if (m) uniqueRefs.add(normalizeRef(m[1]));
      });
  }

  // 1b. Fetch native links
  const linksRes = await fetch(
    `${apiBase}/projects/${encodedMgmtId}/issues/${masterIid}/links`,
    { headers: { "PRIVATE-TOKEN": pat } },
  );
  if (linksRes.ok) {
    const links = await linksRes.json();
    links.forEach((l: any) => {
      const otherIssue = l.other_issue || l;
      if (otherIssue.references?.full) {
        uniqueRefs.add(normalizeRef(otherIssue.references.full));
      }
    });
  }

  if (uniqueRefs.size === 0) return "No linked sub-tasks found.";

  // 2. Build the table rows and track sub-task statuses
  let tableRows = "";
  const subTaskStatuses: string[] = [];

  for (const ref of Array.from(uniqueRefs)) {
    const [path, iid] = ref.split("#");

    // Skip if it's the master ticket itself
    if (path.includes(mgmtId) && String(iid) === String(masterIid)) continue;

    const res = await fetch(
      `${apiBase}/projects/${encodeURIComponent(path)}/issues/${iid}`,
      { headers: { "PRIVATE-TOKEN": pat } },
    );

    if (res.ok) {
      const task = await res.json();
      const projectLabel = path.split("/").pop() || path;
      const statusLabel =
        task.labels.find((l: string) => l.startsWith("Status::")) ||
        task.labels.join(", ") ||
        "Unset";

      subTaskStatuses.push(statusLabel);

      // Determine Icon based on project name or status
      let icon = "🚧";
      let statusIcon = "";

      const lowerProject = projectLabel.toLowerCase();

      // Project Icons
      if (lowerProject.includes("android")) icon = "🤖";
      else if (lowerProject.includes("mobile")) icon = "📱";
      else if (lowerProject.includes("ios") || lowerProject.includes("apple"))
        icon = "🍎";
      else if (
        lowerProject.includes("web") ||
        lowerProject.includes("frontend")
      )
        icon = "🌐";
      else if (lowerProject.includes("backend") || lowerProject.includes("api"))
        icon = "⚙️";
      else if (
        lowerProject.includes("design") ||
        lowerProject.includes("figma")
      )
        icon = "🎨";

      // Status-based Fallback Icons
      if (statusLabel.includes("To Do")) statusIcon = "🚧";
      else if (
        statusLabel.includes("Development") ||
        statusLabel.includes("In Progress")
      )
        statusIcon = "🏗️";
      else if (statusLabel.includes("Review") || statusLabel.includes("QA"))
        statusIcon = "🧪";
      else if (
        statusLabel.includes("Integrated") ||
        statusLabel.includes("Done")
      )
        statusIcon = "✅";

      tableRows += `| ${icon} \`${projectLabel}\` | ${task.title} | ${statusIcon} \`${statusLabel}\` | ${ref} |\n`;
    }
  }

  // 3. Calculate Overall Status for the Master Task
  let overallStatus = "Status::To Do";
  if (subTaskStatuses.length > 0) {
    const isAllDone = subTaskStatuses.every(
      (s) => s.includes("Integrated") || s.includes("Done"),
    );
    const isAnyInProgress = subTaskStatuses.some(
      (s) =>
        s.includes("Development") ||
        s.includes("In Progress") ||
        s.includes("Review") ||
        s.includes("QA"),
    );
    const isAnyDone = subTaskStatuses.some(
      (s) => s.includes("Integrated") || s.includes("Done"),
    );
    const isAnyTodo = subTaskStatuses.some(
      (s) => s.includes("To Do") || s === "Unset" || s === "",
    );

    if (isAllDone) {
      overallStatus = "Status::Integrated";
    } else if (isAnyInProgress || (isAnyDone && isAnyTodo)) {
      overallStatus = "Status::In Progress";
    } else {
      overallStatus = "Status::To Do";
    }
  }

  // 4. Construct the FULL Markdown Table
  const tableHeader =
    "## 📊 Development Status\n\n" +
    "| Project | Task Description | Current Status | Reference |\n" +
    "| :--- | :--- | :--- | :--- |\n";

  const fullTableBlock = tableHeader + tableRows;

  // 5. Update Master Ticket Description and Status Label
  const masterRes = await fetch(
    `${apiBase}/projects/${encodedMgmtId}/issues/${masterIid}`,
    { headers: { "PRIVATE-TOKEN": pat } },
  );

  if (!masterRes.ok) {
    throw new Error(`Failed to fetch master ticket: ${masterRes.statusText}`);
  }

  const master = await masterRes.json();

  // Check if update is actually needed
  const currentStatusLabel = (master.labels || []).find((l: string) =>
    l.startsWith("Status::"),
  );
  const isStatusChanged = currentStatusLabel !== overallStatus;
  
  // Normalize old table for comparison (remove timestamp line if exists)
  const hasOldTable = master.description.includes("## 📊 Development Status");
  const isTableChanged = !master.description.includes(tableRows.trim());

  if (!isStatusChanged && !isTableChanged && hasOldTable) {
    console.log(
      `✅ No changes detected for Master Task #${masterIid}. Skipping update.`,
    );
    return "No changes detected. Sync skipped.";
  }

  // Clean up description (remove old status blocks)
  const baseDesc = master.description
    .split("## 📊 Development Status")[0]
    .split("## 📊 Squad Development Status")[0]
    .trim();

  const finalDesc = `${baseDesc}\n\n${fullTableBlock}\n\n_🕒 Last Sync: ${new Date().toLocaleString("en-KH")}_\n<!-- gitlab_sync_task_update -->`;

  // Update labels: remove existing Status:: labels and add the new calculated status
  const otherLabels = (master.labels || []).filter(
    (l: string) => !l.startsWith("Status::"),
  );
  const finalLabels = [...otherLabels, overallStatus].join(",");

  console.log(`Updating Master Task #${masterIid} status to: ${overallStatus}`);

  const updateRes = await fetch(
    `${apiBase}/projects/${encodedMgmtId}/issues/${masterIid}`,
    {
      method: "PUT",
      headers: { "PRIVATE-TOKEN": pat, "Content-Type": "application/json" },
      body: JSON.stringify({
        description: finalDesc,
        labels: finalLabels,
      }),
    },
  );

  if (!updateRes.ok) {
    console.error(`Failed to update master ticket: ${updateRes.statusText}`);
    const errBody = await updateRes.text();
    console.error(`Error details: ${errBody}`);
  }

  return fullTableBlock;
}
