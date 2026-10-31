import type { Task } from "../model/types";

export type TaskGroupId =
  "earlier" | "today" | "upcoming" | "soon" | "someday" | "inbox" | "completed";

export const TASK_GROUP_TITLES: Record<TaskGroupId, string> = {
  earlier: "Earlier",
  today: "Today",
  upcoming: "Upcoming",
  soon: "Soon",
  someday: "Someday",
  inbox: "Inbox",
  completed: "Completed",
};

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

export function groupTasks(
  tasks: readonly Task[],
  today = new Date(),
): TaskGroup[] {
  const todayString = toLocalDateString(today);

  const groups: TaskGroup[] = (
    [
      "earlier",
      "today",
      "upcoming",
      "soon",
      "someday",
      "inbox",
      "completed",
    ] as const
  ).map((id) => ({ id, title: TASK_GROUP_TITLES[id], data: [] }));

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
