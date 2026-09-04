/**
 * Parse task checklist items from GitLab issue descriptions.
 *
 * Matches lines like:
 *   - [ ] Implement login flow @alice
 *   - [x] Write tests @bob
 *   * [ ] Design mockup @charlie
 *
 * Returns an array of parsed tasks with text, assignee, and completion status.
 */

interface ParsedTask {
  text: string;
  assigneeUsername: string | null;
  isCompleted: boolean;
}

const TASK_REGEX = /^[ \t]*[-*]\s*\[([ xX])\]\s+(.+)$/gm;

// Match @username at end of line (with optional trailing whitespace/punctuation)
const ASSIGNEE_REGEX = /@\w[\w.]*\s*$/;

/**
 * Extract tasks from a GitLab issue description.
 * Returns empty array if description is null/empty or has no checklist items.
 */
export function parseIssueTasks(description: string | null | undefined): ParsedTask[] {
  if (!description) return [];

  const tasks: ParsedTask[] = [];
  let match: RegExpExecArray | null;

  // Reset regex state
  TASK_REGEX.lastIndex = 0;

  while ((match = TASK_REGEX.exec(description)) !== null) {
    const isCompleted = match[1] === "x" || match[1] === "X";
    let text = match[2].trim();

    // Try to extract assignee from the end of the text
    let assigneeUsername: string | null = null;
    const assigneeMatch = text.match(ASSIGNEE_REGEX);
    if (assigneeMatch) {
      // Extract username without @
      const raw = assigneeMatch[0].trim().slice(1); // remove @
      assigneeUsername = raw.toLowerCase().replace(/[.,;:!?]+$/, ""); // strip trailing punctuation
      // Remove the @username from the task text
      text = text.slice(0, text.lastIndexOf(assigneeMatch[0])).trim();
    }

    if (text.length > 0) {
      tasks.push({ text, assigneeUsername, isCompleted });
    }
  }

  return tasks;
}

/**
 * Parse issue weight (man-hours) from a GitLab issue description.
 *
 * Matches lines like:
 *   /weight 8
 *   /weight 13
 *
 * Returns the weight as a number, or null if not found.
 * If multiple /weight commands exist, the last one wins.
 */
const WEIGHT_REGEX = /\/weight\s+(\d+)/i;

export function parseWeight(description: string | null | undefined): number | null {
  if (!description) return null;

  // Find all matches and return the last one (user can update by editing)
  let lastMatch: RegExpExecArray | null = null;
  WEIGHT_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = WEIGHT_REGEX.exec(description)) !== null) {
    lastMatch = match;
  }

  if (!lastMatch) return null;
  const weight = parseInt(lastMatch[1], 10);
  return weight > 0 ? weight : null;
}
