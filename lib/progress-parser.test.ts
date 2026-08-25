import { describe, it, expect } from "vitest";
import {
  parseProgressCommands,
  parseProgressUpdate,
  computeProgressDelivered,
  type ProgressHistoryEntry,
} from "./progress-parser";

describe("parseProgressCommands", () => {
  it("parses /dev with plain number", () => {
    expect(parseProgressCommands("/dev 60")).toEqual([{ stage: "dev", value: 60 }]);
  });

  it("parses /dev with percent sign", () => {
    expect(parseProgressCommands("/dev 60%")).toEqual([{ stage: "dev", value: 60 }]);
  });

  it("parses /dev with 'percent' suffix", () => {
    expect(parseProgressCommands("/dev 60 percent")).toEqual([{ stage: "dev", value: 60 }]);
  });

  it("parses /test as qa stage", () => {
    expect(parseProgressCommands("/test 30")).toEqual([{ stage: "qa", value: 30 }]);
  });

  it("parses /uat as qa stage", () => {
    expect(parseProgressCommands("/uat 35%")).toEqual([{ stage: "qa", value: 35 }]);
  });

  it("is case-insensitive", () => {
    expect(parseProgressCommands("/DEV 10")).toEqual([{ stage: "dev", value: 10 }]);
    expect(parseProgressCommands("/Uat 25")).toEqual([{ stage: "qa", value: 25 }]);
  });

  it("parses multiple commands in one comment", () => {
    expect(parseProgressCommands("/dev 80 /test 20")).toEqual([
      { stage: "dev", value: 80 },
      { stage: "qa", value: 20 },
    ]);
  });

  it("extracts command from surrounding text", () => {
    const body = "Finished the API layer today.\n/dev 40\nNext up: unit tests.";
    expect(parseProgressCommands(body)).toEqual([{ stage: "dev", value: 40 }]);
  });

  it("accepts boundary values 0 and 100", () => {
    expect(parseProgressCommands("/dev 0")).toEqual([{ stage: "dev", value: 0 }]);
    expect(parseProgressCommands("/dev 100")).toEqual([{ stage: "dev", value: 100 }]);
  });

  it("rejects values above 100", () => {
    expect(parseProgressCommands("/dev 150")).toEqual([]);
  });

  it("rejects commands without a number", () => {
    expect(parseProgressCommands("/dev")).toEqual([]);
    expect(parseProgressCommands("/dev ")).toEqual([]);
  });

  it("rejects non-numeric values", () => {
    expect(parseProgressCommands("/dev abc")).toEqual([]);
  });

  it("does not match words containing the command", () => {
    // "develop" contains "dev" but must not match; "/device" too
    expect(parseProgressCommands("please develop this")).toEqual([]);
    expect(parseProgressCommands("/device 50")).toEqual([]);
  });

  it("returns empty for null/undefined/empty body", () => {
    expect(parseProgressCommands(null)).toEqual([]);
    expect(parseProgressCommands(undefined)).toEqual([]);
    expect(parseProgressCommands("")).toEqual([]);
  });

  it("does not match mid-word slash commands", () => {
    expect(parseProgressCommands("abc/dev 50")).toEqual([]);
  });
});

describe("parseProgressUpdate", () => {
  it("returns dev only when only dev command present", () => {
    expect(parseProgressUpdate("/dev 60")).toEqual({ dev: 60, qa: null });
  });

  it("returns qa only when only test/uat command present", () => {
    expect(parseProgressUpdate("/test 30")).toEqual({ dev: null, qa: 30 });
    expect(parseProgressUpdate("/uat 35%")).toEqual({ dev: null, qa: 35 });
  });

  it("later commands win within the same comment", () => {
    expect(parseProgressUpdate("/dev 30 then more work /dev 70")).toEqual({
      dev: 70,
      qa: null,
    });
  });

  it("handles both stages in one comment", () => {
    expect(parseProgressUpdate("/dev 100 /uat 20")).toEqual({ dev: 100, qa: 20 });
  });

  it("returns nulls when no commands found", () => {
    expect(parseProgressUpdate("just a normal comment")).toEqual({
      dev: null,
      qa: null,
    });
    expect(parseProgressUpdate(null)).toEqual({ dev: null, qa: null });
  });
});

