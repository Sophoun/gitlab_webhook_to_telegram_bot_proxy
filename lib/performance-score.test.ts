import { describe, it, expect } from "vitest";
import {
  detectRole,
  calculatePerformanceScore,
  type PersonMetrics,
} from "./performance-score";

function makeMetrics(overrides: Partial<PersonMetrics> = {}): PersonMetrics {
  return {
    issuesCreated: 0,
    issuesClosed: 0,
    mrsCreated: 0,
    mrsMerged: 0,
    commits: 0,
    totalEvents: 0,
    progressDelivered: 0,
    openTaskCount: 0,
    avgFirstResponseHours: null,
    avgCycleTimeHours: null,
    totalComments: 0,
    consistency: 0,
    issuesReopened: 0,
    ...overrides,
  };
}

describe("detectRole", () => {
  it("detects developer when has code output", () => {
    const m = makeMetrics({ commits: 20 });
    expect(detectRole(m)).toBe("developer");
  });

  it("detects developer when has MRs", () => {
    const m = makeMetrics({ mrsMerged: 5 });
    expect(detectRole(m)).toBe("developer");
  });

  it("detects developer when has commits and creates issues but does not move them", () => {
    const m = makeMetrics({ commits: 10, issuesCreated: 3 });
    expect(detectRole(m)).toBe("developer");
  });

  it("detects coordinator (BIZ) when no code output", () => {
    const m = makeMetrics({ issuesCreated: 10 });
    expect(detectRole(m)).toBe("coordinator");
  });

  it("detects coordinator (BIZ) when closes issues without code", () => {
    const m = makeMetrics({ issuesClosed: 10, issuesCreated: 3 });
    expect(detectRole(m)).toBe("coordinator");
  });

  it("detects coordinator (BIZ) for zero activity", () => {
    const m = makeMetrics();
    expect(detectRole(m)).toBe("coordinator");
  });

  it("detects mixed when has commits, creates issues, and moves them", () => {
    const m = makeMetrics({ commits: 10, issuesCreated: 5, issuesClosed: 5 });
    expect(detectRole(m)).toBe("mixed");
  });

  it("detects mixed when has commits, creates issues, and delivers progress", () => {
    const m = makeMetrics({ commits: 10, issuesCreated: 5, progressDelivered: 10 });
    expect(detectRole(m)).toBe("mixed");
  });
});

