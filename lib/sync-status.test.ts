import { describe, it, expect } from "vitest";
import { calculateOverallStatus } from "./sync-status";

describe("calculateOverallStatus", () => {
  it("returns To Do for empty array", () => {
    expect(calculateOverallStatus([])).toBe("Status::To Do");
  });

  it("returns To Do for all todo tasks", () => {
    expect(calculateOverallStatus(["todo", "todo"])).toBe("Status::To Do");
  });

  it("returns To Do for single todo task", () => {
    expect(calculateOverallStatus(["todo"])).toBe("Status::To Do");
  });

  it("returns In Progress for single in_progress task", () => {
    expect(calculateOverallStatus(["in_progress"])).toBe("Status::In Progress");
  });

  it("returns In Progress for mixed todo and in_progress", () => {
    expect(calculateOverallStatus(["todo", "in_progress"])).toBe("Status::In Progress");
  });

  it("returns In Progress for mixed integrated and todo", () => {
    expect(calculateOverallStatus(["integrated", "todo"])).toBe("Status::In Progress");
  });

  it("returns Integrated for all integrated tasks", () => {
    expect(calculateOverallStatus(["integrated", "integrated"])).toBe("Status::Integrated");
  });

  it("returns Integrated for single integrated task", () => {
    expect(calculateOverallStatus(["integrated"])).toBe("Status::Integrated");
  });

  it("returns In Progress for mixed all categories", () => {
    expect(
      calculateOverallStatus(["todo", "in_progress", "integrated"])
    ).toBe("Status::In Progress");
  });

  it("returns In Progress for mixed integrated and in_progress", () => {
    expect(calculateOverallStatus(["integrated", "in_progress"])).toBe("Status::In Progress");
  });

  it("handles complex real-world scenario", () => {
    expect(
      calculateOverallStatus([
        "todo",
        "todo",
        "in_progress",
        "in_progress",
        "integrated",
      ])
    ).toBe("Status::In Progress");
  });

  it("handles all integrated except one todo as In Progress", () => {
    expect(
      calculateOverallStatus([
        "integrated",
        "integrated",
        "todo",
      ])
    ).toBe("Status::In Progress");
  });
});
