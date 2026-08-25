import { UserActivity, UserStats, WeeklyActivity, TrackerStats } from "../app/types";

export interface IssueAnalyticsRecord {
  id: number;
  projectId: number;
  gitlabProjectId: number;
  issueIid: number;
  issueTitle: string | null;
  issueUrl: string | null;
  authorUsername: string;
  authorName: string;
  state: string;
  labels: string | null;
  createdAt: Date | string;
  closedAt: Date | string | null;
  firstResponseAt: Date | string | null;
  timeToCloseHours: number | null;
  timeToFirstResponseHours: number | null;
  commentCount: number | null;
  uniqueCommenters: string | null;
  syncedAt: Date | string | null;
}

export interface UserInsight {
  username: string;
  name: string;
  
  // Issue authoring
  issuesCreated: number;
  issuesClosed: number;
  issuesOpen: number;
  
  // Time metrics (averages in hours)
  avgTimeToClose: number | null;
  avgTimeToFirstResponse: number | null;
  
  // Work type breakdown (by label)
  labelBreakdown: Record<string, number>;
  
  // Collaboration
  issuesCommentedOn: number;
  uniqueCollaborators: number; // Count, not Set
  
  // Response patterns
  respondedToOthers: number; // times they commented on others' issues
  receivedResponses: number; // times others commented on their issues
}

export function calculateUserStats(activities: UserActivity[]): UserStats[] {
  const userMap = new Map<string, UserStats>();

  for (const activity of activities) {
    const key = activity.userUsername;

    if (!userMap.has(key)) {
      userMap.set(key, {
        username: activity.userUsername,
        name: activity.userName,
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
      });
    }

    const stats = userMap.get(key)!;

    switch (activity.activityType) {
      case "issue_created":
        stats.issuesCreated++;
        break;
      case "issue_closed":
        stats.issuesClosed++;
        break;
      case "issue_reopened":
        stats.issuesReopened++;
        break;
      case "issue_comment":
        stats.issueComments++;
        break;
      case "mr_created":
        stats.mrsCreated++;
        break;
      case "mr_merged":
        stats.mrsMerged++;
        break;
      case "mr_closed":
        stats.mrsClosed++;
        break;
      case "mr_comment":
        stats.mrComments++;
        break;
      case "commit":
        stats.commits++;
        break;
    }
  }

  // Calculate scores
  for (const stats of userMap.values()) {
    stats.score = calculateScore(stats);
  }

  // Sort by score descending
  return Array.from(userMap.values()).sort((a, b) => b.score - a.score);
}

export function calculateScore(stats: UserStats): number {
  // Weighted scoring system
  return (
    stats.issuesCreated * 1 +
    stats.issuesClosed * 2 +
    stats.issuesReopened * 0.5 +
    stats.issueComments * 1 +
    stats.mrsCreated * 2 +
    stats.mrsMerged * 3 +
    stats.mrsClosed * 1 +
    stats.mrComments * 1 +
    stats.commits * 1
  );
}

export function calculateWeeklyActivity(activities: UserActivity[]): WeeklyActivity[] {
  const weekMap = new Map<string, WeeklyActivity>();

  for (const activity of activities) {
    const date = typeof activity.occurredAt === 'string' 
      ? new Date(activity.occurredAt) 
      : activity.occurredAt;
    const weekStart = getWeekStart(date);
    const weekKey = weekStart.toISOString().split("T")[0];

    if (!weekMap.has(weekKey)) {
      weekMap.set(weekKey, {
        week: weekKey,
        issuesCreated: 0,
        issuesClosed: 0,
        mrsCreated: 0,
        mrsMerged: 0,
        commits: 0,
        comments: 0,
      });
    }

    const weekStats = weekMap.get(weekKey)!;

    switch (activity.activityType) {
      case "issue_created":
        weekStats.issuesCreated++;
        break;
      case "issue_closed":
        weekStats.issuesClosed++;
        break;
      case "mr_created":
        weekStats.mrsCreated++;
        break;
      case "mr_merged":
        weekStats.mrsMerged++;
        break;
      case "commit":
        weekStats.commits++;
        break;
      case "issue_comment":
      case "mr_comment":
        weekStats.comments++;
        break;
    }
  }

  // Sort by week ascending
  return Array.from(weekMap.values()).sort((a, b) => a.week.localeCompare(b.week));
}

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when Sunday
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function calculateTrackerStats(activities: UserActivity[]): TrackerStats {
  const users = calculateUserStats(activities);
  const weeklyActivity = calculateWeeklyActivity(activities);

  const summary = {
    totalIssuesCreated: 0,
    totalIssuesClosed: 0,
    totalMrsCreated: 0,
    totalMrsMerged: 0,
    totalCommits: 0,
    totalComments: 0,
  };

  for (const activity of activities) {
    switch (activity.activityType) {
      case "issue_created":
        summary.totalIssuesCreated++;
        break;
      case "issue_closed":
        summary.totalIssuesClosed++;
        break;
      case "mr_created":
        summary.totalMrsCreated++;
        break;
      case "mr_merged":
        summary.totalMrsMerged++;
        break;
      case "commit":
        summary.totalCommits++;
        break;
      case "issue_comment":
      case "mr_comment":
        summary.totalComments++;
        break;
    }
  }

  return {
    summary,
    users,
    weeklyActivity,
  };
}

