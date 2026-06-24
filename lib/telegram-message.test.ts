import { describe, it, expect } from "vitest";
import {
  escapeMarkdown,
  buildIssueMessage,
  buildMergeRequestMessage,
  buildPushMessage,
  buildPipelineMessage,
  buildCommentMessage,
  buildMessage,
} from "./telegram-message";

describe("escapeMarkdown", () => {
  it("escapes all markdown special characters", () => {
    const input = "*_[]()~`>#+=|{}.!-";
    const expected = "\\*\\_\\[\\]\\(\\)\\~\\`\\>\\#\\+\\=\\|\\{\\}\\.\\!\\-";
    expect(escapeMarkdown(input)).toBe(expected);
  });

  it("leaves plain text unchanged", () => {
    expect(escapeMarkdown("Hello World")).toBe("Hello World");
  });

  it("escapes asterisks in issue titles", () => {
    expect(escapeMarkdown("Fix *critical* bug")).toBe("Fix \\*critical\\* bug");
  });

  it("escapes brackets and parentheses in URLs", () => {
    expect(escapeMarkdown("Link [here] (now)")).toBe("Link \\[here\\] \\(now\\)");
  });

  it("handles empty string", () => {
    expect(escapeMarkdown("")).toBe("");
  });

  it("handles string with only special chars", () => {
    expect(escapeMarkdown("***")).toBe("\\*\\*\\*");
  });
});

describe("buildIssueMessage", () => {
  const baseBody = {
    object_attributes: {
      action: "opened",
      title: "Fix login bug",
      url: "https://gitlab.com/proj/issues/1",
      iid: 42,
      state: "opened",
    },
    project: { web_url: "https://gitlab.com/proj" },
  };

  it("builds basic issue message", () => {
    const result = buildIssueMessage(baseBody, false);
    expect(result.text).toContain("📋 Issue *#42* opened");
    expect(result.text).toContain("📝 *Fix login bug*");
    expect(result.keyboard.inline_keyboard.length).toBeGreaterThan(0);
  });

  it("adds robot marker for ignored user", () => {
    const result = buildIssueMessage(baseBody, true);
    expect(result.text).toContain("📋 Issue *#42* opened 🤖");
  });

  it("shows label changes", () => {
    const body = {
      ...baseBody,
      changes: {
        labels: {
          previous: [{ title: "bug" }],
          current: [{ title: "bug" }, { title: "urgent" }],
        },
      },
    };
    const result = buildIssueMessage(body, false);
    expect(result.text).toContain("🏷 Labels:");
    expect(result.text).toContain("bug");
    expect(result.text).toContain("urgent");
  });

  it("shows assignee changes", () => {
    const body = {
      ...baseBody,
      changes: {
        assignees: {
          previous: [{ name: "Alice" }],
          current: [{ name: "Bob" }],
        },
      },
    };
    const result = buildIssueMessage(body, false);
    expect(result.text).toContain("👤 Assignee: Alice → Bob");
  });

  it("shows milestone changes", () => {
    const body = {
      ...baseBody,
      changes: {
        milestone_id: {
          previous: { title: "v1.0" },
          current: { title: "v2.0" },
        },
      },
    };
    const result = buildIssueMessage(body, false);
    expect(result.text).toContain("🎯 Milestone:");
    expect(result.text).toContain("v1\\.0");
    expect(result.text).toContain("v2\\.0");
  });

  it("shows status change on close", () => {
    const body = {
      ...baseBody,
      object_attributes: { ...baseBody.object_attributes, state: "closed" },
      changes: { state_id: { previous: 1, current: 2 } },
    };
    const result = buildIssueMessage(body, false);
    expect(result.text).toContain("🚦 Status: *CLOSED*");
  });

  it("shows status change on reopen", () => {
    const body = {
      ...baseBody,
      object_attributes: { ...baseBody.object_attributes, state: "reopened" },
      changes: { state_id: { previous: 2, current: 1 } },
    };
    const result = buildIssueMessage(body, false);
    expect(result.text).toContain("🚦 Status: *REOPENED*");
  });

  it("does not show status for non-closed/reopened", () => {
    const body = {
      ...baseBody,
      changes: { state_id: { previous: 1, current: 1 } },
    };
    const result = buildIssueMessage(body, false);
    expect(result.text).not.toContain("🚦 Status:");
  });

  it("handles missing object_attributes gracefully", () => {
    const body = { project: {} };
    const result = buildIssueMessage(body, false);
    expect(result.text).toContain("📋 Issue *#* updated");
    expect(result.text).toContain("📝 *Unknown Title*");
  });

  it("handles empty label arrays", () => {
    const body = {
      ...baseBody,
      changes: {
        labels: {
          previous: [],
          current: [],
        },
      },
    };
    const result = buildIssueMessage(body, false);
    expect(result.text).toContain("🏷 Labels:");
    expect(result.text).toContain("None");
  });

  it("escapes markdown in title", () => {
    const body = {
      ...baseBody,
      object_attributes: {
        ...baseBody.object_attributes,
        title: "Fix *critical* [bug] (urgent)",
      },
    };
    const result = buildIssueMessage(body, false);
    expect(result.text).toContain("Fix \\*critical\\* \\[bug\\] \\(urgent\\)");
  });

  it("creates keyboard with View Issue and View Project buttons", () => {
    const result = buildIssueMessage(baseBody, false);
    const buttons = result.keyboard.inline_keyboard.flat();
    expect(buttons.some((b: any) => b.text === "View Issue")).toBe(true);
    expect(buttons.some((b: any) => b.text === "View Project")).toBe(true);
  });

  it("skips buttons when URLs are missing", () => {
    const body = { object_attributes: { iid: 1 }, project: {} };
    const result = buildIssueMessage(body, false);
    expect(result.keyboard.inline_keyboard.flat().length).toBe(0);
  });
});

