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
