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

#### Supported Events

- Push Hook, Tag Push Hook, Issue Hook, Note Hook, Merge Request Hook, Pipeline Hook, Job Hook, Deployment Hook, Release Hook, Wiki Page Hook, Feature Flag Hook, Milestone Hook, Vulnerability Hook.

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

#### Example Webhook URL:
`https://your-proxy.com/api/v1/gitlab_sync_tasks?pat=YOUR_PAT&mgmtId=123&namespace=my-group&secret=MY_SECRET`

#### Usage:
1.  **POST Method (Webhook):** Add the URL to your GitLab sub-project webhooks (Issue/Note events).
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
