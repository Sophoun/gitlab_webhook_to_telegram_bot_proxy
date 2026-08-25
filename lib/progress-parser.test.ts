import { describe, it, expect } from "vitest";
import { parseProgressCommands, parseProgressUpdate } from "./progress-parser";

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
