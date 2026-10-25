import { toLocalDateString } from "@/entities/task/lib/format-task-schedule";
import type { Task } from "@/entities/task/model/types";

type RandomSource = () => number;

export function getEligibleRouletteTasks(
  tasks: readonly Task[],
  currentDate: Date,
): Task[] {
  const currentLocalDate = toLocalDateString(currentDate);

  return tasks.filter(
    (task) =>
      task.status === "todo" &&
      task.schedule.type === "date" &&
      task.schedule.date <= currentLocalDate,
  );
}

export function selectRouletteTask(
  tasks: readonly Task[],
  currentDate: Date,
  previousTaskId?: string,
  random: RandomSource = Math.random,
): Task | null {
  const eligibleTasks = getEligibleRouletteTasks(tasks, currentDate);

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
