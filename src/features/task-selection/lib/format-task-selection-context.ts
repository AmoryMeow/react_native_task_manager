import { toLocalDateString } from "@/entities/task/lib/format-task-schedule";
import type { Task } from "@/entities/task/model/types";

export function formatTaskSelectionContext(
  task: Task,
  currentDate: Date,
): string {
  if (task.schedule.type === "inbox") return "Inbox";
  if (task.schedule.type === "soon") return "Soon";
  if (task.schedule.type === "someday") return "Someday";

  const currentLocalDate = toLocalDateString(currentDate);

  if (task.schedule.date === currentLocalDate) return "Today";

  const [year, month, day] = task.schedule.date.split("-").map(Number);
  const scheduledDate = new Date(year, month - 1, day);
  const formattedDate = scheduledDate.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    ...(year !== currentDate.getFullYear() ? { year: "numeric" } : {}),
  });
  const groupLabel =
    task.schedule.date < currentLocalDate ? "Earlier" : "Upcoming";

  return `${groupLabel} · ${formattedDate}`;
}
