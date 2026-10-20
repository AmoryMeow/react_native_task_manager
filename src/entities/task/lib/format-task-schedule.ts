import type { TaskSchedule } from "../model/types";

export function toLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function formatTaskSchedule(
  schedule: TaskSchedule,
  today = new Date(),
): string {
  switch (schedule.type) {
    case "inbox":
      return "Inbox";

    case "soon":
      return "Soon";

    case "someday":
      return "Someday";

    case "date": {
      const todayString = toLocalDateString(today);

      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const tomorrowString = toLocalDateString(tomorrow);

      if (schedule.date === todayString) return "Today";
      if (schedule.date === tomorrowString) return "Tomorrow";
      if (schedule.date < todayString) return "Overdue";

      const [year, month, day] = schedule.date.split("-").map(Number);

      const date = new Date(year, month - 1, day);

      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        ...(year !== today.getFullYear() ? { year: "numeric" } : {}),
      });
    }
  }
}
