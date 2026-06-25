import { describe, it, expect } from "vitest";
import {
  getIgnoredUsers,
  isUserInIgnoreList,
  shouldSkipDescriptionOnlyUpdate,
} from "./webhook-filters";

describe("getIgnoredUsers", () => {
  it("parses comma-separated list", () => {
    expect(getIgnoredUsers("alice, bob, charlie")).toEqual(["alice", "bob", "charlie"]);
  });

  it("trims whitespace around names", () => {
    expect(getIgnoredUsers("  alice , bob  , charlie ")).toEqual(["alice", "bob", "charlie"]);
  });

  it("returns empty array for empty string", () => {
    expect(getIgnoredUsers("")).toEqual([]);
  });

  it("returns empty array for null/undefined", () => {
    expect(getIgnoredUsers(null)).toEqual([]);
    expect(getIgnoredUsers(undefined)).toEqual([]);
  });

  it("filters out empty entries", () => {
    expect(getIgnoredUsers("alice,,bob,")).toEqual(["alice", "bob"]);
  });
});

describe("isUserInIgnoreList", () => {
  const ignoreList = ["alice", "bot_user"];

  it("matches by display name", () => {
    expect(isUserInIgnoreList(ignoreList, "Alice", "")).toBe(false);
    expect(isUserInIgnoreList(ignoreList, "alice", "")).toBe(true);
  });

  it("matches by username", () => {
    expect(isUserInIgnoreList(ignoreList, "Alice", "bot_user")).toBe(true);
  });

  it("does not match when neither name nor username is in list", () => {
    expect(isUserInIgnoreList(ignoreList, "Bob", "bob_user")).toBe(false);
  });

  it("does not match empty username against list", () => {
    expect(isUserInIgnoreList(ignoreList, "Alice", "")).toBe(false);
  });

  it("does not match when list is empty", () => {
    expect(isUserInIgnoreList([], "Alice", "alice")).toBe(false);
  });
});