describe("buildMergeRequestMessage", () => {
  const baseBody = {
    object_attributes: {
      action: "opened",
      title: "Add feature X",
      url: "https://gitlab.com/proj/merge_requests/5",
      iid: 5,
      source_branch: "feature/x",
      target_branch: "main",
      state: "opened",
    },
    project: { web_url: "https://gitlab.com/proj" },
  };

  it("builds basic MR message", () => {
    const result = buildMergeRequestMessage(baseBody, false);
    expect(result.text).toContain("🔀 Merge Request *!5* opened");
    expect(result.text).toContain("📝 *Add feature X*");
    expect(result.text).toContain("feature/x → main");
  });

  it("shows branch info when available", () => {
    const result = buildMergeRequestMessage(baseBody, false);
    expect(result.text).toContain("feature/x → main");
  });

  it("skips branch info when missing", () => {
    const body = {
      ...baseBody,
      object_attributes: { ...baseBody.object_attributes, source_branch: "" },
    };
    const result = buildMergeRequestMessage(body, false);
    expect(result.text).not.toContain("→");
  });

  it("shows merged status", () => {
    const body = {
      ...baseBody,
      object_attributes: { ...baseBody.object_attributes, state: "merged" },
      changes: { state_id: { previous: 1, current: 3 } },
    };
    const result = buildMergeRequestMessage(body, false);
    expect(result.text).toContain("🚦 Status: *MERGED*");
  });

  it("shows closed status", () => {
    const body = {
      ...baseBody,
      object_attributes: { ...baseBody.object_attributes, state: "closed" },
      changes: { state_id: { previous: 1, current: 2 } },
    };
    const result = buildMergeRequestMessage(body, false);
    expect(result.text).toContain("🚦 Status: *CLOSED*");
  });

  it("escapes markdown in branch names", () => {
    const body = {
      ...baseBody,
      object_attributes: {
        ...baseBody.object_attributes,
        source_branch: "feature/[test]",
        target_branch: "main*",
      },
    };
    const result = buildMergeRequestMessage(body, false);
    expect(result.text).toContain("feature/\\[test\\]");
    expect(result.text).toContain("main\\*");
  });
});

