import type { Task } from "@/entities/task/model/types";
import {
  DEFAULT_TASK_SELECTION_GROUPS,
  getEligibleTasks,
  type TaskSelectionGroupId,
} from "@/features/task-selection/lib/get-eligible-tasks";

type RandomSource = () => number;
export type RouletteTaskGroupId = TaskSelectionGroupId;

export const DEFAULT_ROULETTE_GROUPS = DEFAULT_TASK_SELECTION_GROUPS;

export function getEligibleRouletteTasks(
  tasks: readonly Task[],
  currentDate: Date,
  selectedGroups: readonly RouletteTaskGroupId[] = DEFAULT_ROULETTE_GROUPS,
): Task[] {
  return getEligibleTasks(tasks, currentDate, selectedGroups);
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
