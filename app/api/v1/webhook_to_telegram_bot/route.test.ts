/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST } from "./route";

// Mock Grammy Bot
const mockSendMessage = vi.fn().mockResolvedValue({ message_id: 123 });

vi.mock("grammy", () => ({
  Bot: class MockBot {
    api = {
      sendMessage: mockSendMessage,
    };
  },
}));

const SECRET = "Lek1cTFVBDp/gY7uEp3g8WAdseIqdIetubQ961NYEu0=";

function createRequest(options: {
  url?: string;
  headers?: Record<string, string>;
  body?: any;
}) {
  const url = options.url || "http://localhost/api/v1/webhook_to_telegram_bot";
  const headers = new Headers(options.headers || {});

  return new Request(url, {
    method: "POST",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  }) as any;
}

describe("POST /api/v1/webhook_to_telegram_bot", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Authorization", () => {
    it("should return 401 when secret token is missing", async () => {
      const req = createRequest({
        url: "http://localhost/api/v1/webhook_to_telegram_bot?botToken=test&chatId=123",
        headers: {
          "x-gitlab-event": "Issue Hook",
        },
        body: { project: { name: "Test" } },
      });

      const res = await POST(req);
      const json = await res.json();

      expect(json.status.success).toBe(false);
      expect(json.status.code).toBe("GL-001");
    });

    it("should return 401 when secret token is invalid", async () => {
      const req = createRequest({
        url: "http://localhost/api/v1/webhook_to_telegram_bot?botToken=test&chatId=123",
        headers: {
          "x-gitlab-token": "wrong-secret",
          "x-gitlab-event": "Issue Hook",
        },
        body: { project: { name: "Test" } },
      });

      const res = await POST(req);
      const json = await res.json();

      expect(json.status.success).toBe(false);
      expect(json.status.code).toBe("GL-001");
    });
  });

  describe("Query Parameters", () => {
    it("should return 400 when botToken is missing", async () => {
      const req = createRequest({
        url: "http://localhost/api/v1/webhook_to_telegram_bot?chatId=123",
        headers: {
          "x-gitlab-token": SECRET,
          "x-gitlab-event": "Issue Hook",
        },
        body: { project: { name: "Test" } },
      });

      const res = await POST(req);
      const json = await res.json();

      expect(json.status.success).toBe(false);
      expect(json.status.code).toBe("GL-002");
    });

    it("should return 400 when chatId is missing", async () => {
      const req = createRequest({
        url: "http://localhost/api/v1/webhook_to_telegram_bot?botToken=test",
        headers: {
          "x-gitlab-token": SECRET,
          "x-gitlab-event": "Issue Hook",
        },
        body: { project: { name: "Test" } },
      });

      const res = await POST(req);
      const json = await res.json();

      expect(json.status.success).toBe(false);
      expect(json.status.code).toBe("GL-003");
    });
  });

  describe("ignoreUsers parameter", () => {
    const baseUrl =
      "http://localhost/api/v1/webhook_to_telegram_bot?botToken=test&chatId=123";

    it("should send message when ignoreUsers is NOT provided", async () => {
      const req = createRequest({
        url: baseUrl,
        headers: {
          "x-gitlab-token": SECRET,
          "x-gitlab-event": "Issue Hook",
        },
        body: {
          project: { name: "Test Project" },
          user_name: "John Doe",
          user: { username: "johndoe" },
          object_attributes: {
            action: "open",
            title: "Test Issue",
            url: "http://example.com",
          },
        },
      });

      const res = await POST(req);
      const json = await res.json();

      expect(json.status.success).toBe(true);
    });

    it("should SKIP notification when user_name matches ignoreUsers", async () => {
      const req = createRequest({
        url: `${baseUrl}&ignoreUsers=John Doe`,
        headers: {
          "x-gitlab-token": SECRET,
          "x-gitlab-event": "Issue Hook",
        },
        body: {
          project: { name: "Test Project" },
          user_name: "John Doe",
          user: { username: "johndoe" },
          object_attributes: {
            action: "open",
            title: "Test Issue",
            url: "http://example.com",
          },
        },
      });

      const res = await POST(req);
      const json = await res.json();

      expect(json.status.success).toBe(true);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Skipping notification for ignored user: John Doe")
      );
    });

    it("should SKIP notification when username matches ignoreUsers", async () => {
      const req = createRequest({
        url: `${baseUrl}&ignoreUsers=johndoe`,
        headers: {
          "x-gitlab-token": SECRET,
          "x-gitlab-event": "Issue Hook",
        },
        body: {
          project: { name: "Test Project" },
          user_name: "John Doe",
          user: { username: "johndoe" },
          object_attributes: {
            action: "open",
            title: "Test Issue",
            url: "http://example.com",
          },
        },
      });

      const res = await POST(req);
      const json = await res.json();

      expect(json.status.success).toBe(true);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Skipping notification for ignored user: John Doe")
      );
    });

    it("should send message when user is NOT in ignoreUsers list", async () => {
      const req = createRequest({
        url: `${baseUrl}&ignoreUsers=otheruser,anotheruser`,
        headers: {
          "x-gitlab-token": SECRET,
          "x-gitlab-event": "Issue Hook",
        },
        body: {
          project: { name: "Test Project" },
          user_name: "John Doe",
          user: { username: "johndoe" },
          object_attributes: {
            action: "open",
            title: "Test Issue",
            url: "http://example.com",
          },
        },
      });

      const res = await POST(req);
      const json = await res.json();

      expect(json.status.success).toBe(true);
    });

    it("should handle spaces around commas in ignoreUsers", async () => {
      const req = createRequest({
        url: `${baseUrl}&ignoreUsers=alice, Bob, charlie`,
        headers: {
          "x-gitlab-token": SECRET,
          "x-gitlab-event": "Issue Hook",
        },
        body: {
          project: { name: "Test Project" },
          user_name: "Bob",
          user: { username: "bob_user" },
          object_attributes: {
            action: "open",
            title: "Test Issue",
            url: "http://example.com",
          },
        },
      });

      const res = await POST(req);
      const json = await res.json();

      expect(json.status.success).toBe(true);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Skipping notification for ignored user: Bob")
      );
    });

    it("should NOT skip when ignoreUsers has a leading space in param name (URL typo bug)", async () => {
      // This simulates the bug: & ignoreUsers=sophoun.nheum (space before ignoreUsers)
      const req = createRequest({
        url: `${baseUrl}& ignoreUsers=sophoun.nheum`,
        headers: {
          "x-gitlab-token": SECRET,
          "x-gitlab-event": "Issue Hook",
        },
        body: {
          project: { name: "Test Project" },
          user_name: "sophoun.nheum",
          user: { username: "sophoun.nheum" },
          object_attributes: {
            action: "open",
            title: "Test Issue",
            url: "http://example.com",
          },
        },
      });

      const res = await POST(req);
      const json = await res.json();

      // Because " ignoreUsers" !== "ignoreUsers", the parameter is not read
      // So the notification should still be sent
      expect(json.status.success).toBe(true);
    });

    it("should skip when user matches with URL-encoded spaces", async () => {
      const req = createRequest({
        url: `${baseUrl}&ignoreUsers=John%20Doe`,
        headers: {
          "x-gitlab-token": SECRET,
          "x-gitlab-event": "Issue Hook",
        },
        body: {
          project: { name: "Test Project" },
          user_name: "John Doe",
          user: { username: "johndoe" },
          object_attributes: {
            action: "open",
            title: "Test Issue",
            url: "http://example.com",
          },
        },
      });

      const res = await POST(req);
      const json = await res.json();

      expect(json.status.success).toBe(true);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Skipping notification for ignored user: John Doe")
      );
    });
  });

  describe("Smart Sync Filter", () => {
    const baseUrl =
      "http://localhost/api/v1/webhook_to_telegram_bot?botToken=test&chatId=123";

    it("should skip sync update notifications", async () => {
      const req = createRequest({
        url: baseUrl,
        headers: {
          "x-gitlab-token": SECRET,
          "x-gitlab-event": "Issue Hook",
        },
        body: {
          project: { name: "Test Project" },
          user_name: "Test User",
          user: { username: "testuser" },
          object_attributes: {
            action: "update",
            description: "Some content\n<!-- gitlab_sync_task_update -->",
          },
          changes: {
            description: { previous: "old", current: "new" },
          },
        },
      });

      const res = await POST(req);
      const json = await res.json();

      expect(json.status.success).toBe(true);
    });
  });

  describe("Event Types", () => {
    const baseUrl =
      "http://localhost/api/v1/webhook_to_telegram_bot?botToken=test&chatId=123";

    it("should handle Push Hook", async () => {
      const req = createRequest({
        url: baseUrl,
        headers: {
          "x-gitlab-token": SECRET,
          "x-gitlab-event": "Push Hook",
        },
        body: {
          project: { name: "Test", web_url: "http://example.com" },
          user_name: "Test User",
          ref: "refs/heads/main",
          total_commits_count: 3,
        },
      });

      const res = await POST(req);
      const json = await res.json();

      expect(json.status.success).toBe(true);
    });

    it("should handle Issue Hook", async () => {
      const req = createRequest({
        url: baseUrl,
        headers: {
          "x-gitlab-token": SECRET,
          "x-gitlab-event": "Issue Hook",
        },
        body: {
          project: { name: "Test" },
          user_name: "Test User",
          object_attributes: {
            action: "open",
            title: "New Issue",
            url: "http://example.com",
          },
        },
      });

      const res = await POST(req);
      const json = await res.json();

      expect(json.status.success).toBe(true);
    });

    it("should handle unknown event type gracefully", async () => {
      const req = createRequest({
        url: baseUrl,
        headers: {
          "x-gitlab-token": SECRET,
          "x-gitlab-event": "Unknown Hook",
        },
        body: {
          project: { name: "Test" },
          user_name: "Test User",
        },
      });

      const res = await POST(req);
      const json = await res.json();

      expect(json.status.success).toBe(true);
    });
  });
});
