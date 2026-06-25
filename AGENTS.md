<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:project-context -->
# GitLab Webhook to Telegram Bot Proxy

A Next.js 16 (App Router) proxy that forwards GitLab webhooks to Telegram notifications, with an optional sync feature that aggregates child project issue statuses into a master ticket.

## Tech Stack

| Technology | Usage |
|---|---|
| **Next.js 16.2** (App Router, Turbopack) | Full-stack framework |
| **grammy 1.42** | Telegram Bot API client |
| **drizzle-orm 0.45** + **better-sqlite3 12** | Database ORM + driver |
| **zod 4.4** | Schema validation |
| **shadcn/ui + Tailwind v4** | Dashboard UI components |
| **vitest 4.1** | Unit testing |
| **Docker** | Deployment via `sophoun/gitlab_webhook_to_telegram_bot_proxy` |

## Project Structure

```
app/
├── page.tsx                          # Dashboard (client component)
├── layout.tsx                        # Root layout with Geist fonts
├── globals.css                       # Tailwind v4 styles
├── types/index.ts                    # Project, ProjectFormData, SyncLog interfaces
├── components/dashboard/             # UI: ProjectsTable, ProjectFormDialog, WebhookUrlsDialog, StatsCards, ActivityLog
├── api/
│   ├── projects/route.ts             # GET (list all), POST (create)
│   ├── projects/[id]/route.ts        # GET, PUT, DELETE single project
│   ├── webhook-urls/route.ts         # GET webhook URLs + secret for a project
│   ├── sync-logs/route.ts            # GET (list), POST (create) sync logs
│   └── v1/
│       ├── webhook_to_telegram_bot/[projectId]/route.ts   # GitLab webhook → Telegram
│       └── gitlab_sync_tasks/[projectId]/route.ts          # GitLab webhook → Master ticket sync
db/
├── schema.ts                         # Drizzle ORM schema (projects, syncLogs) + Zod schemas
└── index.ts                          # Alternative DB init entry point
lib/
├── db.ts                             # DB init: SQLite WAL mode, CREATE TABLE IF NOT EXISTS, secret backfill
├── telegram-message.ts               # Message builder: dispatches per x-gitlab-event type → Markdown + InlineKeyboard
├── telegram-message.test.ts          # 51 tests for message builder
├── webhook-filters.ts                # Pure filter functions: getIgnoredUsers, isUserInIgnoreList, shouldSkipDescriptionOnlyUpdate
├── webhook-filters.test.ts           # 29 tests for filter logic
├── sync-status.ts                    # calculateOverallStatus(): To Do / In Progress / Integrated
├── sync-status.test.ts              # 12 tests for status calculator
└── utils.ts                          # cn() utility for Tailwind class merging
components/ui/                        # shadcn/ui primitives (button, card, dialog, input, label, separator, etc.)
```

## Critical Concept: `:projectId`

**`:projectId` is the database row ID, NOT a GitLab project ID.** After creating a project config in the dashboard (or via API), it gets an auto-incremented integer like 1, 2, 3. This is what goes in webhook URLs. The GitLab project ID is stored in the `mgmt_id` column internally.

Multiple GitLab child projects can point to the same `:projectId` if they share the same management project and Telegram channel.

## Database: Single SQLite file

Stored at `DB_PATH` env var or `./data/app.db`. Drizzle ORM schema + raw SQL fallback in `lib/db.ts` for robustness.

**IMPORTANT**: Both `db/schema.ts` (Drizzle) AND `lib/db.ts` (raw SQL) define the table structure. When adding a column, you MUST update BOTH files.

### Projects table columns
- `id` (INTEGER PK AUTOINCREMENT) — used as `:projectId` in webhook URLs
- `name`, `gitlab_api_base`, `gitlab_pat`, `mgmt_id`, `namespace`, `master_iid`
- `telegram_bot_token`, `telegram_chat_id`
- `ignore_users` (TEXT, comma-separated) — users to flag as robot updates
- `webhook_secret` (TEXT) — auto-generated 32-char hex, validated via `X-Gitlab-Token` header
- `labels_todo`, `labels_in_progress`, `labels_integrated` — comma-separated label mappings for sync
- `skip_ignored_users` (INTEGER/bool) — when true, completely skip sending messages for users in ignore list
- `skip_description_only_updates` (INTEGER/bool) — when true, skip issue update notifications when only description changed
- `created_at`, `updated_at` (timestamps)

