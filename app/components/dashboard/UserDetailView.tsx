"use client";

import { UserStats, UserInsight } from "@/app/types";

interface UserDetailViewProps {
  user: UserStats;
  insight?: UserInsight;
}

export function UserDetailView({ user, insight }: UserDetailViewProps) {
  const metrics = [
    {
      category: "Issues",
      items: [
        { label: "Created", value: user.issuesCreated, color: "text-blue-500" },
        { label: "Closed", value: user.issuesClosed, color: "text-green-500" },
        { label: "Reopened", value: user.issuesReopened, color: "text-yellow-500" },
        { label: "Comments", value: user.issueComments, color: "text-gray-500" },
      ],
    },
    {
      category: "Merge Requests",
      items: [
        { label: "Created", value: user.mrsCreated, color: "text-purple-500" },
        { label: "Merged", value: user.mrsMerged, color: "text-orange-500" },
        { label: "Closed", value: user.mrsClosed, color: "text-red-500" },
        { label: "Comments", value: user.mrComments, color: "text-gray-500" },
      ],
    },
    {
      category: "Commits",
      items: [
        { label: "Total", value: user.commits, color: "text-cyan-500" },
      ],
    },
  ];

  // Get top labels from insight
  const topLabels = insight?.labelBreakdown
    ? Object.entries(insight.labelBreakdown)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
    : [];

  return (
    <div className="space-y-6">
      {/* User Header */}
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
          <span className="text-2xl font-bold text-primary">
            {user.name.charAt(0).toUpperCase()}
          </span>
        </div>
        <div>
          <h3 className="text-xl font-bold">{user.name}</h3>
          <p className="text-muted-foreground">@{user.username}</p>
        </div>
        <div className="ml-auto text-right">
          <div className="text-3xl font-bold">{user.score.toLocaleString()}</div>
          <div className="text-sm text-muted-foreground">Total Score</div>
        </div>
      </div>

      {/* Time Metrics (from insights) */}
      {insight && (
        <div className="p-4 rounded-lg bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/20">
          <h4 className="font-semibold mb-3">⏱️ Time Performance</h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-muted-foreground">Avg Time to Close</div>
              <div className="text-xl font-bold">
                {insight.avgTimeToClose !== null
                  ? formatHours(insight.avgTimeToClose)
                  : "N/A"}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Avg First Response</div>
              <div className="text-xl font-bold">
                {insight.avgTimeToFirstResponse !== null
                  ? formatHours(insight.avgTimeToFirstResponse)
                  : "N/A"}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Metrics */}
      {metrics.map((category) => (
        <div key={category.category}>
          <h4 className="font-semibold mb-3 text-muted-foreground">{category.category}</h4>
          <div className="grid grid-cols-2 gap-3">
            {category.items.map((item) => (
              <div
                key={item.label}
                className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
              >
                <span className="text-sm">{item.label}</span>
                <span className={`font-bold ${item.color}`}>
                  {item.value.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Collaboration (from insights) */}
      {insight && (
        <div>
          <h4 className="font-semibold mb-3 text-muted-foreground">🤝 Collaboration</h4>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <span className="text-sm">Issues Reviewed</span>
              <span className="font-bold text-indigo-500">
                {insight.respondedToOthers}
              </span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <span className="text-sm">Collaborators</span>
              <span className="font-bold text-pink-500">
                {insight.uniqueCollaborators}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Work Type Breakdown (from insights) */}
      {insight && topLabels.length > 0 && (
        <div>
          <h4 className="font-semibold mb-3 text-muted-foreground">🏷️ Work Types (by Label)</h4>
          <div className="space-y-2">
            {topLabels.map(([label, count]) => {
              const percentage = insight.issuesCreated > 0
                ? Math.round((count / insight.issuesCreated) * 100)
                : 0;
              return (
                <div key={label} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span>{label}</span>
                    <span className="text-muted-foreground">
                      {count} ({percentage}%)
                    </span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Score Breakdown */}
      <div className="p-4 rounded-lg bg-primary/5 border border-primary/10">
        <h4 className="font-semibold mb-3">Score Formula</h4>
        <div className="text-sm text-muted-foreground space-y-1">
          <p>Issues Created × 1 = {user.issuesCreated}</p>
          <p>Issues Closed × 2 = {user.issuesClosed * 2}</p>
          <p>MRs Created × 2 = {user.mrsCreated * 2}</p>
          <p>MRs Merged × 3 = {user.mrsMerged * 3}</p>
          <p>Commits × 1 = {user.commits}</p>
          <p>Comments × 1 = {user.issueComments + user.mrComments}</p>
          <p className="font-bold pt-2 border-t">Total Score = {user.score}</p>
        </div>
      </div>
    </div>
  );
}

function formatHours(hours: number): string {
  if (hours < 24) {
    return `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  if (remainingHours === 0) {
    return `${days}d`;
  }
  return `${days}d ${remainingHours}h`;
}
