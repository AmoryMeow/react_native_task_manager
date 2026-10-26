import type { Task } from "@/entities/task/model/types";

type RandomSource = () => number;

export type TaskDuelPair = readonly [Task, Task];

function getPairIndex(
  taskCount: number,
  firstTaskIndex: number,
  secondTaskIndex: number,
): number {
  let pairIndex = 0;

  for (let index = 0; index < firstTaskIndex; index += 1) {
    pairIndex += taskCount - index - 1;
  }

  return pairIndex + secondTaskIndex - firstTaskIndex - 1;
}

function getPairAtIndex(
  tasks: readonly Task[],
  targetPairIndex: number,
): TaskDuelPair | null {
  let remainingPairIndex = targetPairIndex;

  for (let firstIndex = 0; firstIndex < tasks.length - 1; firstIndex += 1) {
    const pairsForTask = tasks.length - firstIndex - 1;

    if (remainingPairIndex < pairsForTask) {
      return [tasks[firstIndex], tasks[firstIndex + remainingPairIndex + 1]];
    }

    remainingPairIndex -= pairsForTask;
  }

  return null;
}

export function selectTaskDuelPair(
  eligibleTasks: readonly Task[],
  previousTaskIds?: readonly [string, string],
  random: RandomSource = Math.random,
): TaskDuelPair | null {
  if (eligibleTasks.length < 2) return null;

  const pairCount = (eligibleTasks.length * (eligibleTasks.length - 1)) / 2;
  let previousPairIndex: number | null = null;

  if (previousTaskIds && pairCount > 1) {
    const previousIndexes = previousTaskIds
      .map((taskId) => eligibleTasks.findIndex((task) => task.id === taskId))
      .sort((firstIndex, secondIndex) => firstIndex - secondIndex);

    if (
      previousIndexes[0] >= 0 &&
      previousIndexes[1] >= 0 &&
      previousIndexes[0] !== previousIndexes[1]
    ) {
      previousPairIndex = getPairIndex(
        eligibleTasks.length,
        previousIndexes[0],
        previousIndexes[1],
      );
    }
  }

  const availablePairCount = pairCount - (previousPairIndex === null ? 0 : 1);
  const normalizedRandom = Math.min(Math.max(random(), 0), 1 - Number.EPSILON);
  let selectedPairIndex = Math.floor(normalizedRandom * availablePairCount);

  if (
    previousPairIndex !== null &&
    selectedPairIndex >= previousPairIndex
  ) {
    selectedPairIndex += 1;
  }

  return getPairAtIndex(eligibleTasks, selectedPairIndex);
}
