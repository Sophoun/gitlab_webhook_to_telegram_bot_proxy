/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("POST /api/v1/gitlab_sync_tasks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  const createRequest = (options: {
    url?: string;
    headers?: Record<string, string>;
    body?: any;
  }) => {
    const url =
      options.url ||
      "http://localhost/api/v1/gitlab_sync_tasks?pat=test&mgmtId=123&namespace=test-group";
    const headers = new Headers(options.headers || {});

    return new Request(url, {
      method: "POST",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    }) as any;
  };

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

  describe("Master Ticket Discovery", () => {
    const baseUrl =
      "http://localhost/api/v1/gitlab_sync_tasks?pat=test&mgmtId=123&namespace=test-group";

    it("should extract masterIid from query params", async () => {
      // Mock: notes, links, master issue
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              labels: [],
              description: "",
            }),
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
          json: () =>
            Promise.resolve({
              labels: [],
              description: "",
            }),
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
      // 1. Discovery: links API for sub-issue -> finds master
      // 2. Sync: notes API for master
      // 3. Sync: links API for master
      // 4. Sync: master issue fetch
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
          json: () =>
            Promise.resolve({
              labels: [],
              description: "",
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
      expect(json.masterIid).toBe("99");
    });

    it("should discover master ticket via system notes mentions", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([]), // No links
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve([
              {
                system: true,
                // Note: project path must contain mgmtId (123) or be empty
                body: "mentioned in issue test-group/123#77",
              },
            ]),
        })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              labels: [],
              description: "",
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
      expect(json.masterIid).toBe("77");
    });

    it("should handle note webhooks correctly (using body.issue.iid)", async () => {
      // Discovery calls then syncStatusToMaster calls
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) }) // discovery links
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) }) // discovery notes
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) }) // sync notes
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) }) // sync links
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              labels: [],
              description: "",
            }),
        });

      const req = createRequest({
        url: `${baseUrl}&masterIid=37`,
        body: {
          object_kind: "note",
          project: { id: 456 },
          object_attributes: { iid: 999 }, // This is note ID, not issue ID
          issue: { iid: 5 }, // This is the actual issue ID
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
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) }) // notes
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
        }) // links
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              labels: ["Status::Integrated"],
              title: "Task 1",
            }),
        }) // sub-task
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              labels: ["Status::To Do"],
              description: "",
            }),
        }) // master fetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({}),
        }); // master update (PUT)

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
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) }) // notes
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
        }) // links
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              labels: ["Status::To Do"],
              title: "Task 1",
            }),
        }) // sub-task
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              labels: ["Status::To Do"],
              description: existingTable,
            }),
        }); // master

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
