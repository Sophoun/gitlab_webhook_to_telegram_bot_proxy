import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { projects, userActivity, issueAnalytics, issueProgress } from "@/db/schema";
import { createGitLabClient } from "@/lib/gitlab-api";
import { parseProgressUpdate } from "@/lib/progress-parser";
import { eq } from "drizzle-orm";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { gitlab_project_ids, from_date } = body;

    const db = getDb();

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

        if (projectsToSync.length === 0) {
          console.log(`  No matching projects to sync for this config`);
          continue;
        }

        console.log(`  Will sync ${projectsToSync.length} projects`);

        for (const gitlabProject of projectsToSync) {
          console.log(`  Fetching data for: ${gitlabProject.path_with_namespace}`);

          // Delete existing records for this GitLab project
          await db.delete(userActivity).where(
            eq(userActivity.gitlabProjectId, gitlabProject.id)
          );
          await db.delete(issueAnalytics).where(
            eq(issueAnalytics.gitlabProjectId, gitlabProject.id)
          );

          // Collect all activities for batch insert
          const activitiesToInsert: Array<typeof userActivity.$inferInsert> = [];
          const issueAnalyticsToInsert: Array<typeof issueAnalytics.$inferInsert> = [];

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
              userUsername: issue.author.username,
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
                userUsername: closer.username,
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
                commenters.add(note.author.username);

                // Check if this is the first response by someone other than author
                if (!firstResponseAt && note.author.username !== issue.author.username) {
                  firstResponseAt = new Date(note.created_at);
                }

                // Parse progress commands (e.g. "/dev 60", "/uat 35%")
                const progressCmds = parseProgressUpdate(note.body);
                if (progressCmds.dev !== null || progressCmds.qa !== null) {
                  const noteAt = new Date(note.created_at);
                  if (
                    progressCmds.dev !== null &&
                    (!devProgressEntry || noteAt >= devProgressEntry.at)
                  ) {
                    devProgressEntry = {
                      value: progressCmds.dev,
                      at: noteAt,
                      by: note.author.username,
                    };
                  }
                  if (
                    progressCmds.qa !== null &&
                    (!qaProgressEntry || noteAt >= qaProgressEntry.at)
                  ) {
                    qaProgressEntry = {
                      value: progressCmds.qa,
                      at: noteAt,
                      by: note.author.username,
                    };
                  }
                }

                // Add comment activity
                activitiesToInsert.push({
                  projectId: config.id,
                  projectName: config.name,
                  gitlabProjectId: gitlabProject.id,
                  userName: note.author.name,
                  userUsername: note.author.username,
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
                authorUsername: issue.author.username,
                authorName: issue.author.name,
                state: issue.state,
                labels: issue.labels.join(","),
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
          }

          // Fetch merge requests
          const mergeRequests = await client.getMergeRequests(gitlabProject.id, from_date);
          stats.mrsFetched += mergeRequests.length;
          console.log(`    Found ${mergeRequests.length} merge requests`);

          for (const mr of mergeRequests) {
            activitiesToInsert.push({
              projectId: config.id,
              projectName: config.name,
              gitlabProjectId: gitlabProject.id,
              userName: mr.author.name,
              userUsername: mr.author.username,
              activityType: "mr_created",
              itemIid: mr.iid,
              itemTitle: mr.title,
              itemUrl: mr.web_url,
              occurredAt: new Date(mr.created_at),
              labels: mr.labels.join(","),
              state: mr.state,
            });

            if (mr.merged_at) {
              // Credit the person who actually merged, not the MR author
              const merger = mr.merged_by ?? mr.author;
              activitiesToInsert.push({
                projectId: config.id,
                projectName: config.name,
                gitlabProjectId: gitlabProject.id,
                userName: merger.name,
                userUsername: merger.username,
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
                userUsername: mr.author.username,
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

          // Fetch commits
          const commits = await client.getCommits(gitlabProject.id, from_date);
          stats.commitsFetched += commits.length;
          console.log(`    Found ${commits.length} commits`);

          // Build email/name -> GitLab username maps from project members so
          // commits are attributed to real users instead of email prefixes.
          const emailToUsername = new Map<string, string>();
          const nameToUsername = new Map<string, string>();
          try {
            const members = await client.getProjectMembers(gitlabProject.id);
            for (const m of members) {
              if (m.email) emailToUsername.set(m.email.toLowerCase(), m.username);
              if (m.public_email)
                emailToUsername.set(m.public_email.toLowerCase(), m.username);
              nameToUsername.set(m.name.toLowerCase(), m.username);
            }
          } catch (err) {
            console.warn(
              `    Could not fetch members for commit attribution: ${err instanceof Error ? err.message : err}`
            );
          }

          for (const commit of commits) {
            const email = (commit.author_email || "").toLowerCase();
            const resolvedUsername =
              emailToUsername.get(email) ??
              nameToUsername.get(commit.author_name.toLowerCase()) ??
              commit.author_email.split("@")[0];

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
