import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { join } from "path";
import * as schema from "../db/schema";

const DB_PATH = process.env.DB_PATH || join(process.cwd(), "data", "app.db");

let database: Database.Database | null = null;

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      gitlab_api_base TEXT DEFAULT 'https://gitlab.com/api/v4',
      gitlab_pat TEXT NOT NULL,
      mgmt_id TEXT NOT NULL,
      namespace TEXT NOT NULL,
      master_iid TEXT,
      telegram_bot_token TEXT NOT NULL,
      telegram_chat_id TEXT NOT NULL,
      ignore_users TEXT DEFAULT '',
      webhook_secret TEXT NOT NULL DEFAULT '',
      labels_todo TEXT DEFAULT 'Backlog, Refinement, Ready for Dev',
      labels_in_progress TEXT DEFAULT 'In Progress, Peer Review, Testing/QA',
      labels_integrated TEXT DEFAULT 'Completed, Closed',
      skip_ignored_users INTEGER DEFAULT 0,
      skip_description_only_updates INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS sync_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER,
      event_type TEXT,
      master_iid TEXT,
      status TEXT NOT NULL,
      message TEXT,
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS user_activity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      project_name TEXT NOT NULL,
      gitlab_project_id INTEGER NOT NULL,
      user_name TEXT NOT NULL,
      user_username TEXT NOT NULL,
      activity_type TEXT NOT NULL,
      item_iid INTEGER NOT NULL,
      item_title TEXT,
      item_url TEXT,
      occurred_at INTEGER NOT NULL,
      synced_at INTEGER DEFAULT (unixepoch()),
      labels TEXT,
      state TEXT
    );

    CREATE TABLE IF NOT EXISTS issue_analytics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      gitlab_project_id INTEGER NOT NULL,
      issue_iid INTEGER NOT NULL,
      issue_title TEXT,
      issue_url TEXT,
      author_username TEXT NOT NULL,
      author_name TEXT NOT NULL,
      state TEXT NOT NULL,
      labels TEXT,
      created_at INTEGER NOT NULL,
      closed_at INTEGER,
      first_response_at INTEGER,
      time_to_close_hours INTEGER,
      time_to_first_response_hours INTEGER,
      comment_count INTEGER DEFAULT 0,
      unique_commenters TEXT,
      synced_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS issue_progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      gitlab_project_id INTEGER NOT NULL,
      issue_iid INTEGER NOT NULL,
      stage TEXT NOT NULL CHECK (stage IN ('dev', 'qa')),
      progress INTEGER NOT NULL CHECK (progress >= 0 AND progress <= 100),
      updated_by TEXT,
      updated_at INTEGER DEFAULT (unixepoch()),
      UNIQUE(gitlab_project_id, issue_iid, stage)
    );

    CREATE TABLE IF NOT EXISTS issue_progress_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      gitlab_project_id INTEGER NOT NULL,
      issue_iid INTEGER NOT NULL,
      stage TEXT NOT NULL CHECK (stage IN ('dev', 'qa')),
      progress INTEGER NOT NULL CHECK (progress >= 0 AND progress <= 100),
      updated_by TEXT NOT NULL DEFAULT '',
      occurred_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS issue_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      gitlab_project_id INTEGER NOT NULL,
      issue_iid INTEGER NOT NULL,
      linked_gitlab_project_id INTEGER NOT NULL,
      linked_issue_iid INTEGER NOT NULL,
      link_type TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_sync_logs_project_id ON sync_logs(project_id);
    CREATE INDEX IF NOT EXISTS idx_sync_logs_created_at ON sync_logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_user_activity_user ON user_activity(user_username);
    CREATE INDEX IF NOT EXISTS idx_user_activity_type ON user_activity(activity_type);
    CREATE INDEX IF NOT EXISTS idx_user_activity_occurred ON user_activity(occurred_at);
    CREATE INDEX IF NOT EXISTS idx_user_activity_project ON user_activity(project_id);
    CREATE INDEX IF NOT EXISTS idx_issue_analytics_author ON issue_analytics(author_username);
    CREATE INDEX IF NOT EXISTS idx_issue_analytics_project ON issue_analytics(gitlab_project_id);
    CREATE INDEX IF NOT EXISTS idx_issue_progress_lookup ON issue_progress(gitlab_project_id, issue_iid);
    -- Dedup: repeated syncs re-parse the same notes; this keeps history append-only
    -- without duplicates. updated_by is NOT NULL so the index is deterministic.
    CREATE UNIQUE INDEX IF NOT EXISTS idx_issue_progress_history_dedup
      ON issue_progress_history(gitlab_project_id, issue_iid, stage, progress, updated_by, occurred_at);
    CREATE INDEX IF NOT EXISTS idx_issue_links_master ON issue_links(gitlab_project_id, issue_iid);
    CREATE INDEX IF NOT EXISTS idx_issue_links_target ON issue_links(linked_gitlab_project_id, linked_issue_iid);
  `);

  // Backfill: auto-generate secrets for any existing rows without one
  db.exec(`
    UPDATE projects
    SET webhook_secret = lower(hex(randomblob(16)))
    WHERE webhook_secret IS NULL OR webhook_secret = ''
  `);

  // Migration: add new columns to existing tables (CREATE TABLE IF NOT EXISTS only works for new DBs)
  const cols = db.pragma("table_info(projects)") as Array<{ name: string }>;
  const existing = new Set(cols.map((c) => c.name));

  if (!existing.has("skip_ignored_users")) {
    db.exec("ALTER TABLE projects ADD COLUMN skip_ignored_users INTEGER DEFAULT 0");
  }
  if (!existing.has("skip_description_only_updates")) {
    db.exec("ALTER TABLE projects ADD COLUMN skip_description_only_updates INTEGER DEFAULT 0");
  }
}

export function getDb() {
  if (!database) {
    database = new Database(DB_PATH);
    database.exec("PRAGMA journal_mode = WAL;");
    initSchema(database);
  }
  return drizzle(database, { schema });
}
