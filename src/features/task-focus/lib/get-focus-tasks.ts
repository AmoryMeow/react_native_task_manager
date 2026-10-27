import { groupTasks } from "@/entities/task/lib/group-tasks";
import type { Task } from "@/entities/task/model/types";

export function getFocusTasks(
  tasks: readonly Task[],
  currentDate: Date,
  query = "",
): Task[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();

  return groupTasks(tasks, currentDate)
    .filter((group) => group.id !== "completed")
    .flatMap((group) => group.data)
    .filter(
      (task) =>
        task.status === "todo" &&
        (normalizedQuery.length === 0 ||
          task.title.toLocaleLowerCase().includes(normalizedQuery)),
    );
}
