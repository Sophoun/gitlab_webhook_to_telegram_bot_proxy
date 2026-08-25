import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface PerformanceStatsProps {
  stats: {
    totalIssuesCreated: number;
    totalIssuesClosed: number;
    totalMrsCreated: number;
    totalMrsMerged: number;
    totalCommits: number;
    totalComments: number;
  };
}

export function StatsCards({ stats }: PerformanceStatsProps) {
  const cards = [
    {
      title: "Issues Created",
      value: stats.totalIssuesCreated,
      description: "Total issues created",
    },
    {
      title: "Issues Closed",
      value: stats.totalIssuesClosed,
      description: "Total issues resolved",
    },
    {
      title: "MRs Created",
      value: stats.totalMrsCreated,
      description: "Total merge requests",
    },
    {
      title: "MRs Merged",
      value: stats.totalMrsMerged,
      description: "Total merges completed",
    },
    {
      title: "Commits",
      value: stats.totalCommits,
      description: "Total commits pushed",
    },
    {
      title: "Comments",
      value: stats.totalComments,
      description: "Total comments made",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {cards.map((card) => (
        <Card key={card.title}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{card.value.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">{card.description}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
