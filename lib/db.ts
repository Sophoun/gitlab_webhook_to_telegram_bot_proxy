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

    CREATE INDEX IF NOT EXISTS idx_sync_logs_project_id ON sync_logs(project_id);
    CREATE INDEX IF NOT EXISTS idx_sync_logs_created_at ON sync_logs(created_at);
  `);

  // Backfill: auto-generate secrets for any existing rows without one
  db.exec(`
    UPDATE projects
    SET webhook_secret = lower(hex(randomblob(16)))
    WHERE webhook_secret IS NULL OR webhook_secret = ''
  `);
}

export function getDb() {
  if (!database) {
    database = new Database(DB_PATH);
    database.exec("PRAGMA journal_mode = WAL;");
    initSchema(database);
  }
  return drizzle(database, { schema });
}
