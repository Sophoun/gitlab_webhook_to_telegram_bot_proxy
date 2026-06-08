# GitLab Webhook to Telegram Bot Proxy

A lightweight proxy service to forward GitLab webhooks to Telegram notifications.

## API Documentation

### GitLab Webhook to Telegram

- **Path:** `/api/v1/gitlab_webhook_to_telegram_bot`
- **Method:** `POST`
- **Description:** Receives GitLab webhooks and forwards formatted messages to a Telegram bot.

#### Headers

- `x-gitlab-token`: Required for authorization (Set to `Lek1cTFVBDp/gY7uEp3g8WAdseIqdIetubQ961NYEu0=` in code).
- `x-gitlab-event`: The GitLab event type.

#### Query Parameters

- `botToken`: Your Telegram Bot API token.
- `chatId`: The target Telegram chat/channel ID.
- `ignoreUsers`: (Optional) Comma-separated list of GitLab usernames or display names to ignore.

#### 🔇 Ignoring Specific Users (Optional)

If you want to suppress notifications from specific users (like bot accounts or your own account for specific webhooks), you can use the `ignoreUsers` parameter. This matches against **GitLab usernames** (e.g., `johndoe`) or **GitLab display names** (e.g., `John`).

**How to handle spaces:**
If a display name has spaces, simply use them as-is or replace them with `%20` for proper URL encoding. The proxy will automatically trim any extra spaces around the commas.

**Example:**
`...&ignoreUsers=bot_user, John Doe, my_username`
or encoded:
`...&ignoreUsers=bot_user,John%20Doe,my_username`

#### 🤖 Smart Sync Filtering

The bot proxy automatically detects and silences notifications for automated status updates from the `gitlab_sync_tasks` tool. Even if the update is done using your Personal Access Token, it will skip the notification if:

1. The update contains the `## 📊 Development Status` table or the hidden sync marker (`<!-- gitlab_sync_task_update -->`).
2. The only changes detected are in `description`, `labels`, or `updated_at`.
3. No significant changes like assignee or state changes were made.

This ensures you don't get spammed by the sync task while still getting alerts for manual edits.

### GitLab Sync Tasks (Generic)

- **Path:** `/api/v1/gitlab_sync_tasks`
- **Method:** `POST`
- **Description:** Automatically syncs sub-task statuses from multiple sub-projects to a central "Master Ticket" or "Issue Board" table.

#### Configuration (Passed via Query Parameters)

To keep this tool project-agnostic, all configurations are passed as query parameters in the URL:

- `apiBase`: (Optional) Your GitLab API URL. Defaults to `https://gitlab.com/api/v4`.
- `pat`: **Required.** Your GitLab Personal Access Token.
- `mgmtId`: **Required.** The Project ID where the Master Ticket resides.
- `namespace`: **Required.** The default namespace/group for your sub-projects.
- `secret`: (Optional) A secret token for validating the `x-gitlab-token` header.
- `masterIid`: (Optional for POST) The IID of the Master Ticket.

#### Example Webhook URL

`https://your-proxy.com/api/v1/gitlab_sync_tasks?pat=YOUR_PAT&mgmtId=123&namespace=my-group&secret=MY_SECRET`

#### Usage

1. **POST Method (Webhook):** Add the URL to your GitLab sub-project webhooks (Issue/Note events).
    - The `masterIid` is optional. The bot will automatically discover the Master Ticket using:
        - **Native Links:** Any GitLab "Linked Issue" (Relates to/Blocks) pointing to your Management Project.
        - **Mentions:** Any system notes indicating the sub-issue was mentioned in your Management Project.
        - **Regex:** Searching for `Master: #123` in the issue description/notes.

---

## Running with Docker

You can pull the pre-built image directly from [Docker Hub](https://hub.docker.com/r/sophoun/gitlab_webhook_to_telegram_bot_proxy).

### Using Docker Run

```bash
docker run -d -p 3000:3000 sophoun/gitlab_webhook_to_telegram_bot_proxy:latest
```

### Using Docker Compose

Create a `docker-compose.yml` file:

```yaml
services:
  gitlab-bot:
    image: sophoun/gitlab_webhook_to_telegram_bot_proxy:latest
    ports:
      - "3000:3000"
    restart: unless-stopped
---
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
