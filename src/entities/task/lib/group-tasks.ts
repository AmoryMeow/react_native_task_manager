import type { Task } from "../model/types";

export type TaskGroupId =
  "earlier" | "today" | "upcoming" | "soon" | "someday" | "inbox" | "completed";

export interface TaskGroup {
  id: TaskGroupId;
  title: string;
  data: Task[];
}

const alwaysVisibleGroupIds = new Set<TaskGroupId>([
  "today",
  "soon",
  "someday",
  "inbox",
]);

function toLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function groupTasks(tasks: Task[], today = new Date()): TaskGroup[] {
  const todayString = toLocalDateString(today);

  const groups: TaskGroup[] = [
    { id: "earlier", title: "Earlier", data: [] },
    { id: "today", title: "Today", data: [] },
    { id: "upcoming", title: "Upcoming", data: [] },
    { id: "soon", title: "Soon", data: [] },
    { id: "someday", title: "Someday", data: [] },
    { id: "inbox", title: "Inbox", data: [] },
    { id: "completed", title: "Completed", data: [] },
  ];

  const groupById = new Map(groups.map((group) => [group.id, group]));

  for (const task of tasks) {
    let groupId: TaskGroupId;

    if (task.status === "done") {
      groupId = "completed";
    } else {
      switch (task.schedule.type) {
        case "date":
          groupId =
            task.schedule.date < todayString
              ? "earlier"
              : task.schedule.date === todayString
                ? "today"
                : "upcoming";
          break;

        case "soon":
          groupId = "soon";
          break;

        case "someday":
          groupId = "someday";
          break;

        case "inbox":
          groupId = "inbox";
          break;
      }
    }

    groupById.get(groupId)!.data.push(task);
  }

  return groups.filter(
    (group) => group.data.length > 0 || alwaysVisibleGroupIds.has(group.id),
  );
}
