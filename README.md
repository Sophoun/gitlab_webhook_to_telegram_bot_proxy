# GitLab Webhook to Telegram Bot Proxy

A lightweight proxy service that connects GitLab webhooks to Telegram notifications, with an optional sync feature to aggregate child project statuses into a master ticket.

---

## IMPORTANT: What is `:projectId`?

> **`:projectId` is NOT a GitLab project ID. It is the database row ID of your project configuration.**
>
> After you create a project in the UI (or via API), the database assigns it an auto-incremented number like `1`, `2`, `3`. This is what you use in webhook URLs.
>
> Each `:projectId` config stores your management project ID (`mgmt_id`) internally. Multiple GitLab projects can share the same `:projectId` if they belong to the same logical group.

**Example:**
```
You create "Mobile App" config in UI → gets DB ID: 1

Child iOS GitLab project (ID: 456)     webhook → /api/v1/gitlab_sync_tasks/1
Child Android GitLab project (ID: 789)  webhook → /api/v1/gitlab_sync_tasks/1
Main Board GitLab project (ID: 999)     webhook → /api/v1/webhook_to_telegram_bot/1
```

---

## Architecture

```
GitLab Child Project ──webhook──> /api/v1/gitlab_sync_tasks/:projectId
                                         │
                                         ▼
                              SQLite DB (config + logs)
                                         │
                                         ▼
GitLab Main Board <──update── Sync Status Aggregator
       │
   webhook
       ▼
/api/v1/webhook_to_telegram_bot/:projectId
       │
       ▼
   Telegram
```

---

## Features

### 1. Telegram Notifications (`/api/v1/webhook_to_telegram_bot/:projectId`)

Forwards GitLab webhooks to a Telegram channel/group.

**Supported events:**

- Issue created/updated/closed/reopened
- Merge requests
- Comments (notes)
- Pushes, tags, pipelines, deployments
- Releases, wiki pages, milestones
- Vulnerability alerts

**Smart filtering:**

- **Robot updates**: Users in the `ignore_users` list are flagged as `🤖 [AUTOMATED UPDATE]` instead of being silently dropped
- **Sync spam filter**: Updates that only change `description`, `labels`, or `updated_at` (from the sync task itself) are skipped
- **Inline buttons**: Every message includes quick-action buttons (View Issue, View Project, etc.)

### 2. Status Sync (`/api/v1/gitlab_sync_tasks/:projectId`)

Aggregates sub-task statuses from child projects into a central "Master Ticket".

**What it does:**

- Discovers linked issues via GitLab native links or mention notes
- Builds a markdown status table in the master ticket description
- Auto-calculates overall status: `Status::To Do` → `Status::In Progress` → `Status::Integrated`
- Only syncs on **status-relevant changes** (labels, assignees, state, milestones)
- Skips comment webhooks unless they explicitly mention `Master: #123`

---

## Configuration

All configuration is stored in a local SQLite database (`data/app.db`).

### Via Web UI

Open `http://<your-host>/` to access the dashboard.

