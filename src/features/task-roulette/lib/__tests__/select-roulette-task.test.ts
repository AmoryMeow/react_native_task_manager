import type {
  Task,
  TaskSchedule,
  TaskStatus,
} from "@/entities/task/model/types";
import {
  getEligibleRouletteTasks,
  selectRouletteTask,
} from "@/features/task-roulette/lib/select-roulette-task";

const currentDate = new Date(2026, 4, 10, 12);

function createTask(
  id: string,
  schedule: TaskSchedule = { type: "date", date: "2026-05-10" },
  status: TaskStatus = "todo",
): Task {
  return {
    id,
    title: `Task ${id}`,
    status,
    schedule,
    createdAt: "2026-05-01T10:00:00.000Z",
    updatedAt: "2026-05-01T10:00:00.000Z",
  };
}

describe("Task Roulette selection", () => {
  test("returns null when no tasks are eligible", () => {
    const tasks = [
      createTask("future", { type: "date", date: "2026-05-11" }),
      createTask("inbox", { type: "inbox" }),
    ];

    expect(selectRouletteTask(tasks, currentDate)).toBeNull();
  });

  test("returns the only eligible task", () => {
    const onlyTask = createTask("only");

    expect(
      selectRouletteTask(
        [onlyTask],
        currentDate,
        ["today"],
        onlyTask.id,
        () => 0.75,
      ),
    ).toBe(onlyTask);
  });

  test.each([
    [0, "first"],
    [0.34, "second"],
    [0.999, "third"],
  ])("maps random value %s to %s with equal-sized ranges", (random, id) => {
    const tasks = [
      createTask("first"),
      createTask("second"),
      createTask("third"),
    ];

    expect(
      selectRouletteTask(
        tasks,
        currentDate,
        ["today"],
        undefined,
        () => random,
      )?.id,
    ).toBe(id);
  });

  test("filters candidates by the selected task groups", () => {
    const tasks = [
      createTask("earlier", { type: "date", date: "2026-05-09" }),
      createTask("today"),
      createTask("upcoming", { type: "date", date: "2026-05-11" }),
      createTask("soon", { type: "soon" }),
      createTask("someday", { type: "someday" }),
      createTask("inbox", { type: "inbox" }),
    ];

    expect(
      getEligibleRouletteTasks(tasks, currentDate, ["soon", "inbox"]).map(
        (task) => task.id,
      ),
    ).toEqual(["soon", "inbox"]);
  });

  test("excludes completed and in-progress tasks", () => {
    const tasks = [
      createTask("todo"),
      createTask("in-progress", undefined, "in_progress"),
      createTask("completed", undefined, "done"),
    ];

    expect(
      getEligibleRouletteTasks(tasks, currentDate, ["today"]).map(
        (task) => task.id,
      ),
    ).toEqual(["todo"]);
  });

  test("does not immediately repeat the previous task when alternatives exist", () => {
    const tasks = [
      createTask("first"),
      createTask("previous"),
      createTask("third"),
    ];

    expect(
      selectRouletteTask(
        tasks,
        currentDate,
        ["today"],
        "previous",
        () => 0,
      )?.id,
    ).toBe("first");
    expect(
      selectRouletteTask(
        tasks,
        currentDate,
        ["today"],
        "previous",
        () => 0.999,
      )?.id,
    ).toBe("third");
  });

  test("uses local calendar-day boundaries", () => {
    const tasks = [
      createTask("may-10", { type: "date", date: "2026-05-10" }),
      createTask("may-11", { type: "date", date: "2026-05-11" }),
    ];

    expect(
      getEligibleRouletteTasks(
        tasks,
        new Date(2026, 4, 10, 23, 59, 59),
      ).map((task) => task.id),
    ).toEqual(["may-10"]);
    expect(
      getEligibleRouletteTasks(
        tasks,
        new Date(2026, 4, 11, 0, 0, 0),
      ).map((task) => task.id),
    ).toEqual(["may-10", "may-11"]);
  });

  test("does not mutate tasks or selected groups", () => {
    const tasks: readonly Task[] = Object.freeze([
      Object.freeze(createTask("today")),
      Object.freeze(createTask("soon", { type: "soon" })),
    ]);
    const selectedGroups = Object.freeze(["today", "soon"] as const);
    const tasksBefore = JSON.stringify(tasks);
    const groupsBefore = [...selectedGroups];

    selectRouletteTask(
      tasks,
      currentDate,
      selectedGroups,
      undefined,
      () => 0.5,
    );

    expect(JSON.stringify(tasks)).toBe(tasksBefore);
    expect(selectedGroups).toEqual(groupsBefore);
  });
});
