/* eslint-disable prefer-const */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { projects } from "@/db/schema";
import { eq } from "drizzle-orm";
import { calculateOverallStatus } from "@/lib/sync-status";

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
      { error: "Project not found" },
      { status: 404 }
    );
  }

  const config = {
    apiBase: project.gitlabApiBase || "https://gitlab.com/api/v4",
    pat: project.gitlabPat,
    mgmtId: project.mgmtId,
    namespace: project.namespace,
    labelConfig: {
      todo: (project.labelsTodo || "").split(",").map((s) => s.trim()).filter(Boolean),
      inProgress: (project.labelsInProgress || "").split(",").map((s) => s.trim()).filter(Boolean),
      integrated: (project.labelsIntegrated || "").split(",").map((s) => s.trim()).filter(Boolean),
    },
  };

  // Webhook Secret Validation
  const auth = req.headers.get("x-gitlab-token");
  if (auth !== project.webhookSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let masterIid = project.masterIid;
  let body: any = {};

  try {
    body = await req.json();
    const eventType = req.headers.get("x-gitlab-event") || "unknown";
    const objectKind = body.object_kind || "unknown";
    const subProjectId = body.project?.id || "unknown";
    const subIssueIid = body.object_attributes?.iid || body.issue?.iid || "unknown";
    console.log(`📥 Received ${eventType} (object_kind: ${objectKind}) for project ${subProjectId} issue #${subIssueIid}`);

    // Skip if this is not a status-related change
    if (body.changes) {
      const changedKeys = Object.keys(body.changes);
      const statusKeys = ["labels", "state_id", "milestone_id", "assignee_ids", "assignees"];
      const hasStatusChange = changedKeys.some((k) => statusKeys.includes(k));

      if (!hasStatusChange) {
        console.log(`⏭️ Skipping: No status-related change detected. Changed fields: ${changedKeys.join(", ")}`);
        return NextResponse.json({
          skipped: true,
          reason: "No status-related change",
          changedFields: changedKeys,
        });
      }
    }

    // Skip note/comment webhooks unless they explicitly mention a Master ticket
    if (objectKind === "note" || objectKind === "merge_request") {
      const noteContent = body.object_attributes?.note || "";
      const mentionsMaster = /(?:Master|Parent)(?:\s+Ticket)?:\s*#\d+/i.test(noteContent);

      if (!mentionsMaster) {
        console.log(`⏭️ Skipping ${objectKind} webhook: No Master ticket mention found.`);
        return NextResponse.json({
          skipped: true,
          reason: `No Master ticket mention in ${objectKind}`,
        });
      }
    }
  } catch {
    console.log(
      "No JSON body provided, proceeding with masterIid from DB if available.",
    );
  }

  // 1. Try extraction from body text (Master: #123)
  if (!masterIid && body) {
    const description = body.object_attributes?.description || "";
    const note = body.object_attributes?.note || "";
    const content = `${description} ${note}`;
    const match = content.match(/(?:Master|Parent)(?:\s+Ticket)?:\s*#(\d+)/i);
    if (match) {
      masterIid = match[1];
      console.log(`✅ Found Master Ticket #${masterIid} from description/note regex.`);
    }
  }

  // 2. Try Auto-Discovery from native links/mentions
  if (!masterIid && body) {
    const subProjectId = body.project?.id;
    const objectKind = body.object_kind;
    let subIssueIid: number | undefined;

    if (objectKind === "note") {
      subIssueIid = body.issue?.iid || body.merge_request?.iid;
      if (!subIssueIid) {
        console.log(`⏭️ Skipping note webhook: Could not determine noteable IID.`);
      }
    } else {
      subIssueIid = body.object_attributes?.iid;
    }

    if (subProjectId && subIssueIid) {
      console.log(
        `🔍 POST Discovery: Attempting auto-discovery for Master Ticket from ${objectKind} event...`,
      );
      masterIid = await discoverMasterIid(subProjectId, subIssueIid, config);
    }
  }

  if (!masterIid) {
    console.log(`❌ No master ticket found. Returning 400.`);
    return NextResponse.json(
      {
        error:
          "Could not identify Master Ticket IID. Please link the issue, add 'Master: #123' to description, or set master_iid in project config.",
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

async function discoverMasterIid(
  subProjectId: number,
  subIssueIid: number,
  config: { apiBase: string; pat: string; mgmtId: string },
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
      if (masterLink) {
        console.log(`✅ Discovery Strategy A: Found master ticket #${masterLink.iid}`);
        return String(masterLink.iid);
      }
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
              console.log(`✅ Discovery Strategy B: Found master ticket #${iid} from system notes.`);
              return iid;
            }
          }
        }
      }
    }
  } catch (err) {
    console.error("Discovery Strategy B failed:", err);
  }

  console.log(`❌ Discovery failed: No master ticket found for sub-issue ${subProjectId}#${subIssueIid}.`);
  return null;
}

