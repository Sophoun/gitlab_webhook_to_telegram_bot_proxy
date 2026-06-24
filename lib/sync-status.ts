export function calculateOverallStatus(subTaskStatuses: string[]): string {
  if (subTaskStatuses.length === 0) return "Status::To Do";

  const isAllDone = subTaskStatuses.every((s) => s === "integrated");
  const isAnyInProgress = subTaskStatuses.some((s) => s === "in_progress");
  const isAnyDone = subTaskStatuses.some((s) => s === "integrated");
  const isAnyTodo = subTaskStatuses.some((s) => s === "todo");

  if (isAllDone) {
    return "Status::Integrated";
  } else if (isAnyInProgress || (isAnyDone && isAnyTodo)) {
    return "Status::In Progress";
  } else {
    return "Status::To Do";
  }
}
