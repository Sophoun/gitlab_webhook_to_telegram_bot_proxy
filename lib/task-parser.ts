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
