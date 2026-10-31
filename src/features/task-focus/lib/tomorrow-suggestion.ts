import { toLocalDateString } from "@/entities/task/lib/format-task-schedule";
import type { Task, TaskSchedule } from "@/entities/task/model/types";

export type TomorrowSuggestion = "today" | "overdue";

export function getTomorrowSuggestion(
  task: Task,
  now: Date,
): TomorrowSuggestion | null {
  if (task.status === "done" || task.schedule.type !== "date") return null;

  const today = toLocalDateString(now);

  if (task.schedule.date === today) return "today";
  if (task.schedule.date < today) return "overdue";

  return null;
}

export function shouldSuggestTomorrow(task: Task, now: Date): boolean {
  return getTomorrowSuggestion(task, now) !== null;
}

/** Tomorrow's local calendar date; built from local parts, never via UTC. */
export function getTomorrowSchedule(now: Date): TaskSchedule {
  const tomorrow = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
  );

  return { type: "date", date: toLocalDateString(tomorrow) };
}

export type EndFocusChoice = "move-to-tomorrow" | "keep";

export type EndFocusResult =
  { status: "exit" } | { status: "failed"; error: unknown };

export async function applyEndFocusChoice({
  choice,
  task,
  now,
  updateSchedule,
}: {
  choice: EndFocusChoice;
  task: Task;
  now: Date;
  updateSchedule: (taskId: string, schedule: TaskSchedule) => Promise<Task>;
}): Promise<EndFocusResult> {
  // Re-check at tap time: the task may have been completed or rescheduled
  // elsewhere since the prompt appeared.
  if (choice === "keep" || !shouldSuggestTomorrow(task, now)) {
    return { status: "exit" };
  }

  try {
    await updateSchedule(task.id, getTomorrowSchedule(now));
    return { status: "exit" };
  } catch (error) {
    return { status: "failed", error };
  }
}
