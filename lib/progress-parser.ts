export type ProgressStage = "dev" | "qa";

export interface ProgressCommand {
  stage: ProgressStage;
  value: number;
}

/**
 * Matches progress commands in a comment body:
 *   /dev 60, /dev 60%, /DEV 100
 *   /test 30, /test 30%, /uat 35%
 * A comment may contain multiple commands (e.g. "/dev 80 /test 20").
 * The command must be preceded by start-of-line or whitespace so that
 * words like "develop" are not falsely matched.
 */
const COMMAND_RE = /(?:^|\s)\/(dev|test|uat)\s+(\d{1,3})(?:%|percent)?(?=\s|$)/gi;

const STAGE_BY_COMMAND: Record<string, ProgressStage> = {
  dev: "dev",
  test: "qa",
  uat: "qa",
};

/**
 * Parse all progress commands from a GitLab comment body.
 * Returns one entry per command found, in order of appearance.
 * Values outside 0-100 are rejected (skipped).
 */
export function parseProgressCommands(body: string | null | undefined): ProgressCommand[] {
  if (!body) return [];

  const results: ProgressCommand[] = [];
  for (const match of body.matchAll(COMMAND_RE)) {
    const stage = STAGE_BY_COMMAND[match[1].toLowerCase()];
    const value = parseInt(match[2], 10);
    if (!stage || Number.isNaN(value) || value < 0 || value > 100) continue;
    results.push({ stage, value });
  }
  return results;
}

/**
 * Parse the latest dev and qa progress values from a comment body.
 * Later commands win over earlier ones within the same comment.
 */
export function parseProgressUpdate(
  body: string | null | undefined
): { dev: number | null; qa: number | null } {
  let dev: number | null = null;
  let qa: number | null = null;
  for (const cmd of parseProgressCommands(body)) {
    if (cmd.stage === "dev") dev = cmd.value;
    else qa = cmd.value;
  }
  return { dev, qa };
}

// ---------------------------------------------------------------------------
// Progress velocity
// ---------------------------------------------------------------------------

export interface ProgressHistoryEntry {
  gitlabProjectId: number;
  issueIid: number;
  stage: string;
  progress: number;
  updatedBy: string;
  occurredAt: Date;
}

/**
 * Compute per-person "progress delivered" from an append-only history of
 * progress commands.
 *
 * Entries are walked in time order per (project, issue, stage); each command's
 * author is credited with the positive delta over the previous value.
 * Corrections that lower a value count as 0 (no negative credit).
 *
 * Only entries whose occurredAt falls within [from, to] are credited, but the
 * full history must be passed in so deltas are computed against prior values.
 * Entries may arrive in any order — they are sorted internally.
 */
export function computeProgressDelivered(
  entries: ProgressHistoryEntry[],
  from: Date,
  to: Date
): Map<string, { dev: number; qa: number }> {
  const sorted = [...entries].sort(
    (a, b) =>
      a.gitlabProjectId - b.gitlabProjectId ||
      a.issueIid - b.issueIid ||
      a.stage.localeCompare(b.stage) ||
      a.occurredAt.getTime() - b.occurredAt.getTime()
  );

  const lastValue = new Map<string, number>();
  const delivered = new Map<string, { dev: number; qa: number }>();

  for (const h of sorted) {
    if (h.stage !== "dev" && h.stage !== "qa") continue;
    const key = `${h.gitlabProjectId}:${h.issueIid}:${h.stage}`;
    const prev = lastValue.get(key) ?? 0;
    const delta = Math.max(0, h.progress - prev);
    lastValue.set(key, h.progress);

    if (delta > 0 && h.updatedBy && h.occurredAt >= from && h.occurredAt <= to) {
      const d = delivered.get(h.updatedBy) ?? { dev: 0, qa: 0 };
      d[h.stage] += delta;
      delivered.set(h.updatedBy, d);
    }
  }

  return delivered;
}
