"use client";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SyncLog } from "@/app/types";

interface ActivityLogProps {
  logs: SyncLog[];
}

export function ActivityLog({ logs }: ActivityLogProps) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Time</TableHead>
            <TableHead>Event</TableHead>
            <TableHead>Master IID</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Message</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.map((log) => (
            <TableRow key={log.id}>
              <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                {new Date(log.createdAt).toLocaleString()}
              </TableCell>
              <TableCell className="text-sm">{log.eventType || "-"}</TableCell>
              <TableCell className="text-sm font-mono">
                {log.masterIid || "-"}
              </TableCell>
              <TableCell>
                <Badge
                  variant={
                    log.status === "success"
                      ? "default"
                      : log.status === "error"
                      ? "destructive"
                      : "secondary"
                  }
                >
                  {log.status}
                </Badge>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground max-w-md truncate">
                {log.message || "-"}
              </TableCell>
            </TableRow>
          ))}
          {logs.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={5}
                className="text-center text-muted-foreground py-8"
              >
                No activity yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
