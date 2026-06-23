/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Helper to create a mock request with status changes
function createRequest(options: {
  url?: string;
  headers?: Record<string, string>;
  body?: any;
}) {
  const url =
    options.url ||
    "http://localhost/api/v1/gitlab_sync_tasks?pat=test&mgmtId=123&namespace=test-group";
  const headers = new Headers(options.headers || {});

  // Default to a label change if changes field is not provided
  const body = options.body || {};
  if (body.changes === undefined && body.object_kind !== "note") {
    body.changes = { labels: { previous: [], current: [{ title: "Status::To Do" }] } };
  }

  return new Request(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  }) as any;
}

describe("POST /api/v1/gitlab_sync_tasks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  describe("Configuration Validation", () => {
    it("should return 400 when required params are missing", async () => {
      const req = createRequest({
        url: "http://localhost/api/v1/gitlab_sync_tasks",
        body: {},
      });

      const res = await POST(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.error).toContain("Missing or invalid configuration");
    });

    it("should return 401 when secret is invalid", async () => {
      const req = createRequest({
        url: "http://localhost/api/v1/gitlab_sync_tasks?pat=test&mgmtId=123&namespace=test-group&secret=correct",
        headers: { "x-gitlab-token": "wrong" },
        body: {},
      });

      const res = await POST(req);
      const json = await res.json();

      expect(res.status).toBe(401);
      expect(json.error).toBe("Unauthorized");
    });
  });

  describe("Early Exit - Skip Non-Status Changes", () => {
    const baseUrl =
      "http://localhost/api/v1/gitlab_sync_tasks?pat=test&mgmtId=123&namespace=test-group&masterIid=37";

    it("should skip when only title changed", async () => {
      const req = createRequest({
        url: baseUrl,
        body: {
          object_kind: "issue",
          project: { id: 456 },
          object_attributes: { iid: 1 },
          changes: { title: { previous: "Old", current: "New" } },
        },
      });

      const res = await POST(req);
      const json = await res.json();

      expect(json.skipped).toBe(true);
      expect(json.reason).toBe("No status-related change");
      expect(json.changedFields).toContain("title");
    });

    it("should skip when only description changed", async () => {
      const req = createRequest({
        url: baseUrl,
        body: {
          object_kind: "issue",
          project: { id: 456 },
          object_attributes: { iid: 1 },
          changes: { description: { previous: "Old", current: "New" } },
        },
      });

      const res = await POST(req);
      const json = await res.json();

      expect(json.skipped).toBe(true);
      expect(json.reason).toBe("No status-related change");
    });

    it("should proceed when labels changed", async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ labels: ["Status::To Do"], description: "" }),
        });

      const req = createRequest({
        url: baseUrl,
        body: {
          object_kind: "issue",
          project: { id: 456 },
          object_attributes: { iid: 1 },
          changes: { labels: { previous: [], current: [{ title: "Status::In Progress" }] } },
        },
      });

      const res = await POST(req);
      const json = await res.json();

      expect(json.skipped).toBeUndefined();
      expect(json.success).toBe(true);
    });

    it("should proceed when assignees changed", async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ labels: ["Status::To Do"], description: "" }),
        });

      const req = createRequest({
        url: baseUrl,
        body: {
          object_kind: "issue",
          project: { id: 456 },
          object_attributes: { iid: 1 },
          changes: { assignees: { previous: [], current: [{ name: "John" }] } },
        },
      });

      const res = await POST(req);
      const json = await res.json();

      expect(json.skipped).toBeUndefined();
      expect(json.success).toBe(true);
    });

    it("should proceed when state changed", async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ labels: ["Status::To Do"], description: "" }),
        });

      const req = createRequest({
        url: baseUrl,
        body: {
          object_kind: "issue",
          project: { id: 456 },
          object_attributes: { iid: 1 },
          changes: { state_id: { previous: 1, current: 2 } },
        },
      });

      const res = await POST(req);
      const json = await res.json();

      expect(json.skipped).toBeUndefined();
      expect(json.success).toBe(true);
    });
  });

  describe("Skip Comment Webhooks", () => {
    const baseUrl =
      "http://localhost/api/v1/gitlab_sync_tasks?pat=test&mgmtId=123&namespace=test-group&masterIid=37";

    it("should skip note webhook without Master ticket mention", async () => {
      const req = createRequest({
        url: baseUrl,
        body: {
          object_kind: "note",
          project: { id: 456 },
          object_attributes: {
            iid: 999,
            note: "This is just a regular comment",
          },
          issue: { iid: 5 },
        },
      });

      const res = await POST(req);
      const json = await res.json();

      expect(json.skipped).toBe(true);
      expect(json.reason).toContain("No Master ticket mention");
    });

    it("should allow note webhook WITH Master ticket mention", async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ labels: ["Status::To Do"], description: "" }),
        });

      const req = createRequest({
        url: baseUrl,
        body: {
          object_kind: "note",
          project: { id: 456 },
          object_attributes: {
            iid: 999,
            note: "Hey check Master: #42 for context",
          },
          issue: { iid: 5 },
        },
      });

      const res = await POST(req);
      const json = await res.json();

      expect(json.skipped).toBeUndefined();
      expect(json.success).toBe(true);
    });
  });

  describe("Master Ticket Discovery", () => {
    const baseUrl =
      "http://localhost/api/v1/gitlab_sync_tasks?pat=test&mgmtId=123&namespace=test-group";

    it("should extract masterIid from query params", async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ labels: [], description: "" }),
        });

      const req = createRequest({
        url: `${baseUrl}&masterIid=37`,
        body: {
          project: { id: 456 },
          object_attributes: { iid: 1 },
        },
      });

      const res = await POST(req);
      const json = await res.json();

      expect(json.success).toBe(true);
      expect(json.masterIid).toBe("37");
    });

    it("should extract masterIid from description regex", async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ labels: [], description: "" }),
        });

      const req = createRequest({
        url: baseUrl,
        body: {
          project: { id: 456 },
          object_attributes: {
            iid: 1,
            description: "Some description\nMaster: #42",
          },
        },
      });

      const res = await POST(req);
      const json = await res.json();

      expect(json.success).toBe(true);
      expect(json.masterIid).toBe("42");
    });

    it("should return 400 when masterIid cannot be found", async () => {
      mockFetch.mockResolvedValue({ ok: false, statusText: "Not Found" });

      const req = createRequest({
        url: baseUrl,
        body: {
          project: { id: 456 },
          object_attributes: { iid: 1, description: "No master reference" },
        },
      });

      const res = await POST(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.error).toContain("Could not identify Master Ticket IID");
    });

    it("should discover master ticket via native links", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve([
              {
                project_id: 123,
                iid: 99,
                web_url: "http://gitlab.com/projects/123/issues/99",
              },
            ]),
        })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ labels: [], description: "" }),
        });

      const req = createRequest({
        url: baseUrl,
        body: {
          project: { id: 456 },
          object_attributes: { iid: 1 },
        },
      });

      const res = await POST(req);
      const json = await res.json();

      expect(json.success).toBe(true);
      expect(json.masterIid).toBe("99");
    });

    it("should discover master ticket via system notes mentions", async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve([
              {
                system: true,
                body: "mentioned in issue test-group/123#77",
              },
            ]),
        })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ labels: [], description: "" }),
        });

      const req = createRequest({
        url: baseUrl,
        body: {
          project: { id: 456 },
          object_attributes: { iid: 1 },
        },
      });

      const res = await POST(req);
      const json = await res.json();

      expect(json.success).toBe(true);
      expect(json.masterIid).toBe("77");
    });

    it("should handle note webhooks correctly (using body.issue.iid)", async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ labels: [], description: "" }),
        });

      const req = createRequest({
        url: `${baseUrl}&masterIid=37`,
        body: {
          object_kind: "note",
          project: { id: 456 },
          object_attributes: {
            iid: 999,
            note: "Please check Master: #42",
          },
          issue: { iid: 5 },
        },
      });

      const res = await POST(req);
      const json = await res.json();

      expect(json.success).toBe(true);
      expect(json.masterIid).toBe("37");
    });
  });

  describe("Status Sync", () => {
    const baseUrl =
      "http://localhost/api/v1/gitlab_sync_tasks?pat=test&mgmtId=123&namespace=test-group&masterIid=37";

    it("should calculate overall status as Integrated when all done", async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve([
              {
                other_issue: {
                  references: { full: "test-group/sub-project#5" },
                },
              },
            ]),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({ labels: ["Status::Integrated"], title: "Task 1" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({ labels: ["Status::To Do"], description: "" }),
        })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });

      const req = createRequest({
        url: baseUrl,
        body: {
          project: { id: 456 },
          object_attributes: { iid: 1 },
        },
      });

      const res = await POST(req);
      const json = await res.json();

      expect(json.success).toBe(true);
    });

    it("should skip update when no changes detected", async () => {
      const existingTable =
        "## 📊 Development Status\n\n" +
        "| Project | Task Description | Current Status | Reference |\n" +
        "| :--- | :--- | :--- | :--- |\n" +
        "| 🚧 `sub-project` | Task 1 | 🚧 `Status::To Do` | test-group/sub-project#5 |\n";

      mockFetch
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve([
              {
                other_issue: {
                  references: { full: "test-group/sub-project#5" },
                },
              },
            ]),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({ labels: ["Status::To Do"], title: "Task 1" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              labels: ["Status::To Do"],
              description: existingTable,
            }),
        });

      const req = createRequest({
        url: baseUrl,
        body: {
          project: { id: 456 },
          object_attributes: { iid: 1 },
        },
      });

      const res = await POST(req);
      const json = await res.json();

      expect(json.success).toBe(true);
      expect(json.summary).toContain("No changes detected");
    });
  });
});
