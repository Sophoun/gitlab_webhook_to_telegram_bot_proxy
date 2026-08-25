/**
 * Cross-project issue references written in descriptions, e.g.:
 *   backend/api-service#42
 *   group/subgroup/android-app#7
 * GitLab renders these as cross-project links. Plain `#123` (same-project
 * refs) are intentionally NOT matched — they are not cross-project.
 */
const CROSS_PROJECT_REF_RE = /([a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)+)#(\d+)\b/g;

export interface CrossProjectRef {
  /** Project path without the trailing #iid, e.g. "backend/api-service" */
  path: string;
  iid: number;
}

/**
 * Extract unique cross-project issue references from a text body
 * (description or comment). Later duplicates of the same path+iid are
 * dropped; order follows first appearance.
 */
export function parseCrossProjectRefs(body: string | null | undefined): CrossProjectRef[] {
  if (!body) return [];

  const seen = new Set<string>();
  const refs: CrossProjectRef[] = [];
  for (const match of body.matchAll(CROSS_PROJECT_REF_RE)) {
    const path = match[1];
    const iid = parseInt(match[2], 10);
    const key = `${path}#${iid}`;
    if (seen.has(key) || Number.isNaN(iid)) continue;
    seen.add(key);
    refs.push({ path, iid });
  }
  return refs;
}
