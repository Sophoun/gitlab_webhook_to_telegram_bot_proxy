/* eslint-disable no-var */
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
  secret: z.string().optional().describe("Webhook secret token for x-gitlab-token validation"),
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
      { error: "Missing or invalid configuration parameters", details: configParse.error.format() },
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
  const body = await req.json();

  // 1. Try extraction from body text (Master: #123)
  if (!masterIid) {
    const description = body.object_attributes?.description || "";
    const note = body.object_attributes?.note || "";
    const content = `${description} ${note}`;
    const match = content.match(/(?:Master|Parent)(?:\s+Ticket)?:\s*#(\d+)/i);
    if (match) masterIid = match[1];
  }

  // 2. Try Auto-Discovery from native links/mentions
  if (!masterIid) {
    const subProjectId = body.project?.id;
    const subIssueIid = body.object_attributes?.iid || body.issue?.iid;

    if (subProjectId && subIssueIid) {
      console.log(`🔍 POST Discovery: Attempting auto-discovery for Master Ticket...`);
      masterIid = await discoverMasterIid(subProjectId, subIssueIid, config);
    }
  }

  if (!masterIid) {
    return NextResponse.json(
      { error: "Could not identify Master Ticket IID. Please link the issue or add 'Master: #123' to description." },
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
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * Helper to discover Master Ticket IID from a sub-task.
 */
async function discoverMasterIid(subProjectId: number, subIssueIid: number, config: Config): Promise<string | null> {
  const { apiBase, pat, mgmtId } = config;

  // Strategy A: Check Native Issue Links
  try {
    const linksRes = await fetch(
      `${apiBase}/projects/${subProjectId}/issues/${subIssueIid}/links`,
      { headers: { "PRIVATE-TOKEN": pat } }
    );
    if (linksRes.ok) {
      const links = await linksRes.json();
      const masterLink = links.find((l: any) => 
        String(l.project_id) === String(mgmtId) || 
        l.web_url.includes(`/projects/${mgmtId}/`)
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
      { headers: { "PRIVATE-TOKEN": pat } }
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

  // 1. Fetch mentions from the Master ticket to find all sub-tasks
  const notesRes = await fetch(
    `${apiBase}/projects/${mgmtId}/issues/${masterIid}/notes?per_page=100`,
    { headers: { "PRIVATE-TOKEN": pat } },
  );
  
  if (!notesRes.ok) {
    throw new Error(`Failed to fetch notes from master ticket: ${notesRes.statusText}`);
  }
  
  const notes = await notesRes.json();
  const uniqueRefs = Array.from(
    new Set(
      notes
        .filter((n: any) => n.system && n.body.includes("mentioned in issue"))
        .map((n: any) => {
          const m = n.body.match(/issue ([\w\-\.\/]+#\d+)/);
          return m ? m[1] : null;
        })
        .filter(Boolean),
    ),
  );

  if (uniqueRefs.length === 0) return "No linked sub-tasks found.";

  // 2. Build the table rows
  let tableRows = "";
  for (const ref of uniqueRefs) {
    var [path, iid] = (ref as string).split("#");
    if (!path.includes("/")) {
      path = `${namespace}/${path}`;
    }
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

      let icon = "🚧";
      if (statusLabel.includes("To Do")) {
        icon = "🚧";
      } else if (statusLabel.includes("Development") || statusLabel.includes("In Progress")) {
        icon = "🏗️";
      } else if (statusLabel.includes("Review") || statusLabel.includes("QA")) {
        icon = "🧪";
      } else if (statusLabel.includes("Integrated") || statusLabel.includes("Done")) {
        icon = "✅";
      }

      tableRows += `| ${projectLabel} | ${task.title} | ${icon} \`${statusLabel}\` | ${ref} |\n`;
    }
  }

  // 3. Construct the FULL Markdown Table
  const tableHeader =
    "## 📊 Development Status\n\n" +
    "| Project | Task Description | Current Status | Reference |\n" +
    "| :--- | :--- | :--- | :--- |\n";

  const fullTableBlock = tableHeader + tableRows;

  // 4. Update Master Ticket
  const masterRes = await fetch(
    `${apiBase}/projects/${mgmtId}/issues/${masterIid}`,
    { headers: { "PRIVATE-TOKEN": pat } },
  );
  
  if (!masterRes.ok) {
    throw new Error(`Failed to fetch master ticket: ${masterRes.statusText}`);
  }
  
  const master = await masterRes.json();
  const baseDesc = master.description
    .split("## 📊 Development Status")[0]
    .split("## 📊 Squad Development Status")[0]
    .trim();

  const finalDesc = `${baseDesc}\n\n${fullTableBlock}\n\n_🕒 Last Sync: ${new Date().toLocaleString("en-KH")}_`;

  await fetch(`${apiBase}/projects/${mgmtId}/issues/${masterIid}`, {
    method: "PUT",
    headers: { "PRIVATE-TOKEN": pat, "Content-Type": "application/json" },
    body: JSON.stringify({ description: finalDesc }),
  });

  return fullTableBlock;
}
