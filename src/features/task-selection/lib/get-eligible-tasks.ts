import {
  groupTasks,
  type TaskGroupId,
} from "@/entities/task/lib/group-tasks";
import type { Task } from "@/entities/task/model/types";

export type TaskSelectionGroupId = Exclude<TaskGroupId, "completed">;

export const DEFAULT_TASK_SELECTION_GROUPS: readonly TaskSelectionGroupId[] = [
  "earlier",
  "today",
];

export function getEligibleTasks(
  tasks: readonly Task[],
  currentDate: Date,
  selectedGroups: readonly TaskSelectionGroupId[] =
    DEFAULT_TASK_SELECTION_GROUPS,
): Task[] {
  const selectedGroupIds = new Set(selectedGroups);

  return groupTasks(tasks, currentDate)
    .filter(
      (group) =>
        group.id !== "completed" && selectedGroupIds.has(group.id),
    )
    .flatMap((group) => group.data)
    .filter((task) => task.status === "todo");
}
