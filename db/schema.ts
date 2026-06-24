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

// Types
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type SyncLog = typeof syncLogs.$inferSelect;
export type NewSyncLog = typeof syncLogs.$inferInsert;
