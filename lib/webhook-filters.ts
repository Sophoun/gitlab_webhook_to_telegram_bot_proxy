const ISSUE_EVENT_TYPES = ["Issue Hook", "Confidential Issue Hook", "Work Item Hook"];

export function getIgnoredUsers(ignoreUsersField: string | null | undefined): string[] {
  if (!ignoreUsersField) return [];
  return ignoreUsersField.split(",").map((u) => u.trim()).filter(Boolean);
}

export function isUserInIgnoreList(
  ignoreUsers: string[],
  userName: string,
  userUsername: string
): boolean {
  return ignoreUsers.includes(userName) || (userUsername !== "" && ignoreUsers.includes(userUsername));
}

export function shouldSkipDescriptionOnlyUpdate(
  eventType: string,
  skipDescriptionOnlyUpdates: boolean | null | undefined,
  body: Record<string, unknown>
): boolean {
  if (!skipDescriptionOnlyUpdates) return false;
  if (!ISSUE_EVENT_TYPES.includes(eventType)) return false;

  const attrs = body.object_attributes as Record<string, unknown> | undefined;
  if (!attrs || attrs.action !== "update") return false;

  const changes = body.changes as Record<string, unknown> | undefined;
  if (!changes) return false;

  const changedKeys = Object.keys(changes);
  if (changedKeys.length === 0) return false;

  const isOnlyDescription = changedKeys.every((k) =>
    ["description", "updated_at"].includes(k)
  );
  const includesDescription = changedKeys.some((k) => k === "description");

  return isOnlyDescription && includesDescription;
}
