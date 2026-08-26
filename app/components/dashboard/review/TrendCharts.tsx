"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface WeekPoint {
  weekStart: string;
  issuesCreated: number;
  issuesClosed: number;
  mrsMerged: number;
  commits: number;
}

interface PersonTrend {
  username: string;
  name: string;
  commits: number[];
  mrsMerged: number[];
}

interface TrendChartsProps {
  repoParam: string | null;
}

const WEEKS = 12;

function weekLabel(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * Long-range trend charts for the team: weekly delivery throughput and
 * per-person commit/MR mini-bars. Hand-rolled CSS bars — no chart library.
 */
export function TrendCharts({ repoParam }: TrendChartsProps) {
  const [weeks, setWeeks] = useState<WeekPoint[]>([]);
  const [people, setPeople] = useState<PersonTrend[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTrends = useCallback(async () => {
    try {
      const repoQs = repoParam ? `&repo=${repoParam}` : "";
      const res = await fetch(`/api/tracker/trends?weeks=${WEEKS}${repoQs}`);
      const data = await res.json();
      setWeeks(data.error ? [] : data.weeks || []);
      setPeople(data.error ? [] : data.people || []);
    } catch (error) {
      console.error("Failed to fetch trends:", error);
      setWeeks([]);
      setPeople([]);
    } finally {
      setLoading(false);
    }
  }, [repoParam]);

  useEffect(() => {
    fetchTrends();
  }, [fetchTrends]);

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Loading trends…
        </CardContent>
      </Card>
    );
  }

  const maxWeekly = Math.max(1, ...weeks.map((w) => Math.max(w.commits, w.mrsMerged, w.issuesClosed)));
  const topPeople = people.filter((p) => p.commits.some((c) => c > 0) || p.mrsMerged.some((m) => m > 0)).slice(0, 10);
  const maxPerson = Math.max(1, ...topPeople.flatMap((p) => [...p.commits, ...p.mrsMerged]));

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      {/* Weekly throughput */}
      <Card>
        <CardHeader>
          <CardTitle>Weekly Throughput</CardTitle>
          <CardDescription>Last {weeks.length} weeks · commits, merged MRs, closed issues</CardDescription>
        </CardHeader>
        <CardContent>
          {weeks.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No activity recorded yet.</p>
          ) : (
            <>
              <div className="flex items-end gap-1.5 h-40">
                {weeks.map((w) => (
                  <div key={w.weekStart} className="flex-1 flex flex-col items-center gap-1 group">
                    <div className="w-full flex items-end justify-center gap-0.5 h-32">
                      <div
                        className="w-1/3 bg-emerald-500 rounded-t min-h-[2px]"
                        style={{ height: `${(w.commits / maxWeekly) * 100}%` }}
                        title={`${w.commits} commits`}
                      />
                      <div
                        className="w-1/3 bg-teal-600 rounded-t min-h-[2px]"
                        style={{ height: `${(w.mrsMerged / maxWeekly) * 100}%` }}
                        title={`${w.mrsMerged} MRs merged`}
                      />
                      <div
                        className="w-1/3 bg-green-600 rounded-t min-h-[2px]"
                        style={{ height: `${(w.issuesClosed / maxWeekly) * 100}%` }}
                        title={`${w.issuesClosed} issues closed`}
                      />
                    </div>
                    <span className="text-[9px] text-muted-foreground rotate-45 origin-top-left mt-1 whitespace-nowrap">
                      {weekLabel(w.weekStart)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-4 text-xs mt-4">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 bg-emerald-500 rounded" /> Commits
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 bg-teal-600 rounded" /> MRs Merged
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 bg-green-600 rounded" /> Issues Closed
                </span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Per-person trend */}
      <Card>
        <CardHeader>
          <CardTitle>Who Ships Every Week</CardTitle>
          <CardDescription>
            Commits (green) and merged MRs (teal) per person · last {weeks.length} weeks
          </CardDescription>
        </CardHeader>
        <CardContent>
          {topPeople.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No coding activity recorded yet.</p>
          ) : (
            <div className="space-y-2.5">
              {topPeople.map((p) => (
                <div key={p.username} className="flex items-center gap-3">
                  <div className="w-28 shrink-0 min-w-0">
                    <div className="text-sm font-medium truncate">{p.name}</div>
                    <div className="text-[10px] text-muted-foreground truncate">@{p.username}</div>
                  </div>
                  <div className="flex-1 flex items-end gap-1 h-8">
                    {p.commits.map((c, i) => {
                      const m = p.mrsMerged[i];
                      const total = c + m;
                      return (
                        <div
                          key={i}
                          className="flex-1 flex flex-col justify-end min-h-[2px] group relative"
                          title={`Week of ${weeks[i] ? weekLabel(weeks[i].weekStart) : ""}: ${c} commits, ${m} MRs merged`}
                        >
                          {m > 0 && (
                            <div
                              className="w-full bg-teal-600"
                              style={{ height: `${(m / maxPerson) * 100}%` }}
                            />
                          )}
                          {c > 0 && (
                            <div
                              className="w-full bg-emerald-500"
                              style={{ height: `${(c / maxPerson) * 100}%` }}
                            />
                          )}
                          {total === 0 && <div className="w-full h-0.5 bg-muted" />}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