describe("shouldSkipDescriptionOnlyUpdate", () => {
  const baseBody = {
    object_attributes: {
      action: "update",
      title: "Fix bug",
      iid: 42,
      description: "Updated description text",
    },
    project: { name: "Test" },
  };

  // --- should NOT skip (feature disabled) ---
  it("returns false when skipDescriptionOnlyUpdates is false", () => {
    const body = {
      ...baseBody,
      changes: { description: { previous: "old", current: "new" } },
    };
    expect(shouldSkipDescriptionOnlyUpdate("Issue Hook", false, body)).toBe(false);
  });

  it("returns false when skipDescriptionOnlyUpdates is null/undefined", () => {
    const body = {
      ...baseBody,
      changes: { description: { previous: "old", current: "new" } },
    };
    expect(shouldSkipDescriptionOnlyUpdate("Issue Hook", null, body)).toBe(false);
    expect(shouldSkipDescriptionOnlyUpdate("Issue Hook", undefined, body)).toBe(false);
  });

  // --- should NOT skip (non-issue events) ---
  it("returns false for non-issue event types", () => {
    const nonIssueEvents = [
      "Push Hook",
      "Pipeline Hook",
      "Merge Request Hook",
      "Note Hook",
      "Tag Push Hook",
      "Release Hook",
    ];
    for (const event of nonIssueEvents) {
      const body = {
        ...baseBody,
        changes: { description: { previous: "old", current: "new" } },
      };
      expect(shouldSkipDescriptionOnlyUpdate(event, true, body)).toBe(false);
    }
  });

  // --- should NOT skip (not an update action) ---
  it("returns false for non-update actions (open, close, reopen)", () => {
    const nonUpdateActions = ["open", "close", "reopen", "delete"];
    for (const action of nonUpdateActions) {
      const body = {
        ...baseBody,
        object_attributes: { ...baseBody.object_attributes, action },
        changes: { description: { previous: "old", current: "new" } },
      };
      expect(shouldSkipDescriptionOnlyUpdate("Issue Hook", true, body)).toBe(false);
    }
  });

  // --- should NOT skip (no changes object) ---
  it("returns false when there are no changes", () => {
    expect(shouldSkipDescriptionOnlyUpdate("Issue Hook", true, baseBody)).toBe(false);
  });

  // --- should NOT skip (label changes present with description) ---
  it("returns false when labels changed alongside description", () => {
    const body = {
      ...baseBody,
      changes: {
        description: { previous: "old", current: "new" },
        labels: {
          previous: [{ title: "bug" }],
          current: [{ title: "bug" }, { title: "urgent" }],
        },
      },
    };
    expect(shouldSkipDescriptionOnlyUpdate("Issue Hook", true, body)).toBe(false);
  });

  // --- should NOT skip (assignee changes present) ---
  it("returns false when assignee changed", () => {
    const body = {
      ...baseBody,
      changes: {
        description: { previous: "old", current: "new" },
        assignee: {
          previous: { id: 1, name: "Alice" },
          current: { id: 2, name: "Bob" },
        },
      },
    };
    expect(shouldSkipDescriptionOnlyUpdate("Issue Hook", true, body)).toBe(false);
  });

  // --- should NOT skip (milestone changed) ---
  it("returns false when milestone changed", () => {
    const body = {
      ...baseBody,
      changes: {
        description: { previous: "old", current: "new" },
        milestone_id: {
          previous: { id: 1, title: "v1" },
          current: { id: 2, title: "v2" },
        },
      },
    };
    expect(shouldSkipDescriptionOnlyUpdate("Issue Hook", true, body)).toBe(false);
  });

  // --- should NOT skip (state changed) ---
  it("returns false when state changed", () => {
    const body = {
      ...baseBody,
      changes: {
        description: { previous: "old", current: "new" },
        state_id: { previous: 1, current: 2 },
      },
    };
    expect(shouldSkipDescriptionOnlyUpdate("Issue Hook", true, body)).toBe(false);
  });

  // --- should NOT skip (only labels changed, no description) ---
  it("returns false when only labels changed (no description)", () => {
    const body = {
      ...baseBody,
      changes: {
        labels: {
          previous: [{ title: "bug" }],
          current: [{ title: "feature" }],
        },
        updated_at: { previous: "2024-01-01", current: "2024-01-02" },
      },
    };
    expect(shouldSkipDescriptionOnlyUpdate("Issue Hook", true, body)).toBe(false);
  });

  // --- should NOT skip (only milestone changed, no description) ---
  it("returns false when only milestone changed (no description)", () => {
    const body = {
      ...baseBody,
      changes: {
        milestone_id: { previous: null, current: { id: 1, title: "v1" } },
        updated_at: { previous: "2024-01-01", current: "2024-01-02" },
      },
    };
    expect(shouldSkipDescriptionOnlyUpdate("Issue Hook", true, body)).toBe(false);
  });

  // --- should NOT skip (only assignee changed, no description) ---
  it("returns false when only assignee changed (no description)", () => {
    const body = {
      ...baseBody,
      changes: {
        assignee: {
          previous: null,
          current: { id: 1, name: "Alice" },
        },
        updated_at: { previous: "2024-01-01", current: "2024-01-02" },
      },
    };
    expect(shouldSkipDescriptionOnlyUpdate("Issue Hook", true, body)).toBe(false);
  });

  // --- should NOT skip (state changed without description) ---
  it("returns false when only state closed (no description)", () => {
    const body = {
      ...baseBody,
      object_attributes: { ...baseBody.object_attributes, state: "closed" },
      changes: {
        state_id: { previous: 1, current: 2 },
        updated_at: { previous: "2024-01-01", current: "2024-01-02" },
      },
    };
    expect(shouldSkipDescriptionOnlyUpdate("Issue Hook", true, body)).toBe(false);
  });

  // --- should NOT skip for Confidential Issue Hook ---
  it("handles Confidential Issue Hook (non-description change)", () => {
    const body = {
      ...baseBody,
      changes: {
        labels: {
          previous: [],
          current: [{ title: "confidential" }],
        },
      },
    };
    expect(shouldSkipDescriptionOnlyUpdate("Confidential Issue Hook", true, body)).toBe(false);
  });

  // --- should NOT skip for Work Item Hook ---
  it("handles Work Item Hook (non-description change)", () => {
    const body = {
      ...baseBody,
      changes: {
        milestone_id: { previous: null, current: { id: 1, title: "Sprint 1" } },
      },
    };
    expect(shouldSkipDescriptionOnlyUpdate("Work Item Hook", true, body)).toBe(false);
  });

  // --- SHOULD skip (only description changed) ---
  it("returns true when only description changed", () => {
    const body = {
      ...baseBody,
      changes: {
        description: { previous: "old description", current: "new description" },
      },
    };
    expect(shouldSkipDescriptionOnlyUpdate("Issue Hook", true, body)).toBe(true);
  });

  it("returns true when description + updated_at changed", () => {
    const body = {
      ...baseBody,
      changes: {
        description: { previous: "old desc", current: "new desc" },
        updated_at: { previous: "2024-01-01T00:00:00Z", current: "2024-01-02T00:00:00Z" },
      },
    };
    expect(shouldSkipDescriptionOnlyUpdate("Issue Hook", true, body)).toBe(true);
  });

  it("returns true for Confidential Issue Hook with only description", () => {
    const body = {
      ...baseBody,
      changes: {
        description: { previous: "old", current: "new" },
        updated_at: { previous: "2024-01-01", current: "2024-01-02" },
      },
    };
    expect(shouldSkipDescriptionOnlyUpdate("Confidential Issue Hook", true, body)).toBe(true);
  });

  it("returns true for Work Item Hook with only description", () => {
    const body = {
      ...baseBody,
      changes: {
        description: { previous: "old", current: "new" },
        updated_at: { previous: "2024-01-01", current: "2024-01-02" },
      },
    };
    expect(shouldSkipDescriptionOnlyUpdate("Work Item Hook", true, body)).toBe(true);
  });
});
