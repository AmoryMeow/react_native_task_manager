import type {
  Task,
  TaskSchedule,
  TaskStatus,
} from "@/entities/task/model/types";
import { getFocusTasks } from "@/features/task-focus/lib/get-focus-tasks";

const currentDate = new Date(2026, 4, 10, 12);

function createTask(
  id: string,
  title: string,
  schedule: TaskSchedule,
  status: TaskStatus = "todo",
): Task {
  return {
    id,
    title,
    status,
    schedule,
    createdAt: "2026-05-01T10:00:00.000Z",
    updatedAt: "2026-05-01T10:00:00.000Z",
  };
}

describe("Focus task selection", () => {
  test("includes todo tasks from every schedule group in planning order", () => {
    const tasks = [
      createTask("inbox", "Inbox", { type: "inbox" }),
      createTask("future", "Future", {
        type: "date",
        date: "2026-05-11",
      }),
      createTask("someday", "Someday", { type: "someday" }),
      createTask("earlier", "Earlier", {
        type: "date",
        date: "2026-05-09",
      }),
      createTask("soon", "Soon", { type: "soon" }),
      createTask("today", "Today", {
        type: "date",
        date: "2026-05-10",
      }),
    ];

    expect(getFocusTasks(tasks, currentDate).map((task) => task.id)).toEqual([
      "earlier",
      "today",
      "future",
      "soon",
      "someday",
      "inbox",
    ]);
  });

  test("excludes completed and in-progress tasks", () => {
    const tasks = [
      createTask("todo", "Todo", { type: "inbox" }),
      createTask("in-progress", "In progress", { type: "soon" }, "in_progress"),
      createTask("done", "Done", { type: "someday" }, "done"),
    ];

    expect(getFocusTasks(tasks, currentDate).map((task) => task.id)).toEqual([
      "todo",
    ]);
  });

  test("filters titles case-insensitively and ignores surrounding whitespace", () => {
    const tasks = [
      createTask("matching", "Plan Weekly Review", { type: "inbox" }),
      createTask("other", "Buy groceries", { type: "inbox" }),
    ];

    expect(
      getFocusTasks(tasks, currentDate, "  WEEKLY  ").map(
        (task) => task.id,
      ),
    ).toEqual(["matching"]);
  });

  test("returns an empty list when no title matches", () => {
    const tasks = [createTask("task", "Write notes", { type: "soon" })];

    expect(getFocusTasks(tasks, currentDate, "missing")).toEqual([]);
  });

  test("does not mutate the input", () => {
    const tasks: readonly Task[] = Object.freeze([
      Object.freeze(createTask("today", "Today", {
        type: "date",
        date: "2026-05-10",
      })),
      Object.freeze(createTask("inbox", "Inbox", { type: "inbox" })),
    ]);
    const before = JSON.stringify(tasks);

    getFocusTasks(tasks, currentDate, "task");

    expect(JSON.stringify(tasks)).toBe(before);
  });
});
