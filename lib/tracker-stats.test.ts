import { describe, it, expect } from "vitest";
import {
  calculateUserStats,
  calculateScore,
  calculateWeeklyActivity,
  calculateTrackerStats,
  filterActivities,
} from "./tracker-stats";
import { UserActivity } from "../app/types";

describe("tracker-stats", () => {
  const mockActivities: UserActivity[] = [
    {
      id: 1,
      projectId: 1,
      projectName: "Project A",
      gitlabProjectId: 100,
      userName: "John Doe",
      userUsername: "john_doe",
      activityType: "issue_created",
      itemIid: 1,
      itemTitle: "Issue 1",
      itemUrl: "https://gitlab.com/project/issues/1",
      occurredAt: "2024-01-15T10:00:00Z",
      syncedAt: "2024-01-15T11:00:00Z",
      labels: "bug",
      state: "opened",
    },
    {
      id: 2,
      projectId: 1,
      projectName: "Project A",
      gitlabProjectId: 100,
      userName: "John Doe",
      userUsername: "john_doe",
      activityType: "issue_closed",
      itemIid: 1,
      itemTitle: "Issue 1",
      itemUrl: "https://gitlab.com/project/issues/1",
      occurredAt: "2024-01-16T10:00:00Z",
      syncedAt: "2024-01-16T11:00:00Z",
      labels: "bug",
      state: "closed",
    },
    {
      id: 3,
      projectId: 1,
      projectName: "Project A",
      gitlabProjectId: 100,
      userName: "Jane Smith",
      userUsername: "jane_smith",
      activityType: "mr_created",
      itemIid: 1,
      itemTitle: "MR 1",
      itemUrl: "https://gitlab.com/project/merge_requests/1",
      occurredAt: "2024-01-17T10:00:00Z",
      syncedAt: "2024-01-17T11:00:00Z",
      labels: "feature",
      state: "opened",
    },
    {
      id: 4,
      projectId: 1,
      projectName: "Project A",
      gitlabProjectId: 100,
      userName: "Jane Smith",
      userUsername: "jane_smith",
      activityType: "mr_merged",
      itemIid: 1,
      itemTitle: "MR 1",
      itemUrl: "https://gitlab.com/project/merge_requests/1",
      occurredAt: "2024-01-18T10:00:00Z",
      syncedAt: "2024-01-18T11:00:00Z",
      labels: "feature",
      state: "merged",
    },
    {
      id: 5,
      projectId: 1,
      projectName: "Project A",
      gitlabProjectId: 100,
      userName: "John Doe",
      userUsername: "john_doe",
      activityType: "commit",
      itemIid: 0,
      itemTitle: "Fix bug",
      itemUrl: "https://gitlab.com/project/commit/abc123",
      occurredAt: "2024-01-19T10:00:00Z",
      syncedAt: "2024-01-19T11:00:00Z",
      labels: null,
      state: null,
    },
  ];

  describe("calculateScore", () => {
    it("should calculate score correctly", () => {
      const stats = {
        username: "john_doe",
        name: "John Doe",
        issuesCreated: 5,
        issuesClosed: 3,
        issuesReopened: 1,
        issueComments: 10,
        mrsCreated: 2,
        mrsMerged: 1,
        mrsClosed: 0,
        mrComments: 5,
        commits: 20,
        score: 0,
      };

      const score = calculateScore(stats);
      // 5*1 + 3*2 + 1*0.5 + 10*1 + 2*2 + 1*3 + 0*1 + 5*1 + 20*1
      // = 5 + 6 + 0.5 + 10 + 4 + 3 + 0 + 5 + 20 = 53.5
      expect(score).toBe(53.5);
    });

    it("should return 0 for empty stats", () => {
      const stats = {
        username: "empty",
        name: "Empty",
        issuesCreated: 0,
        issuesClosed: 0,
        issuesReopened: 0,
        issueComments: 0,
        mrsCreated: 0,
        mrsMerged: 0,
        mrsClosed: 0,
        mrComments: 0,
        commits: 0,
        score: 0,
      };

      expect(calculateScore(stats)).toBe(0);
    });
  });

  describe("calculateUserStats", () => {
    it("should aggregate user activities correctly", () => {
      const userStats = calculateUserStats(mockActivities);

      expect(userStats).toHaveLength(2);

      const john = userStats.find((u) => u.username === "john_doe");
      const jane = userStats.find((u) => u.username === "jane_smith");

      expect(john).toBeDefined();
      expect(jane).toBeDefined();

      expect(john!.issuesCreated).toBe(1);
      expect(john!.issuesClosed).toBe(1);
      expect(john!.commits).toBe(1);

      expect(jane!.mrsCreated).toBe(1);
      expect(jane!.mrsMerged).toBe(1);
    });

    it("should sort users by score descending", () => {
      const userStats = calculateUserStats(mockActivities);

      // Jane has higher score (mr_created*2 + mr_merged*3 = 5) vs John (issue_created*1 + issue_closed*2 + commit*1 = 4)
      expect(userStats[0].username).toBe("jane_smith");
      expect(userStats[1].username).toBe("john_doe");
    });

    it("should handle empty activities", () => {
      const userStats = calculateUserStats([]);
      expect(userStats).toHaveLength(0);
    });
  });

  describe("calculateWeeklyActivity", () => {
    it("should group activities by week", () => {
      const weeklyActivity = calculateWeeklyActivity(mockActivities);

      expect(weeklyActivity.length).toBeGreaterThan(0);

      // Check that all weeks have activity
      const totalIssues =
        weeklyActivity.reduce((sum, w) => sum + w.issuesCreated, 0) +
        weeklyActivity.reduce((sum, w) => sum + w.issuesClosed, 0);
      expect(totalIssues).toBe(2); // 1 created + 1 closed
    });

    it("should sort weeks chronologically", () => {
      const weeklyActivity = calculateWeeklyActivity(mockActivities);

      for (let i = 1; i < weeklyActivity.length; i++) {
        expect(weeklyActivity[i].week >= weeklyActivity[i - 1].week).toBe(true);
      }
    });
  });

  describe("calculateTrackerStats", () => {
    it("should calculate complete stats", () => {
      const stats = calculateTrackerStats(mockActivities);

      expect(stats.summary.totalIssuesCreated).toBe(1);
      expect(stats.summary.totalIssuesClosed).toBe(1);
      expect(stats.summary.totalMrsCreated).toBe(1);
      expect(stats.summary.totalMrsMerged).toBe(1);
      expect(stats.summary.totalCommits).toBe(1);
      expect(stats.summary.totalComments).toBe(0);

      expect(stats.users).toHaveLength(2);
      expect(stats.weeklyActivity.length).toBeGreaterThan(0);
    });
  });

  describe("filterActivities", () => {
    it("should filter by projectId", () => {
      const filtered = filterActivities(mockActivities, { projectId: 1 });
      expect(filtered).toHaveLength(5);

      const filtered2 = filterActivities(mockActivities, { projectId: 999 });
      expect(filtered2).toHaveLength(0);
    });

    it("should filter by username", () => {
      const filtered = filterActivities(mockActivities, { username: "john_doe" });
      expect(filtered).toHaveLength(3); // 2 issues + 1 commit
    });

    it("should filter by activityType", () => {
      const filtered = filterActivities(mockActivities, { activityType: "issue_created" });
      expect(filtered).toHaveLength(1);
    });

    it("should filter by date range", () => {
      const filtered = filterActivities(mockActivities, {
        fromDate: "2024-01-16",
        toDate: "2024-01-18",
      });
      // issue_closed (2024-01-16), mr_created (2024-01-17), mr_merged (2024-01-18)
      expect(filtered).toHaveLength(3);
    });

    it("should combine multiple filters", () => {
      const filtered = filterActivities(mockActivities, {
        username: "john_doe",
        activityType: "issue_created",
      });
      expect(filtered).toHaveLength(1);
    });
  });
});
