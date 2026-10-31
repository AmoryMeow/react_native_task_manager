import type { Task } from "../model/types";

export type InlineTitleSaveResult =
  | { status: "saved"; title: string }
  | { status: "unchanged" }
  | { status: "invalid" }
  | { status: "busy" }
  | { status: "failed"; error: unknown };

export interface TaskBusyTracker {
  /** Must reflect operations started synchronously, not last render's state. */
  isBusy: (taskId: string) => boolean;
  begin: (taskId: string) => void;
  end: (taskId: string) => void;
}

export const TASK_BUSY_MESSAGE =
  "This task is being updated. Please try again.";

export async function saveInlineTaskTitle({
  task,
  nextTitle,
  busyTasks,
  persistTitle,
}: {
  task: Task;
  nextTitle: string;
  busyTasks: TaskBusyTracker;
  persistTitle: (task: Task, title: string) => Promise<void>;
}): Promise<InlineTitleSaveResult> {
  const title = nextTitle.trim();

  if (!title) return { status: "invalid" };
  if (title === task.title) return { status: "unchanged" };

  // Another write (toggle, move, delete or an earlier title save) owns the
  // task. Report it instead of writing concurrently; the caller keeps the
  // draft so the save can be retried once that write finishes.
  if (busyTasks.isBusy(task.id)) return { status: "busy" };

  busyTasks.begin(task.id);

  try {
    await persistTitle(task, title);
    return { status: "saved", title };
  } catch (error) {
    return { status: "failed", error };
  } finally {
    busyTasks.end(task.id);
  }
}

export function isInlineTitleSaveSuccessful(
  result: InlineTitleSaveResult,
): boolean {
  return result.status === "saved" || result.status === "unchanged";
}

export function getInlineTitleSaveMessage(
  result: InlineTitleSaveResult,
): string | null {
  switch (result.status) {
    case "invalid":
      return "Task title cannot be empty";
    case "busy":
      return TASK_BUSY_MESSAGE;
    case "failed":
      return "Could not update task title";
    default:
      return null;
  }
}
