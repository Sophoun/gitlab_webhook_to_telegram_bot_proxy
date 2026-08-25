"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ExternalLink, Clock, MessageSquare, Users, Calendar, GitBranch } from "lucide-react";

interface Issue {
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
  createdAt: string;
  closedAt: string | null;
  firstResponseAt: string | null;
  timeToCloseHours: number | null;
  timeToFirstResponseHours: number | null;
  commentCount: number | null;
  uniqueCommenters: string | null;
}

interface IssueDetailViewProps {
  issue: Issue;
  onBack: () => void;
}

export function IssueDetailView({ issue, onBack }: IssueDetailViewProps) {
  const formatHours = (hours: number | null): string => {
    if (hours === null) return "N/A";
    if (hours < 24) return `${Math.round(hours)} hours`;
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    return remainingHours > 0 ? `${days} days ${remainingHours} hours` : `${days} days`;
  };

  const formatDate = (date: string | null): string => {
    if (!date) return "N/A";
    return new Date(date).toLocaleString();
  };

  const getTimeSince = (date: string): string => {
    const now = new Date();
    const created = new Date(date);
    const diffMs = now.getTime() - created.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) {
      return `${diffDays} days ago`;
    }
    if (diffHours > 0) {
      return `${diffHours} hours ago`;
    }
    return "Just now";
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <Button variant="ghost" size="sm" onClick={onBack} className="mb-2">
            ← Back to Issues
          </Button>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold">
              {issue.issueTitle || `Issue #${issue.issueIid}`}
            </h2>
            {issue.issueUrl && (
              <a
                href={issue.issueUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground"
              >
                <ExternalLink className="h-5 w-5" />
              </a>
            )}
          </div>
          <div className="flex items-center gap-2 mt-2">
            <Badge variant={issue.state === "open" ? "default" : "secondary"}>
              {issue.state}
            </Badge>
            <span className="text-sm text-muted-foreground">
              #{issue.issueIid} · Project ID {issue.gitlabProjectId}
            </span>
          </div>
        </div>
      </div>

      {/* Labels */}
      {issue.labels && (
        <div className="flex flex-wrap gap-2">
          {issue.labels.split(",").map((label, i) => (
            <Badge key={i} variant="outline">
              {label.trim()}
            </Badge>
          ))}
        </div>
      )}

      {/* Metrics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-blue-500" />
              <div className="text-xl font-bold">
                {formatHours(issue.timeToFirstResponseHours)}
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-1">First Response</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-green-500" />
              <div className="text-xl font-bold">
                {formatHours(issue.timeToCloseHours)}
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Time to Close</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-purple-500" />
              <div className="text-xl font-bold">{issue.commentCount || 0}</div>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Comments</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-orange-500" />
              <div className="text-xl font-bold">
                {issue.uniqueCommenters ? issue.uniqueCommenters.split(",").length : 0}
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Collaborators</p>
          </CardContent>
        </Card>
      </div>

      {/* Timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Timeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="w-3 h-3 rounded-full bg-blue-500" />
              <div>
                <div className="font-medium">Created</div>
                <div className="text-sm text-muted-foreground">
                  {formatDate(issue.createdAt)} · {getTimeSince(issue.createdAt)}
                </div>
              </div>
            </div>

            {issue.firstResponseAt && (
              <div className="flex items-center gap-4">
                <div className="w-3 h-3 rounded-full bg-yellow-500" />
                <div>
                  <div className="font-medium">First Response</div>
                  <div className="text-sm text-muted-foreground">
                    {formatDate(issue.firstResponseAt)} ·{" "}
                    {formatHours(issue.timeToFirstResponseHours)} after creation
                  </div>
                </div>
              </div>
            )}

            {issue.closedAt && (
              <div className="flex items-center gap-4">
                <div className="w-3 h-3 rounded-full bg-green-500" />
                <div>
                  <div className="font-medium">Closed</div>
                  <div className="text-sm text-muted-foreground">
                    {formatDate(issue.closedAt)} · {formatHours(issue.timeToCloseHours)} total
                  </div>
                </div>
              </div>
            )}

            {issue.state === "open" && !issue.closedAt && (
              <div className="flex items-center gap-4">
                <div className="w-3 h-3 rounded-full bg-orange-500 animate-pulse" />
                <div>
                  <div className="font-medium">Still Open</div>
                  <div className="text-sm text-muted-foreground">
                    Open for {getTimeSince(issue.createdAt)}
                  </div>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Collaboration */}
      {issue.uniqueCommenters && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Collaboration
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div>
                <div className="text-sm font-medium mb-2">Issue Author</div>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-sm font-medium">
                      {issue.authorName.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <div className="text-sm font-medium">{issue.authorName}</div>
                    <div className="text-xs text-muted-foreground">
                      @{issue.authorUsername}
                    </div>
                  </div>
                </div>
              </div>

              <Separator />

              <div>
                <div className="text-sm font-medium mb-2">
                  Commenters ({issue.uniqueCommenters.split(",").length})
                </div>
                <div className="flex flex-wrap gap-2">
                  {issue.uniqueCommenters.split(",").map((commenter, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 px-3 py-1 rounded-full bg-muted"
                    >
                      <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="text-xs font-medium">
                          {commenter.trim().charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <span className="text-sm">@{commenter.trim()}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Performance Analysis */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5" />
            Performance Analysis
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Response Time Assessment */}
            <div>
              <div className="text-sm font-medium mb-2">Response Time</div>
              {issue.timeToFirstResponseHours !== null ? (
                <div className="flex items-center gap-2">
                  {issue.timeToFirstResponseHours <= 4 ? (
                    <Badge className="bg-green-600">Excellent</Badge>
                  ) : issue.timeToFirstResponseHours <= 24 ? (
                    <Badge className="bg-yellow-600">Good</Badge>
                  ) : issue.timeToFirstResponseHours <= 72 ? (
                    <Badge className="bg-orange-600">Slow</Badge>
                  ) : (
                    <Badge className="bg-red-600">Very Slow</Badge>
                  )}
                  <span className="text-sm text-muted-foreground">
                    {formatHours(issue.timeToFirstResponseHours)} average
                  </span>
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">No response yet</span>
              )}
            </div>

            {/* Resolution Time Assessment */}
            <div>
              <div className="text-sm font-medium mb-2">Resolution Time</div>
              {issue.timeToCloseHours !== null ? (
                <div className="flex items-center gap-2">
                  {issue.timeToCloseHours <= 24 ? (
                    <Badge className="bg-green-600">Fast</Badge>
                  ) : issue.timeToCloseHours <= 72 ? (
                    <Badge className="bg-yellow-600">Normal</Badge>
                  ) : issue.timeToCloseHours <= 168 ? (
                    <Badge className="bg-orange-600">Slow</Badge>
                  ) : (
                    <Badge className="bg-red-600">Very Slow</Badge>
                  )}
                  <span className="text-sm text-muted-foreground">
                    {formatHours(issue.timeToCloseHours)} total
                  </span>
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">Not resolved yet</span>
              )}
            </div>

            {/* Engagement Level */}
            <div>
              <div className="text-sm font-medium mb-2">Engagement Level</div>
              <div className="flex items-center gap-2">
                {(issue.commentCount || 0) >= 10 ? (
                  <Badge className="bg-purple-600">Highly Active</Badge>
                ) : (issue.commentCount || 0) >= 5 ? (
                  <Badge className="bg-blue-600">Active</Badge>
                ) : (issue.commentCount || 0) >= 1 ? (
                  <Badge className="bg-gray-600">Moderate</Badge>
                ) : (
                  <Badge className="bg-gray-400">No Activity</Badge>
                )}
                <span className="text-sm text-muted-foreground">
                  {issue.commentCount || 0} comments
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
