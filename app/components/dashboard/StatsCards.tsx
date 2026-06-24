"use client";

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Project, SyncLog } from "@/app/types";

interface StatsCardsProps {
  projects: Project[];
  logs: SyncLog[];
}

export function StatsCards({ projects, logs }: StatsCardsProps) {
  const successCount = logs.filter((l) => l.status === "success").length;
  const errorCount = logs.filter((l) => l.status === "error").length;
  const skipCount = logs.filter((l) => l.status === "skipped").length;

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <Card>
        <CardHeader className="pb-2">
          <CardDescription>Projects</CardDescription>
          <CardTitle className="text-3xl">{projects.length}</CardTitle>
        </CardHeader>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardDescription>Successful Syncs</CardDescription>
          <CardTitle className="text-3xl text-green-600">{successCount}</CardTitle>
        </CardHeader>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardDescription>Failed Syncs</CardDescription>
          <CardTitle className="text-3xl text-red-600">{errorCount}</CardTitle>
        </CardHeader>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardDescription>Skipped</CardDescription>
          <CardTitle className="text-3xl text-yellow-600">{skipCount}</CardTitle>
        </CardHeader>
      </Card>
    </div>
  );
}