async function syncStatusToMaster(
  masterIid: string,
  config: {
    apiBase: string;
    pat: string;
    mgmtId: string;
    namespace: string;
    labelConfig: {
      todo: string[];
      inProgress: string[];
      integrated: string[];
    };
  }
) {
  const { apiBase, pat, mgmtId, namespace, labelConfig } = config;
  const encodedMgmtId = encodeURIComponent(mgmtId);

  const uniqueRefs = new Set<string>();

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

    if (path.includes(mgmtId) && String(iid) === String(masterIid)) continue;

    const res = await fetch(
      `${apiBase}/projects/${encodeURIComponent(path)}/issues/${iid}`,
      { headers: { "PRIVATE-TOKEN": pat } },
    );

    if (res.ok) {
      const task = await res.json();
      const projectLabel = path.split("/").pop() || path;

      // Map task labels to category using configured label mapping
      let category: "todo" | "in_progress" | "integrated" | null = null;
      let matchedLabel = "Unset";

      // Check if issue is closed — treat as integrated regardless of labels
      if (task.state === "closed") {
        category = "integrated";
        matchedLabel = "Closed";
      } else {
        for (const label of task.labels || []) {
          const trimmed = label.trim();
          if (labelConfig.integrated.includes(trimmed)) {
            category = "integrated";
            matchedLabel = trimmed;
            break;
          }
          if (labelConfig.inProgress.includes(trimmed)) {
            category = "in_progress";
            matchedLabel = trimmed;
            break;
          }
          if (labelConfig.todo.includes(trimmed)) {
            category = "todo";
            matchedLabel = trimmed;
            break;
          }
        }
      }

      // Fallback: if no category matched, use first label or "Unset"
      if (!category) {
        matchedLabel = task.labels?.[0]?.trim() || "Unset";
        category = "todo";
      }

      subTaskStatuses.push(category);

      let icon = "🚧";
      let statusIcon = "";

      const lowerProject = projectLabel.toLowerCase();

      if (lowerProject.includes("android")) icon = "🤖";
      else if (lowerProject.includes("mobile")) icon = "📱";
      else if (lowerProject.includes("ios") || lowerProject.includes("apple"))
        icon = "🍎";
      else if (lowerProject.includes("web") || lowerProject.includes("frontend"))
        icon = "🌐";
      else if (lowerProject.includes("backend") || lowerProject.includes("api"))
        icon = "⚙️";
      else if (lowerProject.includes("design") || lowerProject.includes("figma"))
        icon = "🎨";

      if (category === "todo") statusIcon = "🚧";
      else if (category === "in_progress") statusIcon = "🏗️";
      else if (category === "integrated") statusIcon = "✅";

      tableRows += `| ${icon} \`${projectLabel}\` | ${task.title} | ${statusIcon} \`${matchedLabel}\` | ${ref} |\n`;
    } else {
      console.error(`❌ Failed to fetch sub-task ${ref}: ${res.status} ${res.statusText}`);
    }
  }

  // 3. Calculate Overall Status for the Master Task
  const overallStatus = calculateOverallStatus(subTaskStatuses);

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

  const currentStatusLabel = (master.labels || []).find((l: string) =>
    l.startsWith("Status::"),
  );
  const isStatusChanged = currentStatusLabel !== overallStatus;

  const hasOldTable = master.description.includes("## 📊 Development Status");
  const isTableChanged = !master.description.includes(tableRows.trim());

  if (!isStatusChanged && !isTableChanged && hasOldTable) {
    console.log(`✅ No changes detected for Master Task #${masterIid}. Skipping update.`);
    return "No changes detected. Sync skipped.";
  }

  const baseDesc = master.description
    .split("## 📊 Development Status")[0]
    .split("## 📊 Squad Development Status")[0]
    .trim();

  const finalDesc = `${baseDesc}\n\n${fullTableBlock}\n\n_🕒 Last Sync: ${new Date().toLocaleString("en-KH")}_\n<!-- gitlab_sync_task_update -->`;

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
