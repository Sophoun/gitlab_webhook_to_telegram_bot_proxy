import { describe, it, expect } from "vitest";
import { parseCrossProjectRefs } from "./issue-links";

describe("parseCrossProjectRefs", () => {
  it("parses a simple cross-project reference", () => {
    expect(parseCrossProjectRefs("See backend/api#42 for details")).toEqual([
      { path: "backend/api", iid: 42 },
    ]);
  });

  it("parses nested group paths", () => {
    expect(parseCrossProjectRefs("group/subgroup/android-app#7")).toEqual([
      { path: "group/subgroup/android-app", iid: 7 },
    ]);
  });

  it("parses multiple references", () => {
    const body = "Blocked by backend/api#42, relates to ios/app#15";
    expect(parseCrossProjectRefs(body)).toEqual([
      { path: "backend/api", iid: 42 },
      { path: "ios/app", iid: 15 },
    ]);
  });

  it("deduplicates repeated references", () => {
    const body = "backend/api#42 and again backend/api#42";
    expect(parseCrossProjectRefs(body)).toEqual([{ path: "backend/api", iid: 42 }]);
  });

  it("ignores same-project references (plain #123)", () => {
    expect(parseCrossProjectRefs("duplicate of #123")).toEqual([]);
  });

  it("ignores URLs with fragments", () => {
    // gitlab.com/group/proj#anchor — path would be "gitlab.com/group/proj"...
    // but real issue URLs end before '#', so this matches only anchors.
    const refs = parseCrossProjectRefs("https://gitlab.com/group/proj/-/issues/5");
    expect(refs).toEqual([]);
  });

  it("returns empty for null/undefined/empty body", () => {
    expect(parseCrossProjectRefs(null)).toEqual([]);
    expect(parseCrossProjectRefs(undefined)).toEqual([]);
    expect(parseCrossProjectRefs("")).toEqual([]);
  });

  it("does not match a bare word followed by #number without a slash", () => {
    expect(parseCrossProjectRefs("issue#123")).toEqual([]);
  });
});