1. Click **Add Project**
2. Fill in the form:
   - **GitLab PAT**: Personal Access Token with `api` scope
   - **Management Project ID**: The GitLab project ID where your Master Ticket lives
   - **Namespace**: Your GitLab group/namespace
   - **Workflow Labels**: Map your GitLab board labels to sync categories
     - **To Do**: Labels that mean "not started" (default: `Backlog, Refinement, Ready for Dev`)
     - **In Progress**: Labels that mean "in progress" (default: `In Progress, Peer Review, Testing/QA`)
     - **Integrated**: Labels that mean "done" (default: `Completed, Closed`)
   - **Telegram Bot Token**: From [@BotFather](https://t.me/botfather)
   - **Telegram Chat ID**: Group/channel ID (e.g., `-1001234567890`)
   - **Ignore Users**: Comma-separated list of usernames to flag as robot updates
   - **Webhook Secret**: Auto-generated secret for validating `X-Gitlab-Token` header
  3. Save
4. Click **URLs** on your project to get the webhook URLs

### Via API

```bash
curl -X POST http://localhost:3000/api/projects \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Project",
    "gitlab_pat": "glpat-xxx",
    "mgmt_id": "456",
    "namespace": "my-group",
    "telegram_bot_token": "123:ABC",
    "telegram_chat_id": "-1001234567890",
    "ignore_users": "bot_user, ci_user"
  }'
```

---

## GitLab Webhook Setup

### Understanding the IDs

| ID | What it is | Where you see it |
|----|-----------|-----------------|
| **`:projectId`** | **Database row ID** (e.g., `1`, `2`) | In your proxy dashboard, used in webhook URLs |
| `mgmt_id` | GitLab project ID of your Main Board | In GitLab project settings |

### Main Board (Telegram notifications)

1. Go to **Project Settings → Webhooks**
2. URL: `http://your-proxy.com/api/v1/webhook_to_telegram_bot/1`
   - Replace `1` with your **database project ID** from the dashboard
3. Trigger: **Issues**, **Comments**, **Merge requests** (select what you want)
4. Secret Token: Copy from the **Webhook URLs** dialog in the dashboard

### Child Projects (Status sync)

1. Go to **Project Settings → Webhooks**
2. URL: `http://your-proxy.com/api/v1/gitlab_sync_tasks/1`
   - Replace `1` with your **database project ID** from the dashboard
3. Trigger: **Issues**
4. Secret Token: Copy from the **Webhook URLs** dialog in the dashboard

**Note:** Multiple GitLab child projects can point to the same `:projectId` if they share the same management project and Telegram channel.

---

## Data Model

### Projects Table

| Column | Description |
|--------|-------------|
| `id` | Auto-generated project identifier (used in webhook URLs) |
| `name` | Display name |
| `gitlab_api_base` | GitLab API URL (default: `https://gitlab.com/api/v4`) |
| `gitlab_pat` | Personal Access Token |
| `mgmt_id` | Management project ID (where master ticket lives) |
| `namespace` | GitLab namespace for sub-projects |
| `master_iid` | Master ticket IID (optional, auto-discovered if empty) |
| `telegram_bot_token` | Telegram bot token |
| `telegram_chat_id` | Telegram chat/channel ID |
| `ignore_users` | Comma-separated usernames |
| `webhook_secret` | Auto-generated validation secret (required) |
| `labels_todo` | Labels mapped to "To Do" category |
| `labels_in_progress` | Labels mapped to "In Progress" category |
| `labels_integrated` | Labels mapped to "Integrated" category |

### Workflow Label Mapping

The sync task reads labels from child issues and maps them to one of three categories:

| Category | Default Labels | Meaning |
|----------|---------------|---------|
| **To Do** | `Backlog`, `Refinement`, `Ready for Dev` | Not started |
| **In Progress** | `In Progress`, `Peer Review`, `Testing/QA` | Work in progress |
| **Integrated** | `Completed`, `Closed` | Done / Closed |

**Priority:** The sync checks labels in order: `integrated` → `in_progress` → `todo`. The first match wins. If an issue is **closed** (GitLab state), it is always treated as `integrated` regardless of labels.

**Overall status calculation:**
- All tasks `integrated` → `Status::Integrated`
- Any task `in_progress` OR mix of `integrated` + `todo` → `Status::In Progress`
- All tasks `todo` → `Status::To Do`

You can customize these labels per-project in the dashboard. Use comma-separated values.

### Sync Logs Table

| Column | Description |
|--------|-------------|
| `project_id` | Reference to project |
| `event_type` | GitLab event type |
| `master_iid` | Master ticket IID |
| `status` | `success`, `error`, or `skipped` |
| `message` | Log message |

---

## Docker

```bash
# Pull and run
docker run -d -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  sophoun/gitlab_webhook_to_telegram_bot_proxy:latest
```

The SQLite database is stored in `/app/data/app.db`. Mount a volume to persist it.

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_PATH` | `./data/app.db` | SQLite database file path |

---

## Security

- **Secrets are NOT in URLs**: All tokens and PATs are stored in the SQLite database, never exposed in webhook URLs
- **Webhook secret validation**: Every project gets an auto-generated secret; all webhook requests must include the correct `X-Gitlab-Token` header
- **No auth on dashboard**: The web UI has no authentication. Run behind a reverse proxy or VPN if exposing to the internet.

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/projects` | List all projects |
| POST | `/api/projects` | Create project |
| GET | `/api/projects/:id` | Get project |
| PUT | `/api/projects/:id` | Update project |
| DELETE | `/api/projects/:id` | Delete project |
| GET | `/api/webhook-urls?projectId=1` | Get webhook URLs for a project |
| GET | `/api/sync-logs?limit=50` | List recent sync logs |
| POST | `/api/v1/webhook_to_telegram_bot/:projectId` | GitLab webhook → Telegram |
| POST | `/api/v1/gitlab_sync_tasks/:projectId` | GitLab webhook → Master ticket sync |

---

## Development

```bash
# Install dependencies
npm install

# Run dev server
npm run dev

# Run tests
npm run test:run

# Build for production
npm run build
```

---

## License

MIT