describe("calculatePerformanceScore", () => {
  it("returns score 0 and grade F for zero activity", () => {
    const m = makeMetrics();
    const r = calculatePerformanceScore(m);
    expect(r.score).toBe(0);
    expect(r.grade).toBe("F");
    expect(r.role).toBe("coordinator");
  });

  it("developer with strong output gets high score", () => {
    const m = makeMetrics({
      commits: 80,
      mrsMerged: 20,
      mrsCreated: 10,
      issuesClosed: 15,
      progressDelivered: 40,
      avgFirstResponseHours: 4,
      avgCycleTimeHours: 48,
      totalComments: 10,
      openTaskCount: 8,
      totalEvents: 120,
      consistency: 80,
    });
    const r = calculatePerformanceScore(m);
    expect(r.role).toBe("developer");
    expect(r.score).toBeGreaterThanOrEqual(60);
    expect(["A", "B", "C", "D"]).toContain(r.grade);
  });

  it("coordinator with strong issue management gets high score", () => {
    const m = makeMetrics({
      issuesCreated: 30,
      issuesClosed: 20,
      totalComments: 25,
      progressDelivered: 30,
      openTaskCount: 0,
      totalEvents: 55,
      consistency: 70,
    });
    const r = calculatePerformanceScore(m);
    expect(r.role).toBe("coordinator");
    expect(r.score).toBeGreaterThanOrEqual(60);
  });

  it("score is clamped to 100", () => {
    const m = makeMetrics({
      commits: 200,
      mrsMerged: 100,
      mrsCreated: 50,
      issuesClosed: 50,
      issuesCreated: 10,
      progressDelivered: 100,
      avgFirstResponseHours: 1,
      avgCycleTimeHours: 4,
      totalComments: 50,
      openTaskCount: 10,
      totalEvents: 300,
      consistency: 100,
    });
    const r = calculatePerformanceScore(m);
    expect(r.score).toBeLessThanOrEqual(100);
  });

  it("grade boundaries are correct", () => {
    const m = makeMetrics({
      commits: 15, mrsMerged: 5, mrsCreated: 3,
      issuesCreated: 10, issuesClosed: 8,
      totalComments: 5, openTaskCount: 2,
      progressDelivered: 20, totalEvents: 30,
      consistency: 50,
    });
    const r = calculatePerformanceScore(m);
    expect(["A", "B", "C", "D", "F"]).toContain(r.grade);
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
  });

  it("breakdown sums approximately to score", () => {
    const m = makeMetrics({
      commits: 20, mrsMerged: 5, issuesClosed: 10,
      issuesCreated: 5, totalComments: 8,
      progressDelivered: 15, openTaskCount: 2,
      totalEvents: 30, consistency: 60,
    });
    const r = calculatePerformanceScore(m);
    const breakdownSum =
      r.breakdown.code + r.breakdown.delivery + r.breakdown.workload + r.breakdown.quality + r.breakdown.consistency;
    expect(Math.abs(r.score - Math.round(breakdownSum))).toBeLessThanOrEqual(1);
  });

  it("developer scores higher on code dimension", () => {
    const dev = makeMetrics({ commits: 8, mrsMerged: 2, mrsCreated: 1, totalEvents: 11 });
    const devResult = calculatePerformanceScore(dev);
    expect(devResult.role).toBe("developer");
    expect(devResult.breakdown.code).toBeGreaterThan(0);
  });

  it("open tasks boost developer workload score", () => {
    const few = makeMetrics({ commits: 10, openTaskCount: 1, totalEvents: 10 });
    const many = makeMetrics({ commits: 10, openTaskCount: 10, totalEvents: 10 });
    const fewResult = calculatePerformanceScore(few);
    const manyResult = calculatePerformanceScore(many);
    expect(manyResult.breakdown.workload).toBeGreaterThan(fewResult.breakdown.workload);
  });

  it("rework penalty reduces developer quality score", () => {
    const clean = makeMetrics({ commits: 10, issuesClosed: 10, issuesReopened: 0, totalEvents: 20, consistency: 80 });
    const reworked = makeMetrics({ commits: 10, issuesClosed: 10, issuesReopened: 8, totalEvents: 28, consistency: 80 });
    const cleanResult = calculatePerformanceScore(clean);
    const reworkedResult = calculatePerformanceScore(reworked);
    expect(reworkedResult.breakdown.quality).toBeLessThan(cleanResult.breakdown.quality);
  });

  it("consistency boosts score", () => {
    const sporadic = makeMetrics({ commits: 10, totalEvents: 10, consistency: 20 });
    const consistent = makeMetrics({ commits: 10, totalEvents: 10, consistency: 90 });
    const sporadicResult = calculatePerformanceScore(sporadic);
    const consistentResult = calculatePerformanceScore(consistent);
    expect(consistentResult.breakdown.consistency).toBeGreaterThan(sporadicResult.breakdown.consistency);
    expect(consistentResult.score).toBeGreaterThan(sporadicResult.score);
  });

  it("fast response time boosts quality score", () => {
    const fast = makeMetrics({ commits: 10, totalEvents: 10, avgFirstResponseHours: 2, avgCycleTimeHours: 24 });
    const slow = makeMetrics({ commits: 10, totalEvents: 10, avgFirstResponseHours: 72, avgCycleTimeHours: 336 });
    const fastResult = calculatePerformanceScore(fast);
    const slowResult = calculatePerformanceScore(slow);
    expect(fastResult.breakdown.quality).toBeGreaterThan(slowResult.breakdown.quality);
  });
});
