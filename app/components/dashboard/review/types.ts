export interface ReviewIssue {
  id: number;
  projectId: number;
  projectName: string | null;
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
  // Kanban workflow mapping
  boardStage: string;
  priority: string | null;
  team: string | null;
  type: string | null;
}

// The team's Kanban workflow, in board order
export const WORKFLOW_STAGES = [
  "Backlog",
  "Refinement",
  "Ready for Dev",
  "In Progress",
  "Peer Review",
  "Testing/QA",
  "Completed",
  "Done",
] as const;

export const WIP_LIMIT = 2;

const TEAM_LABELS = ["Business", "Android", "iOS", "Backend", "DevOps"];
const TYPE_LABELS = ["Feature", "Bug", "Tech Debt", "Research", "Enhancement"];

/**
 * Map GitLab labels + state onto the team's Kanban board.
 * Checks from the most advanced stage backwards so an issue carrying
 * both "In Progress" and "Status::To Do" resolves to In Progress.
 */
export function parseBoardLabels(
  labels: string | null,
  state: string
): {
  boardStage: string;
  priority: string | null;
  team: string | null;
  type: string | null;
} {
  const tokens = (labels || "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const lowerTokens = tokens.map((t) => t.toLowerCase());
  const has = (needle: string) => lowerTokens.some((l) => l.includes(needle));

  let boardStage: string;
  if (state === "closed") boardStage = "Done";
  else if (has("peer review")) boardStage = "Peer Review";
  else if (has("testing")) boardStage = "Testing/QA";
  else if (has("completed") || has("integrated")) boardStage = "Completed";
  else if (has("in progress")) boardStage = "In Progress";
  else if (has("ready for dev")) boardStage = "Ready for Dev";
  else if (has("refinement")) boardStage = "Refinement";
  else if (has("backlog") || has("to do")) boardStage = "Backlog";
  else boardStage = "No Stage";

  const prioToken = tokens.find((t) => /^p[0-3]\b/i.test(t));
  const priority = prioToken ? prioToken.slice(0, 2).toUpperCase() : null;

  const team =
    tokens.find((t) => TEAM_LABELS.some((x) => x.toLowerCase() === t.toLowerCase())) ??
    null;
  const type =
    tokens.find((t) => TYPE_LABELS.some((x) => x.toLowerCase() === t.toLowerCase())) ??
    null;

  return { boardStage, priority, team, type };
}

export interface ReviewKpis {
  totalIssues: number;
  openIssues: number;
  closedIssues: number;
  closeRate: number;
  avgCycleTime: number | null;
  avgFirstResponse: number | null;
  totalComments: number;
  currentSprintCompleted: number;
  previousSprintCompleted: number;
  avgPerSprint: number;
  staleOpenIssues: number;
}

export interface SprintPoint {
  sprintStart: string;
  sprintEnd: string;
  issuesCompleted: number;
  avgCycleTime: number | null;
}

export interface Bucket {
  bucket: string;
  count: number;
  percentage: number;
}

export interface WeekPoint {
  week: string;
  issuesCompleted: number;
}

export interface AgedBucket {
  ageBucket: string;
  count: number;
  issues: string;
}

export interface PersonStat {
  username: string;
  name: string;
  totalIssues: number;
  issuesClosed: number;
  issuesOpen: number;
  avgCycleTime: number | null;
  avgFirstResponse: number | null;
  totalComments: number;
  closeRate: number;
  oldestOpenAge: number;
  wipCount: number; // issues currently "In Progress" (WIP limit check)
}

export interface ActivityItem {
  id: number;
  projectName: string;
  userName: string;
  userUsername: string;
  activityType: string;
  itemIid: number;
  itemTitle: string | null;
  itemUrl: string | null;
  occurredAt: string;
}

export interface ReviewFacets {
  projects: Array<{ id: number; name: string }>;
  authors: Array<{ username: string; name: string }>;
}

export interface ReviewData {
  kpis: ReviewKpis;
  issues: ReviewIssue[];
  sprintVelocity: SprintPoint[];
  cycleTimeDistribution: Bucket[];
  boardDistribution: Array<{ stage: string; count: number }>;
  priorityBreakdown: Array<{ priority: string; openCount: number }>;
  teamBreakdown: Array<{ team: string; openCount: number }>;
  throughputTrend: WeekPoint[];
  agedIssues: AgedBucket[];
  people: PersonStat[];
  activity: ActivityItem[];
  facets: ReviewFacets;
  generatedAt: string;
}

export const CYCLE_BUCKETS = [
  { label: "< 1 day", max: 24 },
  { label: "1-3 days", max: 72 },
  { label: "3-7 days", max: 168 },
  { label: "1-2 weeks", max: 336 },
  { label: "2-4 weeks", max: 720 },
  { label: "1+ month", max: Infinity },
] as const;

export const AGE_BUCKETS = CYCLE_BUCKETS;

export function bucketFor(hours: number): string {
  for (const b of CYCLE_BUCKETS) {
    if (hours < b.max) return b.label;
  }
  return "1+ month";
}