export function filterActivities(
  activities: UserActivity[],
  filters: {
    projectId?: number;
    username?: string;
    activityType?: string;
    fromDate?: string;
    toDate?: string;
  }
): UserActivity[] {
  return activities.filter((activity) => {
    if (filters.projectId && activity.projectId !== filters.projectId) {
      return false;
    }

    if (filters.username && activity.userUsername !== filters.username) {
      return false;
    }

    if (filters.activityType && activity.activityType !== filters.activityType) {
      return false;
    }

    if (filters.fromDate) {
      const fromDate = new Date(filters.fromDate);
      const activityDate = typeof activity.occurredAt === 'string' 
        ? new Date(activity.occurredAt) 
        : activity.occurredAt;
      if (activityDate < fromDate) {
        return false;
      }
    }

    if (filters.toDate) {
      const toDate = new Date(filters.toDate);
      toDate.setHours(23, 59, 59, 999); // End of day
      const activityDate = typeof activity.occurredAt === 'string' 
        ? new Date(activity.occurredAt) 
        : activity.occurredAt;
      if (activityDate > toDate) {
        return false;
      }
    }

    return true;
  });
}

export function calculateUserInsights(issues: IssueAnalyticsRecord[]): UserInsight[] {
  const userMap = new Map<string, UserInsight & { _collaborators: Set<string> }>();

  for (const issue of issues) {
    const authorKey = issue.authorUsername;

    // Initialize author insight if not exists
    if (!userMap.has(authorKey)) {
      userMap.set(authorKey, {
        username: issue.authorUsername,
        name: issue.authorName,
        issuesCreated: 0,
        issuesClosed: 0,
        issuesOpen: 0,
        avgTimeToClose: null,
        avgTimeToFirstResponse: null,
        labelBreakdown: {},
        issuesCommentedOn: 0,
        uniqueCollaborators: 0,
        respondedToOthers: 0,
        receivedResponses: 0,
        _collaborators: new Set(),
      });
    }

    const authorInsight = userMap.get(authorKey)!;
    authorInsight.issuesCreated++;

    if (issue.state === "closed") {
      authorInsight.issuesClosed++;
    } else {
      authorInsight.issuesOpen++;
    }

    // Track time to close
    if (issue.timeToCloseHours !== null) {
      if (authorInsight.avgTimeToClose === null) {
        authorInsight.avgTimeToClose = issue.timeToCloseHours;
      } else {
        // Running average
        authorInsight.avgTimeToClose = Math.round(
          (authorInsight.avgTimeToClose + issue.timeToCloseHours) / 2
        );
      }
    }

    // Track time to first response
    if (issue.timeToFirstResponseHours !== null) {
      if (authorInsight.avgTimeToFirstResponse === null) {
        authorInsight.avgTimeToFirstResponse = issue.timeToFirstResponseHours;
      } else {
        authorInsight.avgTimeToFirstResponse = Math.round(
          (authorInsight.avgTimeToFirstResponse + issue.timeToFirstResponseHours) / 2
        );
      }
    }

    // Track label breakdown
    if (issue.labels) {
      const labels = issue.labels.split(",").filter((l) => l.trim());
      for (const label of labels) {
        const trimmedLabel = label.trim();
        authorInsight.labelBreakdown[trimmedLabel] =
          (authorInsight.labelBreakdown[trimmedLabel] || 0) + 1;
      }
    }

    // Track collaboration
    if (issue.uniqueCommenters) {
      const commenters = issue.uniqueCommenters.split(",").filter((c) => c.trim());
      for (const commenter of commenters) {
        const trimmedCommenter = commenter.trim();
        if (trimmedCommenter !== authorKey) {
          // Someone else commented on this user's issue
          authorInsight.receivedResponses++;
          authorInsight._collaborators.add(trimmedCommenter);

          // Track that the commenter responded to someone else's issue
          if (!userMap.has(trimmedCommenter)) {
            userMap.set(trimmedCommenter, {
              username: trimmedCommenter,
              name: trimmedCommenter,
              issuesCreated: 0,
              issuesClosed: 0,
              issuesOpen: 0,
              avgTimeToClose: null,
              avgTimeToFirstResponse: null,
              labelBreakdown: {},
              issuesCommentedOn: 0,
              uniqueCollaborators: 0,
              respondedToOthers: 0,
              receivedResponses: 0,
              _collaborators: new Set(),
            });
          }
          const commenterInsight = userMap.get(trimmedCommenter)!;
          commenterInsight.respondedToOthers++;
          commenterInsight._collaborators.add(authorKey);
        }
      }
    }
  }

  // Convert Sets to counts for serialization
  return Array.from(userMap.values()).map((insight) => ({
    username: insight.username,
    name: insight.name,
    issuesCreated: insight.issuesCreated,
    issuesClosed: insight.issuesClosed,
    issuesOpen: insight.issuesOpen,
    avgTimeToClose: insight.avgTimeToClose,
    avgTimeToFirstResponse: insight.avgTimeToFirstResponse,
    labelBreakdown: insight.labelBreakdown,
    issuesCommentedOn: insight.respondedToOthers,
    uniqueCollaborators: insight._collaborators.size,
    respondedToOthers: insight.respondedToOthers,
    receivedResponses: insight.receivedResponses,
  }));
}
