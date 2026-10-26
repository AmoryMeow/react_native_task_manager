import {
  groupTasks,
  type TaskGroupId,
} from "@/entities/task/lib/group-tasks";
import type { Task } from "@/entities/task/model/types";

type RandomSource = () => number;
export type RouletteTaskGroupId = Exclude<TaskGroupId, "completed">;

export const DEFAULT_ROULETTE_GROUPS: readonly RouletteTaskGroupId[] = [
  "earlier",
  "today",
];

export function getEligibleRouletteTasks(
  tasks: readonly Task[],
  currentDate: Date,
  selectedGroups: readonly RouletteTaskGroupId[] = DEFAULT_ROULETTE_GROUPS,
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

export function selectRouletteTask(
  tasks: readonly Task[],
  currentDate: Date,
  selectedGroups: readonly RouletteTaskGroupId[] = DEFAULT_ROULETTE_GROUPS,
  previousTaskId?: string,
  random: RandomSource = Math.random,
): Task | null {
  const eligibleTasks = getEligibleRouletteTasks(
    tasks,
    currentDate,
    selectedGroups,
  );

  if (eligibleTasks.length === 0) {
    return null;
  }

  if (eligibleTasks.length === 1) {
    return eligibleTasks[0];
  }

  const selectableTasks = previousTaskId
    ? eligibleTasks.filter((task) => task.id !== previousTaskId)
    : eligibleTasks;
  const randomIndex = Math.floor(random() * selectableTasks.length);

  return selectableTasks[randomIndex] ?? null;
}
