import type { Task, TaskSchedule } from "@/entities/task/model/types";

import {
  applyEndFocusChoice,
  getTomorrowSchedule,
  getTomorrowSuggestion,
  shouldSuggestTomorrow,
} from "../tomorrow-suggestion";

// Late evening local time: a UTC-based date would already be "tomorrow".
const now = new Date(2026, 9, 31, 23, 45);

function createTask(
  schedule: TaskSchedule,
  overrides: Partial<Task> = {},
): Task {
  return {
    id: "task-1",
    title: "Write the report",
    status: "todo",
    schedule,
    dueAt: "2026-11-05",
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("getTomorrowSuggestion", () => {
  test("suggests tomorrow for an unfinished task scheduled for today", () => {
    expect(
      getTomorrowSuggestion(
        createTask({ type: "date", date: "2026-10-31" }),
        now,
      ),
    ).toBe("today");
  });

  test.each([
    ["yesterday", "2026-10-30"],
    ["last year", "2025-12-31"],
  ])("suggests tomorrow for an overdue task from %s", (_label, date) => {
    expect(getTomorrowSuggestion(createTask({ type: "date", date }), now)).toBe(
      "overdue",
    );
  });

  test.each([
    ["tomorrow", { type: "date", date: "2026-11-01" }],
    ["Inbox", { type: "inbox" }],
    ["Soon", { type: "soon" }],
    ["Someday", { type: "someday" }],
  ] as const)("does not suggest tomorrow for a %s task", (_label, schedule) => {
    expect(getTomorrowSuggestion(createTask(schedule), now)).toBeNull();
    expect(shouldSuggestTomorrow(createTask(schedule), now)).toBe(false);
  });

  test.each([
    ["today", "2026-10-31"],
    ["an overdue date", "2026-10-30"],
  ])(
    "does not suggest tomorrow for a completed task from %s",
    (_label, date) => {
      expect(
        getTomorrowSuggestion(
          createTask(
            { type: "date", date },
            { status: "done", completedAt: "2026-10-31T20:00:00.000Z" },
          ),
          now,
        ),
      ).toBeNull();
    },
  );
});

describe("getTomorrowSchedule", () => {
  test.each([
    [new Date(2026, 9, 31, 23, 45), "2026-11-01"],
    [new Date(2026, 11, 31, 0, 5), "2027-01-01"],
    [new Date(2028, 1, 28, 12, 0), "2028-02-29"],
    [new Date(2026, 2, 7, 23, 59), "2026-03-08"],
  ])("uses the next local calendar date after %s", (date, expected) => {
    expect(getTomorrowSchedule(date)).toEqual({ type: "date", date: expected });
  });
});

describe("applyEndFocusChoice", () => {
  const todayTask = createTask({ type: "date", date: "2026-10-31" });

  test("Keep exits without writing", async () => {
    const updateSchedule = jest.fn();

    await expect(
      applyEndFocusChoice({
        choice: "keep",
        task: todayTask,
        now,
        updateSchedule,
      }),
    ).resolves.toEqual({ status: "exit" });
    expect(updateSchedule).not.toHaveBeenCalled();
  });

  test("Move to tomorrow updates only the schedule, then exits", async () => {
    const updateSchedule = jest.fn(
      async (_id: string, schedule: TaskSchedule) => ({
        ...todayTask,
        schedule,
      }),
    );

    await expect(
      applyEndFocusChoice({
        choice: "move-to-tomorrow",
        task: todayTask,
        now,
        updateSchedule,
      }),
    ).resolves.toEqual({ status: "exit" });
    expect(updateSchedule).toHaveBeenCalledTimes(1);
    expect(updateSchedule).toHaveBeenCalledWith("task-1", {
      type: "date",
      date: "2026-11-01",
    });
  });

  test("Move to tomorrow also moves an overdue task", async () => {
    const updateSchedule = jest.fn(
      async (_id: string, schedule: TaskSchedule) => ({
        ...todayTask,
        schedule,
      }),
    );

    await expect(
      applyEndFocusChoice({
        choice: "move-to-tomorrow",
        task: createTask({ type: "date", date: "2026-10-20" }),
        now,
        updateSchedule,
      }),
    ).resolves.toEqual({ status: "exit" });
    expect(updateSchedule).toHaveBeenCalledWith("task-1", {
      type: "date",
      date: "2026-11-01",
    });
  });

  test("a failed write is reported instead of exiting", async () => {
    const error = new Error("database is locked");

    await expect(
      applyEndFocusChoice({
        choice: "move-to-tomorrow",
        task: todayTask,
        now,
        updateSchedule: async () => {
          throw error;
        },
      }),
    ).resolves.toEqual({ status: "failed", error });
  });

  test("does not move a task that no longer qualifies when tapped", async () => {
    const updateSchedule = jest.fn();

    await expect(
      applyEndFocusChoice({
        choice: "move-to-tomorrow",
        task: { ...todayTask, status: "done" },
        now,
        updateSchedule,
      }),
    ).resolves.toEqual({ status: "exit" });
    expect(updateSchedule).not.toHaveBeenCalled();
  });
});
