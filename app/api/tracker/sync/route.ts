import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import {
  projects,
  userActivity,
  issueAnalytics,
  issueProgress,
  issueProgressHistory,
  issueLinks,
  issueTasks,
  gitlabRepos,
} from "@/db/schema";
import { createGitLabClient } from "@/lib/gitlab-api";
import { parseProgressCommands, parseProgressUpdate } from "@/lib/progress-parser";
import { parseCrossProjectRefs } from "@/lib/issue-links";
import { parseIssueTasks } from "@/lib/task-parser";
import { and, eq, ne } from "drizzle-orm";

/**
 * Normalize a person's display name so variants match: "Dalin.LOEM",
 * "Dalin LOEM" and "dalin loem" all collapse to the same key. Words are then
 * sorted because given/family order flips between systems ("Sophoun NHEUM"
 * vs "Nheum Sophoun").
 */
function normalizePersonName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .sort()
    .join(" ");
}

/**
 * Build lookup maps from every username/name ever recorded on issues, MRs and
 * comments (NOT commits — those are the records we're trying to fix).
 * Used to resolve commit authors who push under secondary accounts or with
 * casing variants: their commit is remapped to the canonical roster identity.
 */
async function buildRosterMaps(db: ReturnType<typeof getDb>) {
  const rows = await db
    .select({
      username: userActivity.userUsername,
      name: userActivity.userName,
    })
    .from(userActivity)
    .where(ne(userActivity.activityType, "commit"));

  const usernamesByLower = new Map<string, string>(); // lower username -> canonical
  const usernameByName = new Map<string, string>(); // normalized name -> canonical
  for (const r of rows) {
    if (!r.username) continue;
    const lower = r.username.toLowerCase();
    if (!usernamesByLower.has(lower)) usernamesByLower.set(lower, lower);
    const norm = normalizePersonName(r.name || "");
    if (norm && !usernameByName.has(norm)) usernameByName.set(norm, lower);
  }
  return { usernamesByLower, usernameByName };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { gitlab_project_ids, from_date, clean } = body;

    const db = getDb();

    // If clean=true, wipe all analytics tables before re-syncing
    if (clean) {
      await db.delete(userActivity);
      await db.delete(issueAnalytics);
      await db.delete(issueLinks);
      await db.delete(issueTasks);
      await db.delete(issueProgressHistory);
      // NOTE: issue_progress is intentionally NOT wiped — it persists across runs
    }

    // Canonical identity maps for commit attribution (see buildRosterMaps).
    // Built BEFORE any rows are deleted so prior sync data is still visible.
    const roster = await buildRosterMaps(db);

    // Get all project configs
    const allConfigs = await db.select().from(projects);

    if (allConfigs.length === 0) {
      return NextResponse.json({ error: "No projects configured" }, { status: 400 });
    }

    const stats = {
      projectsSynced: 0,
      issuesFetched: 0,
      mrsFetched: 0,
      commitsFetched: 0,
      activitiesRecorded: 0,
      issueAnalyticsRecorded: 0,
      progressUpdatesRecorded: 0,
      progressHistoryRecorded: 0,
      issueLinksRecorded: 0,
      issueTasksRecorded: 0,
    };

    // Build a map of GitLab project IDs we want to sync
    const targetGitlabIds = gitlab_project_ids && Array.isArray(gitlab_project_ids) && gitlab_project_ids.length > 0
      ? new Set(gitlab_project_ids)
      : null;

    for (const config of allConfigs) {
      try {
        console.log(`Checking config: ${config.name} (${config.id})`);

        const client = createGitLabClient({
          ...config,
          gitlabApiBase: config.gitlabApiBase || "https://gitlab.com/api/v4",
        });

        const gitlabProjects = await client.getProjects();
        console.log(`  Found ${gitlabProjects.length} GitLab projects`);

        const projectsToSync = targetGitlabIds
          ? gitlabProjects.filter((gp) => targetGitlabIds.has(gp.id))
          : gitlabProjects;

        // Cache every repo seen this run so the dashboard can offer per-repo
        // scoping (child repos have their own boards and teams).
        const mainId = parseInt(config.mgmtId);
        for (const gp of gitlabProjects) {
          await db
            .insert(gitlabRepos)
            .values({
              id: gp.id,
              configProjectId: config.id,
              name: gp.name,
              pathWithNamespace: gp.path_with_namespace,
              isMain: gp.id === mainId,
              syncedAt: new Date(),
            })
            .onConflictDoUpdate({
              target: gitlabRepos.id,
              set: {
                configProjectId: config.id,
                name: gp.name,
                pathWithNamespace: gp.path_with_namespace,
                isMain: gp.id === mainId,
                syncedAt: new Date(),
              },
            });
        }

        if (projectsToSync.length === 0) {
          console.log(`  No matching projects to sync for this config`);
          continue;
        }

        console.log(`  Will sync ${projectsToSync.length} projects`);

        for (const gitlabProject of projectsToSync) {
          console.log(`  Fetching data for: ${gitlabProject.path_with_namespace}`);

          // Link sync only applies to MAIN projects (master tickets live there)
          const isMainProject = parseInt(config.mgmtId) === gitlabProject.id;

          // Delete existing records for this GitLab project
          await db.delete(userActivity).where(
            eq(userActivity.gitlabProjectId, gitlabProject.id)
          );
          await db.delete(issueAnalytics).where(
            eq(issueAnalytics.gitlabProjectId, gitlabProject.id)
          );
          if (isMainProject) {
            // Keep child-contributed subtask_ref rows; they are owned by the
            // child repo's own sync (deleted/rebuilt there).
            await db
              .delete(issueLinks)
              .where(
                and(
                  eq(issueLinks.gitlabProjectId, gitlabProject.id),
                  ne(issueLinks.linkType, "subtask_ref")
                )
              );
          }

          // Collect all activities for batch insert
          const activitiesToInsert: Array<typeof userActivity.$inferInsert> = [];
          const issueAnalyticsToInsert: Array<typeof issueAnalytics.$inferInsert> = [];
          const issueProgressHistoryToInsert: Array<typeof issueProgressHistory.$inferInsert> = [];
          const issueLinksToInsert: Array<typeof issueLinks.$inferInsert> = [];
          const issueTasksToInsert: Array<typeof issueTasks.$inferInsert> = [];

          // Namespace path -> GitLab project id, for resolving description refs
          const pathToProjectId = new Map<string, number>();
          for (const gp of gitlabProjects) {
            pathToProjectId.set(gp.path_with_namespace.toLowerCase(), gp.id);
          }

          // Fetch issues
          const issues = await client.getIssues(gitlabProject.id, from_date);
          stats.issuesFetched += issues.length;
          console.log(`    Found ${issues.length} issues`);

          // Process issues and fetch their notes for analytics
          for (const issue of issues) {
            // Issue created activity
            activitiesToInsert.push({
              projectId: config.id,
              projectName: config.name,
              gitlabProjectId: gitlabProject.id,
              userName: issue.author.name,
              userUsername: issue.author.username.toLowerCase(),
              activityType: "issue_created",
              itemIid: issue.iid,
              itemTitle: issue.title,
              itemUrl: issue.web_url,
              occurredAt: new Date(issue.created_at),
              labels: issue.labels.join(","),
              state: issue.state,
            });

            // Issue closed activity — credit the person who ACTUALLY closed it
            // (closed_by), falling back to the author only when GitLab doesn't
            // tell us who closed it.
            if (issue.closed_at) {
              const closer = issue.closed_by?.[0] ?? issue.author;
              activitiesToInsert.push({
                projectId: config.id,
                projectName: config.name,
                gitlabProjectId: gitlabProject.id,
                userName: closer.name,
                userUsername: closer.username.toLowerCase(),
                activityType: "issue_closed",
                itemIid: issue.iid,
                itemTitle: issue.title,
                itemUrl: issue.web_url,
                occurredAt: new Date(issue.closed_at),
                labels: issue.labels.join(","),
                state: "closed",
              });
            }

            // Fetch issue notes for analytics (timing + collaboration)
            try {
              const notes = await client.getIssueNotes(gitlabProject.id, issue.iid);
              const nonSystemNotes = notes.filter((n) => !n.system);

              // Find first response (first comment by someone other than author)
              let firstResponseAt: Date | null = null;
              const commenters = new Set<string>();

              // Latest progress command per stage from comments
              // (/dev 60, /test 30%, /uat 35) — later notes win.
              let devProgressEntry: { value: number; at: Date; by: string } | null = null;
              let qaProgressEntry: { value: number; at: Date; by: string } | null = null;

              for (const note of nonSystemNotes) {
                const noteUsername = note.author.username.toLowerCase();
                commenters.add(noteUsername);

                // Check if this is the first response by someone other than author
                if (!firstResponseAt && note.author.username !== issue.author.username) {
                  firstResponseAt = new Date(note.created_at);
                }
                // Parse progress commands (e.g. "/dev 60", "/uat 35%")
                const progressCmds = parseProgressUpdate(note.body);
                if (progressCmds.dev !== null || progressCmds.qa !== null) {
                  const noteAt = new Date(note.created_at);

                  // Log every command occurrence to the append-only history
                  // (deduplicated by unique index across repeated syncs)
                  for (const cmd of parseProgressCommands(note.body)) {
                    issueProgressHistoryToInsert.push({
                      projectId: config.id,
                      gitlabProjectId: gitlabProject.id,
                      issueIid: issue.iid,
                      stage: cmd.stage,
                      progress: cmd.value,
                      updatedBy: noteUsername,
                      occurredAt: noteAt,
                    });
                  }

                  if (
                    progressCmds.dev !== null &&
                    (!devProgressEntry || noteAt >= devProgressEntry.at)
                  ) {
                    devProgressEntry = {
                      value: progressCmds.dev,
                      at: noteAt,
                      by: noteUsername,
                    };
                  }
                  if (
                    progressCmds.qa !== null &&
                    (!qaProgressEntry || noteAt >= qaProgressEntry.at)
                  ) {
                    qaProgressEntry = {
                      value: progressCmds.qa,
                      at: noteAt,
                      by: noteUsername,
                    };
                  }
                }

                // Add comment activity
                activitiesToInsert.push({
                  projectId: config.id,
                  projectName: config.name,
                  gitlabProjectId: gitlabProject.id,
                  userName: note.author.name,
                  userUsername: noteUsername,
                  activityType: "issue_comment",
                  itemIid: issue.iid,
                  itemTitle: issue.title,
                  itemUrl: issue.web_url,
                  occurredAt: new Date(note.created_at),
                  labels: issue.labels.join(","),
                  state: issue.state,
                });
              }

              // Calculate timing metrics
              const createdAt = new Date(issue.created_at);
              const closedAt = issue.closed_at ? new Date(issue.closed_at) : null;

              const timeToCloseHours = closedAt
                ? Math.round((closedAt.getTime() - createdAt.getTime()) / (1000 * 60 * 60))
                : null;

              const timeToFirstResponseHours = firstResponseAt
                ? Math.round((firstResponseAt.getTime() - createdAt.getTime()) / (1000 * 60 * 60))
                : null;

              // Insert issue analytics
              issueAnalyticsToInsert.push({
                projectId: config.id,
                gitlabProjectId: gitlabProject.id,
                issueIid: issue.iid,
                issueTitle: issue.title,
                issueUrl: issue.web_url,
                authorUsername: issue.author.username.toLowerCase(),
                authorName: issue.author.name,
                state: issue.state,
                labels: issue.labels.join(","),
                assigneeUsernames:
                  issue.assignees
                    ?.map((a) => a.username.toLowerCase())
                    .join(",") || null,
                createdAt: createdAt,
                closedAt: closedAt,
                firstResponseAt: firstResponseAt,
                timeToCloseHours: timeToCloseHours,
                timeToFirstResponseHours: timeToFirstResponseHours,
                commentCount: nonSystemNotes.length,
                uniqueCommenters: Array.from(commenters).join(","),
              });

              // Upsert progress values parsed from comment commands.
              // issue_progress is NOT wiped by sync — it persists across runs,
              // so only update rows when a command was actually found.
              const progressEntries = [
                { stage: "dev" as const, entry: devProgressEntry },
                { stage: "qa" as const, entry: qaProgressEntry },
              ];
              for (const { stage, entry } of progressEntries) {
                if (!entry) continue;
                await db
                  .insert(issueProgress)
                  .values({
                    projectId: config.id,
                    gitlabProjectId: gitlabProject.id,
                    issueIid: issue.iid,
                    stage,
                    progress: entry.value,
                    updatedBy: entry.by,
                    updatedAt: entry.at,
                  })
                  .onConflictDoUpdate({
                    target: [
                      issueProgress.gitlabProjectId,
                      issueProgress.issueIid,
                      issueProgress.stage,
                    ],
                    set: {
                      progress: entry.value,
                      updatedBy: entry.by,
                      updatedAt: entry.at,
                    },
                  });
                stats.progressUpdatesRecorded++;
              }
            } catch (error) {
              console.error(`    Error fetching notes for issue ${issue.iid}:`, error);
            }

            // Linked issues (main projects only): formal "Linked issues"
            // relations + cross-project `path#iid` references in the description
            if (isMainProject) {
              const seenTargets = new Set<string>();
              const addLink = (
                targetProjectId: number,
                targetIid: number,
                linkType: string
              ) => {
                if (!targetProjectId || targetProjectId <= 0) return;
                const key = `${targetProjectId}#${targetIid}`;
                if (key === `${gitlabProject.id}#${issue.iid}`) return; // self-link
                if (seenTargets.has(key)) return;
                seenTargets.add(key);
                issueLinksToInsert.push({
                  projectId: config.id,
                  gitlabProjectId: gitlabProject.id,
                  issueIid: issue.iid,
                  linkedGitlabProjectId: targetProjectId,
                  linkedIssueIid: targetIid,
                  linkType,
                });
              };

              try {
                const links = await client.getIssueLinks(gitlabProject.id, issue.iid);
                for (const l of links) {
                  addLink(l.project_id, l.iid, l.link_type || "relates_to");
                }
              } catch (error) {
                console.warn(
                  `    Could not fetch links for issue ${issue.iid}: ${error instanceof Error ? error.message : error}`
                );
              }

              for (const ref of parseCrossProjectRefs(issue.description)) {
                const targetId = pathToProjectId.get(ref.path.toLowerCase());
                if (targetId !== undefined) {
                  addLink(targetId, ref.iid, "description_ref");
                }
              }
            }

            // Parse tasks from issue description (all projects)
            const parsedTasks = parseIssueTasks(issue.description);
            for (const task of parsedTasks) {
              issueTasksToInsert.push({
                projectId: config.id,
                gitlabProjectId: gitlabProject.id,
                issueIid: issue.iid,
                taskText: task.text,
                assigneeUsername: task.assigneeUsername,
                isCompleted: task.isCompleted,
              });
            }
          }

          // Child repos: capture "Parent: group/repo#123" references that point
          // AT master tickets. Stored from the master's perspective so the
          // review API finds them via (gitlab_project_id, issue_iid) of the
          // master. Rows are owned by this child (link_type='subtask_ref') and
          // rebuilt on every child sync to stay fresh.
          if (!isMainProject) {
            await db
              .delete(issueLinks)
              .where(
                and(
                  eq(issueLinks.linkedGitlabProjectId, gitlabProject.id),
                  eq(issueLinks.linkType, "subtask_ref")
                )
              );
            for (const issue of issues) {
              for (const ref of parseCrossProjectRefs(issue.description)) {
                const targetId = pathToProjectId.get(ref.path.toLowerCase());
                if (
                  targetId !== undefined &&
                  targetId !== gitlabProject.id &&
                  ref.iid > 0
                ) {
                  issueLinksToInsert.push({
                    projectId: config.id,
                    gitlabProjectId: targetId,
                    issueIid: ref.iid,
                    linkedGitlabProjectId: gitlabProject.id,
                    linkedIssueIid: issue.iid,
                    linkType: "subtask_ref",
                  });
                }
              }
            }
          }

          // Fetch merge requests
          const mergeRequests = await client.getMergeRequests(gitlabProject.id, from_date);
          stats.mrsFetched += mergeRequests.length;
          console.log(`    Found ${mergeRequests.length} merge requests`);

          for (const mr of mergeRequests) {
            const mrAuthorUsername = mr.author.username.toLowerCase();
            activitiesToInsert.push({
              projectId: config.id,
              projectName: config.name,
              gitlabProjectId: gitlabProject.id,
              userName: mr.author.name,
              userUsername: mrAuthorUsername,
              activityType: "mr_created",
              itemIid: mr.iid,
              itemTitle: mr.title,
              itemUrl: mr.web_url,
              occurredAt: new Date(mr.created_at),
              labels: mr.labels.join(","),
              state: mr.state,
            });

            if (mr.merged_at) {
              // Credit the MR to its AUTHOR — the person who wrote the code —
              // not to whoever clicked merge (often a lead merging the team's work).
              activitiesToInsert.push({
                projectId: config.id,
                projectName: config.name,
                gitlabProjectId: gitlabProject.id,
                userName: mr.author.name,
                userUsername: mrAuthorUsername,
                activityType: "mr_merged",
                itemIid: mr.iid,
                itemTitle: mr.title,
                itemUrl: mr.web_url,
                occurredAt: new Date(mr.merged_at),
                labels: mr.labels.join(","),
                state: "merged",
              });
            }

            if (mr.closed_at && !mr.merged_at) {
              activitiesToInsert.push({
                projectId: config.id,
                projectName: config.name,
                gitlabProjectId: gitlabProject.id,
                userName: mr.author.name,
                userUsername: mrAuthorUsername,
                activityType: "mr_closed",
                itemIid: mr.iid,
                itemTitle: mr.title,
                itemUrl: mr.web_url,
                occurredAt: new Date(mr.closed_at),
                labels: mr.labels.join(","),
                state: "closed",
              });
            }
          }

          // Fetch commits across ALL recently-active branches — the default
          // branch alone hides feature-branch work until it's merged.
          const commits = await client.getAllBranchCommits(
            gitlabProject.id,
            from_date,
            gitlabProject.default_branch
          );
          stats.commitsFetched += commits.length;
          console.log(`    Found ${commits.length} commits`);

          // Build email/name -> GitLab username maps from project members so
          // commits are attributed to real users instead of email prefixes.
          // Keys AND values are lowercased: usernames are matched
          // case-insensitively everywhere else, so "SEAVYONG.LA" and
          // "seavyong.la" must not become two different people.
          // Members with empty usernames are skipped — an empty mapping value
          // would otherwise pass the ?? fallback and blank out attribution.
          const emailToUsername = new Map<string, string>();
          const nameToUsername = new Map<string, string>();
          try {
            const members = await client.getProjectMembers(gitlabProject.id);
            for (const m of members) {
              if (!m.username) continue;
              const lower = m.username.toLowerCase();
              if (m.email) emailToUsername.set(m.email.toLowerCase(), lower);
              if (m.public_email)
                emailToUsername.set(m.public_email.toLowerCase(), lower);
              if (m.name) nameToUsername.set(m.name.toLowerCase(), lower);
            }
          } catch (err) {
            console.warn(
              `    Could not fetch members for commit attribution: ${err instanceof Error ? err.message : err}`
            );
          }

          for (const commit of commits) {
            const email = (commit.author_email || "").toLowerCase();
            let resolvedUsername =
              emailToUsername.get(email) ??
              nameToUsername.get(commit.author_name.toLowerCase()) ??
              (commit.author_email.split("@")[0] || commit.author_name);
            resolvedUsername = resolvedUsername.toLowerCase();

            // Alias unification: secondary accounts (e.g. "dalinloem_cmcb")
            // are remapped to the canonical roster identity when the author's
            // display name matches a known person. Usernames already on the
            // roster are kept as-is.
            if (!roster.usernamesByLower.has(resolvedUsername)) {
              const canonical = roster.usernameByName.get(
                normalizePersonName(commit.author_name || "")
              );
              if (canonical) resolvedUsername = canonical;
            }

            activitiesToInsert.push({
              projectId: config.id,
              projectName: config.name,
              gitlabProjectId: gitlabProject.id,
              userName: commit.author_name,
              userUsername: resolvedUsername,
              activityType: "commit",
              itemIid: 0,
              itemTitle: commit.title,
              itemUrl: commit.web_url,
              occurredAt: new Date(commit.committed_date),
              labels: null,
              state: null,
            });
          }

          // Batch insert all activities
          if (activitiesToInsert.length > 0) {
            const BATCH_SIZE = 100;
            for (let i = 0; i < activitiesToInsert.length; i += BATCH_SIZE) {
              const batch = activitiesToInsert.slice(i, i + BATCH_SIZE);
              await db.insert(userActivity).values(batch);
            }
            stats.activitiesRecorded += activitiesToInsert.length;
            console.log(`    Inserted ${activitiesToInsert.length} activities`);
          }

          // Batch insert issue analytics
          if (issueAnalyticsToInsert.length > 0) {
            const BATCH_SIZE = 100;
            for (let i = 0; i < issueAnalyticsToInsert.length; i += BATCH_SIZE) {
              const batch = issueAnalyticsToInsert.slice(i, i + BATCH_SIZE);
              await db.insert(issueAnalytics).values(batch);
            }
            stats.issueAnalyticsRecorded += issueAnalyticsToInsert.length;
            console.log(`    Inserted ${issueAnalyticsToInsert.length} issue analytics`);
          }

          // Batch insert progress history (append-only, dedup via unique index)
          if (issueProgressHistoryToInsert.length > 0) {
            const BATCH_SIZE = 100;
            for (let i = 0; i < issueProgressHistoryToInsert.length; i += BATCH_SIZE) {
              const batch = issueProgressHistoryToInsert.slice(i, i + BATCH_SIZE);
              await db.insert(issueProgressHistory).values(batch).onConflictDoNothing();
            }
            stats.progressHistoryRecorded += issueProgressHistoryToInsert.length;
            console.log(
              `    Recorded ${issueProgressHistoryToInsert.length} progress history entries`
            );
          }

          // Batch insert issue links (main projects only)
          if (issueLinksToInsert.length > 0) {
            const BATCH_SIZE = 100;
            for (let i = 0; i < issueLinksToInsert.length; i += BATCH_SIZE) {
              const batch = issueLinksToInsert.slice(i, i + BATCH_SIZE);
              await db.insert(issueLinks).values(batch);
            }
            stats.issueLinksRecorded += issueLinksToInsert.length;
            console.log(`    Inserted ${issueLinksToInsert.length} issue links`);
          }

          // Upsert parsed tasks: delete old tasks for this project, then insert fresh
          if (issueTasksToInsert.length > 0) {
            // Delete all tasks for this config project (full refresh per sync)
            await db
              .delete(issueTasks)
              .where(eq(issueTasks.projectId, config.id));

            const BATCH_SIZE = 100;
            for (let i = 0; i < issueTasksToInsert.length; i += BATCH_SIZE) {
              const batch = issueTasksToInsert.slice(i, i + BATCH_SIZE);
              await db.insert(issueTasks).values(batch);
            }
            stats.issueTasksRecorded += issueTasksToInsert.length;
            console.log(`    Inserted ${issueTasksToInsert.length} parsed issue tasks`);
          }
        }

        stats.projectsSynced++;
      } catch (error) {
        console.error(`Error syncing config ${config.id}:`, error);
      }
    }

    return NextResponse.json({
      status: "success",
      message: "Sync completed",
      stats,
    });
  } catch (error) {
    console.error("Sync error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
