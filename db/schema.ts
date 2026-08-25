import { sqliteTable, integer, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

export const projects = sqliteTable("projects", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  gitlabApiBase: text("gitlab_api_base").default("https://gitlab.com/api/v4"),
  gitlabPat: text("gitlab_pat").notNull(),
  mgmtId: text("mgmt_id").notNull(),
  namespace: text("namespace").notNull(),
  masterIid: text("master_iid"),
  telegramBotToken: text("telegram_bot_token").notNull(),
  telegramChatId: text("telegram_chat_id").notNull(),
  ignoreUsers: text("ignore_users").default(""),
  webhookSecret: text("webhook_secret").notNull().default(""),
  labelsTodo: text("labels_todo").default("Backlog, Refinement, Ready for Dev"),
  labelsInProgress: text("labels_in_progress").default("In Progress, Peer Review, Testing/QA"),
  labelsIntegrated: text("labels_integrated").default("Completed, Closed"),
  skipIgnoredUsers: integer("skip_ignored_users", { mode: "boolean" }).default(false),
  skipDescriptionOnlyUpdates: integer("skip_description_only_updates", { mode: "boolean" }).default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

export const syncLogs = sqliteTable("sync_logs", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  projectId: integer("project_id"),
  eventType: text("event_type"),
  masterIid: text("master_iid"),
  status: text("status").notNull(),
  message: text("message"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

export const userActivity = sqliteTable("user_activity", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  projectId: integer("project_id").notNull(),
  projectName: text("project_name").notNull(),
  gitlabProjectId: integer("gitlab_project_id").notNull(),
  userName: text("user_name").notNull(),
  userUsername: text("user_username").notNull(),
  activityType: text("activity_type").notNull(),
  itemIid: integer("item_iid").notNull(),
  itemTitle: text("item_title"),
  itemUrl: text("item_url"),
  occurredAt: integer("occurred_at", { mode: "timestamp" }).notNull(),
  syncedAt: integer("synced_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  labels: text("labels"),
  state: text("state"),
});

export const issueAnalytics = sqliteTable("issue_analytics", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  projectId: integer("project_id").notNull(),
  gitlabProjectId: integer("gitlab_project_id").notNull(),
  issueIid: integer("issue_iid").notNull(),
  issueTitle: text("issue_title"),
  issueUrl: text("issue_url"),
  
  // Issue metadata
  authorUsername: text("author_username").notNull(),
  authorName: text("author_name").notNull(),
  state: text("state").notNull(),
  labels: text("labels"),
  
  // Timing data
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  closedAt: integer("closed_at", { mode: "timestamp" }),
  firstResponseAt: integer("first_response_at", { mode: "timestamp" }),
  
  // Computed metrics (in hours)
  timeToCloseHours: integer("time_to_close_hours"),
  timeToFirstResponseHours: integer("time_to_first_response_hours"),
  
  // Collaboration
  commentCount: integer("comment_count").default(0),
  uniqueCommenters: text("unique_commenters"), // comma-separated usernames
  
  syncedAt: integer("synced_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

export const issueProgress = sqliteTable("issue_progress", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  projectId: integer("project_id").notNull(),
  gitlabProjectId: integer("gitlab_project_id").notNull(),
  issueIid: integer("issue_iid").notNull(),
  // Which phase the progress belongs to: "dev" (development) or "qa" (testing/UAT)
  stage: text("stage").notNull(),
  // 0-100 percentage, set via GitLab comment commands (/dev 60, /test 30%, /uat 35)
  progress: integer("progress").notNull(),
  updatedBy: text("updated_by"),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// Zod schemas for validation
export const insertProjectSchema = createInsertSchema(projects, {
  name: z.string().min(1, "Name is required"),
  gitlabPat: z.string().min(1, "GitLab PAT is required"),
  mgmtId: z.string().min(1, "Management Project ID is required"),
  namespace: z.string().min(1, "Namespace is required"),
  telegramBotToken: z.string().min(1, "Telegram Bot Token is required"),
  telegramChatId: z.string().min(1, "Telegram Chat ID is required"),
});

export const selectProjectSchema = createSelectSchema(projects);

export const insertSyncLogSchema = createInsertSchema(syncLogs, {
  status: z.enum(["success", "error", "skipped"]),
});

export const selectSyncLogSchema = createSelectSchema(syncLogs);

export const insertUserActivitySchema = createInsertSchema(userActivity, {
  activityType: z.enum([
    "issue_created",
    "issue_closed",
    "issue_reopened",
    "issue_comment",
    "mr_created",
    "mr_merged",
    "mr_closed",
    "mr_comment",
    "commit",
  ]),
});

export const selectUserActivitySchema = createSelectSchema(userActivity);

export const insertIssueAnalyticsSchema = createInsertSchema(issueAnalytics);
export const selectIssueAnalyticsSchema = createSelectSchema(issueAnalytics);

export const insertIssueProgressSchema = createInsertSchema(issueProgress, {
  stage: z.enum(["dev", "qa"]),
  progress: z.number().int().min(0).max(100),
});
export const selectIssueProgressSchema = createSelectSchema(issueProgress);

// Types
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type SyncLog = typeof syncLogs.$inferSelect;
export type NewSyncLog = typeof syncLogs.$inferInsert;
export type UserActivity = typeof userActivity.$inferSelect;
export type NewUserActivity = typeof userActivity.$inferInsert;
export type IssueAnalytics = typeof issueAnalytics.$inferSelect;
export type NewIssueAnalytics = typeof issueAnalytics.$inferInsert;
export type IssueProgress = typeof issueProgress.$inferSelect;
export type NewIssueProgress = typeof issueProgress.$inferInsert;