describe("buildPushMessage", () => {
  const baseBody = {
    ref: "refs/heads/main",
    total_commits_count: 3,
    project: { web_url: "https://gitlab.com/proj" },
    before: "abc123",
    after: "def456",
    commits: [
      { id: "abc1234567890", message: "First commit\n\nDetails here" },
      { id: "bcd2345678901", message: "Second commit" },
      { id: "cde3456789012", message: "Third commit" },
    ],
  };

  it("builds basic push message", () => {
    const result = buildPushMessage(baseBody, false);
    expect(result.text).toContain("🚀 Push to `main`");
    expect(result.text).toContain("3 commit(s) pushed");
  });

  it("lists commits with short SHA", () => {
    const result = buildPushMessage(baseBody, false);
    expect(result.text).toContain("`abc1234`");
    expect(result.text).toContain("First commit");
    expect(result.text).toContain("`bcd2345`");
    expect(result.text).toContain("Second commit");
  });

  it("truncates long commit messages", () => {
    const body = {
      ...baseBody,
      commits: [
        { id: "abc123", message: "a".repeat(100) },
      ],
    };
    const result = buildPushMessage(body, false);
    expect(result.text).toContain("a".repeat(50));
    expect(result.text).not.toContain("a".repeat(51));
  });

  it("shows 'more' indicator when > 3 commits", () => {
    const body = {
      ...baseBody,
      total_commits_count: 5,
      commits: [
        { id: "1", message: "c1" },
        { id: "2", message: "c2" },
        { id: "3", message: "c3" },
        { id: "4", message: "c4" },
        { id: "5", message: "c5" },
      ],
    };
    const result = buildPushMessage(body, false);
    expect(result.text).toContain("_and 2 more..._");
  });

  it("handles no commits", () => {
    const body = {
      ...baseBody,
      total_commits_count: 0,
      commits: [],
    };
    const result = buildPushMessage(body, false);
    expect(result.text).toContain("0 commit(s) pushed");
    expect(result.text).not.toContain("•");
  });

  it("handles missing project web_url", () => {
    const body = { ...baseBody, project: {} };
    const result = buildPushMessage(body, false);
    expect(result.keyboard.inline_keyboard.flat().length).toBe(0);
  });

  it("escapes markdown in branch name", () => {
    const body = { ...baseBody, ref: "refs/heads/feature/[test]" };
    const result = buildPushMessage(body, false);
    expect(result.text).toContain("feature/\\[test\\]");
  });
});

describe("buildPipelineMessage", () => {
  const baseBody = {
    object_attributes: {
      status: "success",
      id: 123,
      duration: 45.7,
    },
    project: { web_url: "https://gitlab.com/proj" },
    commit: {
      id: "abc123def456",
      message: "Fix pipeline config\n\nMore details",
    },
  };

  it("builds success pipeline message", () => {
    const result = buildPipelineMessage(baseBody, false);
    expect(result.text).toContain("✅ Pipeline *SUCCESS*");
    expect(result.text).toContain("(46s)");
  });

  it("uses correct emoji for each status", () => {
    const statuses = [
      { status: "success", emoji: "✅" },
      { status: "failed", emoji: "❌" },
      { status: "canceled", emoji: "🚫" },
      { status: "running", emoji: "🔄" },
      { status: "pending", emoji: "⏳" },
      { status: "unknown", emoji: "🛠" },
    ];

    for (const { status, emoji } of statuses) {
      const body = {
        ...baseBody,
        object_attributes: { ...baseBody.object_attributes, status },
      };
      const result = buildPipelineMessage(body, false);
      expect(result.text).toContain(emoji);
      expect(result.text).toContain(status.toUpperCase());
    }
  });

  it("shows commit info", () => {
    const result = buildPipelineMessage(baseBody, false);
    expect(result.text).toContain("`abc123d`");
    expect(result.text).toContain("Fix pipeline config");
  });

  it("rounds duration correctly", () => {
    const body = {
      ...baseBody,
      object_attributes: { ...baseBody.object_attributes, duration: 44.4 },
    };
    const result = buildPipelineMessage(body, false);
    expect(result.text).toContain("(44s)");
  });

  it("omits duration when not provided", () => {
    const body = {
      ...baseBody,
      object_attributes: { status: "success", id: 1 },
    };
    const result = buildPipelineMessage(body, false);
    expect(result.text).not.toContain("s)");
  });

  it("handles missing commit", () => {
    const body = { ...baseBody, commit: null };
    const result = buildPipelineMessage(body, false);
    expect(result.text).not.toContain("`");
  });
});

