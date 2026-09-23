"use client";

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Project, SyncLog } from "@/app/types";
import { FolderGit2, CheckCircle2, XCircle, SkipForward } from "lucide-react";

interface StatsCardsProps {
  projects: Project[];
  logs: SyncLog[];
}

export function StatsCards({ projects, logs }: StatsCardsProps) {
  const successCount = logs.filter((l) => l.status === "success").length;
  const errorCount = logs.filter((l) => l.status === "error").length;
  const skipCount = logs.filter((l) => l.status === "skipped").length;

  const cards = [
    {
      label: "Projects",
      value: projects.length,
      icon: FolderGit2,
      color: "text-blue-600",
      bg: "bg-blue-50 dark:bg-blue-950/30",
      border: "border-blue-200 dark:border-blue-800",
    },
    {
      label: "Successful Syncs",
      value: successCount,
      icon: CheckCircle2,
      color: "text-emerald-600",
      bg: "bg-emerald-50 dark:bg-emerald-950/30",
      border: "border-emerald-200 dark:border-emerald-800",
    },
    {
      label: "Failed Syncs",
      value: errorCount,
      icon: XCircle,
      color: "text-red-600",
      bg: "bg-red-50 dark:bg-red-950/30",
      border: "border-red-200 dark:border-red-800",
    },
    {
      label: "Skipped",
      value: skipCount,
      icon: SkipForward,
      color: "text-amber-600",
      bg: "bg-amber-50 dark:bg-amber-950/30",
      border: "border-amber-200 dark:border-amber-800",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <Card key={card.label} className={`relative overflow-hidden ${card.border}`}>
          <div className={`absolute top-0 right-0 w-20 h-20 ${card.bg} rounded-bl-[3rem] -mr-4 -mt-4 opacity-60`} />
          <CardHeader className="pb-2 relative">
            <div className="flex items-center justify-between">
              <CardDescription className="font-medium">{card.label}</CardDescription>
              <card.icon className={`h-5 w-5 ${card.color}`} />
            </div>
            <CardTitle className={`text-3xl font-bold ${card.color}`}>
              {card.value}
            </CardTitle>
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}
