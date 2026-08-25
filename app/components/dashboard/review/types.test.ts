import { describe, it, expect } from "vitest";
import { parseBoardLabels } from "./types";

describe("parseBoardLabels — main board stages", () => {
  it("maps main board labels", () => {
    expect(parseBoardLabels("Backlog", "opened").boardStage).toBe("Backlog");
    expect(parseBoardLabels("Refinement", "opened").boardStage).toBe("Refinement");
    expect(parseBoardLabels("Ready for Dev", "opened").boardStage).toBe("Ready for Dev");
    expect(parseBoardLabels("In Progress", "opened").boardStage).toBe("In Progress");
    expect(parseBoardLabels("Peer Review", "opened").boardStage).toBe("Peer Review");
    expect(parseBoardLabels("Testing/QA", "opened").boardStage).toBe("Testing/QA");
    expect(parseBoardLabels("Completed", "opened").boardStage).toBe("Completed");
  });

  it("closed state always wins as Done", () => {
    expect(parseBoardLabels("In Progress", "closed").boardStage).toBe("Done");
  });

  it("most advanced label wins when multiple present", () => {
    expect(parseBoardLabels("In Progress,Status::To Do", "opened").boardStage).toBe(
      "In Progress"
    );
  });
});

describe("parseBoardLabels — squad board aliases", () => {
  it("Frontend/Mobile/DevOps: To Do variants map to Backlog", () => {
    expect(parseBoardLabels("To Do", "opened").boardStage).toBe("Backlog");
    expect(parseBoardLabels("Todo", "opened").boardStage).toBe("Backlog");
    expect(parseBoardLabels("Status::To Do", "opened").boardStage).toBe("Backlog");
  });

  it("QA / Design Review and QA / Review map to Testing/QA", () => {
    expect(parseBoardLabels("QA / Design Review", "opened").boardStage).toBe("Testing/QA");
    expect(parseBoardLabels("QA / Review", "opened").boardStage).toBe("Testing/QA");
    expect(parseBoardLabels("Review / QA", "opened").boardStage).toBe("Testing/QA");
  });

  it("UAT maps to Testing/QA", () => {
    expect(parseBoardLabels("Enhacement,UAT,iOS", "opened").boardStage).toBe("Testing/QA");
  });

  it("open issue labeled Done maps to Done", () => {
    expect(parseBoardLabels("Android,Done", "opened").boardStage).toBe("Done");
  });

  it("Backend: Development maps to In Progress, Integrated to Completed", () => {
    expect(parseBoardLabels("Development", "opened").boardStage).toBe("In Progress");
    expect(parseBoardLabels("Integrated", "opened").boardStage).toBe("Completed");
  });

  it("QA squad: Status labels map correctly", () => {
    expect(parseBoardLabels("Status::Ready to Test", "opened").boardStage).toBe(
      "Testing/QA"
    );
    expect(parseBoardLabels("Status::In Testing", "opened").boardStage).toBe("Testing/QA");
    expect(parseBoardLabels("Status::Verified", "opened").boardStage).toBe("Completed");
  });

  it("Ready to Release maps to Completed", () => {
    expect(parseBoardLabels("Android,Enhacement,Ready to Release", "opened").boardStage).toBe(
      "Completed"
    );
  });

  it("non-stage labels still resolve to No Stage", () => {
    expect(parseBoardLabels("Design,api,integration", "opened").boardStage).toBe(
      "No Stage"
    );
    expect(parseBoardLabels("Bug,P1 - High", "opened").boardStage).toBe("No Stage");
  });

  it("priority and team extraction still work with new aliases", () => {
    const r = parseBoardLabels("QA / Design Review,P1 - High,Android", "opened");
    expect(r.boardStage).toBe("Testing/QA");
    expect(r.priority).toBe("P1");
    expect(r.team).toBe("Android");
  });
});