describe("buildCommentMessage", () => {
  const baseBody = {
    object_attributes: {
      noteable_type: "Issue",
      note: "This is a comment about the issue",
      url: "https://gitlab.com/proj/issues/1#note_1",
    },
  };

  it("builds basic comment message", () => {
    const result = buildCommentMessage(baseBody, false);
    expect(result.text).toContain("💬 Comment on Issue");
    expect(result.text).toContain("This is a comment about the issue");
  });

  it("truncates long comments", () => {
    const body = {
      ...baseBody,
      object_attributes: {
        ...baseBody.object_attributes,
        note: "a".repeat(200),
      },
    };
    const result = buildCommentMessage(body, false);
    expect(result.text).toContain("a".repeat(150));
    expect(result.text).toContain("...");
  });

  it("does not truncate short comments", () => {
    const result = buildCommentMessage(baseBody, false);
    expect(result.text).not.toContain("...");
  });

  it("handles missing note", () => {
    const body = {
      object_attributes: {
        noteable_type: "MergeRequest",
        url: "https://gitlab.com/proj/merge_requests/1#note_1",
      },
    };
    const result = buildCommentMessage(body, false);
    expect(result.text).toContain("💬 Comment on MergeRequest");
    expect(result.text).not.toContain("_undefined");
  });

  it("escapes markdown in comment", () => {
    const body = {
      ...baseBody,
      object_attributes: {
        ...baseBody.object_attributes,
        note: "Use *bold* and [links](http://example.com)",
      },
    };
    const result = buildCommentMessage(body, false);
    expect(result.text).toContain("Use \\*bold\\*");
  });
});

describe("buildMessage", () => {
  const baseBody = {
    object_attributes: {
      action: "opened",
      title: "Test",
      url: "https://example.com",
      iid: 1,
    },
    project: { web_url: "https://example.com" },
  };

  it("prepends project and user header", () => {
    const result = buildMessage("Issue Hook", baseBody, "My Project", "John", false);
    expect(result.text).toContain("📂 *My Project*");
    expect(result.text).toContain("👤 John");
  });

  it("adds robot marker for ignored user", () => {
    const result = buildMessage("Issue Hook", baseBody, "My Project", "Bot", true);
    expect(result.text).toContain("🤖 *[AUTOMATED UPDATE]*");
    expect(result.text).toContain("👤 🤖 Robot/Bot");
  });

  it("escapes markdown in project name", () => {
    const result = buildMessage("Issue Hook", baseBody, "Project [V2]", "User", false);
    expect(result.text).toContain("Project \\[V2\\]");
  });

  it("handles all event types", () => {
    const events = [
      "Issue Hook",
      "Confidential Issue Hook",
      "Work Item Hook",
      "Merge Request Hook",
      "Push Hook",
      "Pipeline Hook",
      "Note Hook",
      "Confidential Note Hook",
      "Tag Push Hook",
      "Build Hook",
      "Job Hook",
      "Deployment Hook",
      "Release Hook",
      "Wiki Page Hook",
      "Milestone Hook",
      "Vulnerability Hook",
    ];

    for (const event of events) {
      const result = buildMessage(event, baseBody, "Proj", "User", false);
      expect(result.text.length).toBeGreaterThan(0);
      expect(result.text).toContain("📂 *Proj*");
    }
  });

  it("handles unknown event type gracefully", () => {
    const result = buildMessage("Unknown Event", baseBody, "Proj", "User", false);
    expect(result.text).toContain("ℹ️ Unknown Event");
    expect(result.text).toContain("_Unhandled event type_");
  });

  it("handles empty body gracefully", () => {
    const result = buildMessage("Issue Hook", {}, "Proj", "User", false);
    expect(result.text).toContain("📂 *Proj*");
    expect(result.text).toContain("📋 Issue *#* updated");
  });

  it("always returns a keyboard object", () => {
    const result = buildMessage("Milestone Hook", baseBody, "Proj", "User", false);
    expect(result.keyboard).toBeDefined();
    expect(result.keyboard.inline_keyboard).toBeDefined();
  });
});