## Webhook Notification Pipeline (order matters)

```
1. Parse X-Gitlab-Token header → validate against project.webhookSecret
2. Parse JSON body
3. Extract user info (name, username)
4. Check ignored users:
   a. If user IS in ignore list AND skip_ignored_users → SKIP entirely (return 200, no message)
   b. If user IS in ignore list → flag with 🤖 marker (message still sent)
5. Sync spam filter:
   a. If body has sync marker AND only description/labels/updated_at changed → SKIP
6. Description-only filter:
   a. If skip_description_only_updates AND issue event AND action=update
      AND only description (+ updated_at) changed → SKIP
7. Build message via lib/telegram-message.ts buildMessage()
8. Send to Telegram via grammy Bot API with parse_mode: "Markdown"
```

### How to add a new filter step
Create a pure function in `lib/webhook-filters.ts`, write tests in `lib/webhook-filters.test.ts`, call it from the route handler in order. Keep filter logic OUT of the route handler — the route handler orchestrates, webhook-filters decides.

## Message Building (lib/telegram-message.ts)

`buildMessage(eventType, body, projectName, userName, isIgnoredUser)` dispatches by `x-gitlab-event` header:

- Issue Hook / Confidential Issue Hook / Work Item Hook → `buildIssueMessage()`
- Merge Request Hook → `buildMergeRequestMessage()`
- Push Hook → `buildPushMessage()`
- Pipeline Hook → `buildPipelineMessage()`
- Note Hook / Confidential Note Hook → `buildCommentMessage()`
- Tag Push, Build, Job, Deployment, Release, Wiki, Milestone, Vulnerability → inline handlers
- Default → generic fallback

Every handler returns `{ text: string, keyboard: InlineKeyboard }`. The header (`📂 *ProjectName* · 👤 User`) with optional `🤖 *[AUTOMATED UPDATE]*` is prepended in `buildMessage()`.

## Testing Conventions

- **Framework**: vitest
- **Run**: `npm run test:run` (single run), `npm run test` (watch mode), `npm run test:coverage`
- **Test files**: `*.test.ts` alongside source files in `lib/`
- **Pattern**: Pure functions only. Route handlers are tested indirectly via extracted logic.
- Write tests when adding new filter logic, message building, or status calculation.

## Common Development Tasks

### Adding a new project config field
1. Add column to `db/schema.ts` (Drizzle) AND `lib/db.ts` (raw SQL)
2. Add to `app/types/index.ts` interfaces (Project, ProjectFormData, defaultFormData)
3. Add to `app/api/projects/route.ts` POST handler
4. Add to `app/api/projects/[id]/route.ts` PUT handler
5. Add UI field in `app/components/dashboard/ProjectFormDialog.tsx`
6. Run `npm run lint && npm run build && npm run test:run`

### Adding a new event type / message format
1. Add a new builder function or case in `lib/telegram-message.ts` `buildMessage()` switch
2. Add tests in `lib/telegram-message.test.ts`
3. The event dispatch key is the `x-gitlab-event` header value from GitLab

### Running locally
```bash
npm run dev           # Next.js dev server (Turbopack)
npm run build         # Production build
npm run lint          # ESLint
npm run test:run      # Vitest single run
```

## Build & CI

- GitHub Actions in `.github/workflows/deploy.yml` builds Docker image and pushes to Docker Hub on push to `main`
- Dockerfile uses node:20-alpine multi-stage build
- Mount volume at `/app/data` to persist SQLite database

## Key Patterns

1. **Dual schema**: Drizzle ORM for type-safe queries, raw SQL for table creation/backfills in `lib/db.ts`
2. **Filter pipeline**: Each filter check runs sequentially in the route handler. Filters are pure functions in `lib/webhook-filters.ts` so they are testable.
3. **Snake_case API, camelCase DB**: API JSON uses snake_case (`mgmt_id`, `gitlab_pat`), Drizzle columns use camelCase (`mgmtId`, `gitlabPat`)
4. **No auth on dashboard**: The web UI has no authentication. Run behind a reverse proxy or VPN.
5. **Defensive parsing**: Webhook body is parsed with try/catch, `object_attributes` accessed with optional chaining everywhere.
6. **Inline keyboard**: Every Telegram message includes quick-action buttons (View Issue, View Project, etc.)

## Version

Current: 2.0.1
<!-- END:project-context -->
