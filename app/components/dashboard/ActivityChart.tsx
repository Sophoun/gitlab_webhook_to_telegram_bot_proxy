"use client";

import { WeeklyActivity } from "@/app/types";

interface ActivityChartProps {
  data: WeeklyActivity[];
}

export function ActivityChart({ data }: ActivityChartProps) {
  if (data.length === 0) {
    return (
      <p className="text-muted-foreground text-center py-8">
        No activity data available. Sync your projects to see trends.
      </p>
    );
  }

  // Calculate max values for scaling
  const maxValue = Math.max(
    ...data.map((d) =>
      Math.max(d.issuesCreated, d.issuesClosed, d.mrsCreated, d.mrsMerged, d.commits, d.comments)
    )
  );

  // Show last 12 weeks
  const displayData = data.slice(-12);

  return (
    <div className="space-y-4">
      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-blue-500 rounded" />
          <span>Issues Created</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-green-500 rounded" />
          <span>Issues Closed</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-purple-500 rounded" />
          <span>MRs Created</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-orange-500 rounded" />
          <span>MRs Merged</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-cyan-500 rounded" />
          <span>Commits</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-pink-500 rounded" />
          <span>Comments</span>
        </div>
      </div>

      {/* Chart */}
      <div className="relative h-64 border rounded-lg p-4 bg-muted/20">
        <div className="absolute inset-0 flex items-end justify-between px-4 pb-4">
          {displayData.map((week) => {
            const barHeight = (value: number) =>
              maxValue > 0 ? (value / maxValue) * 100 : 0;

            return (
              <div
                key={week.week}
                className="flex flex-col items-center gap-1"
                title={`Week of ${week.week}`}
              >
                {/* Stacked bars */}
                <div className="flex gap-0.5 items-end h-48">
                  <div
                    className="w-2 bg-blue-500 rounded-t"
                    style={{ height: `${barHeight(week.issuesCreated)}%` }}
                    title={`Issues Created: ${week.issuesCreated}`}
                  />
                  <div
                    className="w-2 bg-green-500 rounded-t"
                    style={{ height: `${barHeight(week.issuesClosed)}%` }}
                    title={`Issues Closed: ${week.issuesClosed}`}
                  />
                  <div
                    className="w-2 bg-purple-500 rounded-t"
                    style={{ height: `${barHeight(week.mrsCreated)}%` }}
                    title={`MRs Created: ${week.mrsCreated}`}
                  />
                  <div
                    className="w-2 bg-orange-500 rounded-t"
                    style={{ height: `${barHeight(week.mrsMerged)}%` }}
                    title={`MRs Merged: ${week.mrsMerged}`}
                  />
                  <div
                    className="w-2 bg-cyan-500 rounded-t"
                    style={{ height: `${barHeight(week.commits)}%` }}
                    title={`Commits: ${week.commits}`}
                  />
                  <div
                    className="w-2 bg-pink-500 rounded-t"
                    style={{ height: `${barHeight(week.comments)}%` }}
                    title={`Comments: ${week.comments}`}
                  />
                </div>

                {/* Week label */}
                <div className="text-xs text-muted-foreground rotate-45 origin-left">
                  {new Date(week.week).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