describe("computeProgressDelivered", () => {
  const T0 = new Date("2026-08-01T00:00:00Z");
  const entry = (
    overrides: Partial<ProgressHistoryEntry>
  ): ProgressHistoryEntry => ({
    gitlabProjectId: 1,
    issueIid: 10,
    stage: "dev",
    progress: 0,
    updatedBy: "john",
    occurredAt: T0,
    ...overrides,
  });
  const WEEK = { from: T0, to: new Date("2026-08-08T00:00:00Z") };

  it("credits the positive delta, not raw values", () => {
    const result = computeProgressDelivered(
      [
        entry({ progress: 30, occurredAt: new Date("2026-08-02T00:00:00Z") }),
        entry({ progress: 70, occurredAt: new Date("2026-08-03T00:00:00Z") }),
      ],
      WEEK.from,
      WEEK.to
    );
    expect(result.get("john")).toEqual({ dev: 70, qa: 0 }); // (30-0) + (70-30)
  });

  it("credits each author with their own delta", () => {
    const result = computeProgressDelivered(
      [
        entry({ progress: 50, updatedBy: "john", occurredAt: new Date("2026-08-02T00:00:00Z") }),
        entry({ progress: 90, updatedBy: "jane", occurredAt: new Date("2026-08-03T00:00:00Z") }),
      ],
      WEEK.from,
      WEEK.to
    );
    expect(result.get("john")).toEqual({ dev: 50, qa: 0 });
    expect(result.get("jane")).toEqual({ dev: 40, qa: 0 });
  });

  it("tracks dev and qa independently per issue", () => {
    const result = computeProgressDelivered(
      [
        entry({ stage: "dev", progress: 100, occurredAt: new Date("2026-08-02T00:00:00Z") }),
        entry({ stage: "qa", progress: 40, occurredAt: new Date("2026-08-02T01:00:00Z") }),
      ],
      WEEK.from,
      WEEK.to
    );
    expect(result.get("john")).toEqual({ dev: 100, qa: 40 });
  });

  it("does not double-count across different issues", () => {
    const result = computeProgressDelivered(
      [
        entry({ issueIid: 10, progress: 60, occurredAt: new Date("2026-08-02T00:00:00Z") }),
        entry({ issueIid: 11, progress: 40, occurredAt: new Date("2026-08-02T01:00:00Z") }),
      ],
      WEEK.from,
      WEEK.to
    );
    expect(result.get("john")).toEqual({ dev: 100, qa: 0 }); // 60 + 40
  });

  it("gives no negative credit for corrections that lower a value", () => {
    const result = computeProgressDelivered(
      [
        entry({ progress: 80, occurredAt: new Date("2026-08-02T00:00:00Z") }),
        entry({ progress: 30, updatedBy: "jane", occurredAt: new Date("2026-08-03T00:00:00Z") }),
        entry({ progress: 60, occurredAt: new Date("2026-08-04T00:00:00Z") }),
      ],
      WEEK.from,
      WEEK.to
    );
    // john: +80; jane: correction 80->30 = 0; john again: 30->60 = +30
    expect(result.get("john")).toEqual({ dev: 110, qa: 0 });
    expect(result.has("jane")).toBe(false);
  });

  it("only credits entries within the date range but uses full history for deltas", () => {
    const result = computeProgressDelivered(
      [
        // Before the window — establishes baseline, not credited
        entry({ progress: 50, occurredAt: new Date("2026-07-20T00:00:00Z") }),
        // Inside the window
        entry({ progress: 90, occurredAt: new Date("2026-08-03T00:00:00Z") }),
      ],
      WEEK.from,
      WEEK.to
    );
    expect(result.get("john")).toEqual({ dev: 40, qa: 0 });
  });

  it("sorts unsorted input before computing deltas", () => {
    const result = computeProgressDelivered(
      [
        entry({ progress: 70, occurredAt: new Date("2026-08-03T00:00:00Z") }),
        entry({ progress: 30, occurredAt: new Date("2026-08-02T00:00:00Z") }),
      ],
      WEEK.from,
      WEEK.to
    );
    expect(result.get("john")).toEqual({ dev: 70, qa: 0 });
  });

  it("ignores entries without an author", () => {
    const result = computeProgressDelivered(
      [entry({ progress: 50, updatedBy: "", occurredAt: new Date("2026-08-02T00:00:00Z") })],
      WEEK.from,
      WEEK.to
    );
    expect(result.size).toBe(0);
  });

  it("returns empty map for empty history", () => {
    expect(computeProgressDelivered([], WEEK.from, WEEK.to).size).toBe(0);
  });
});
