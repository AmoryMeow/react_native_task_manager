import type {
  Task,
  TaskSchedule,
  TaskStatus,
} from "@/entities/task/model/types";
import { selectTaskDuelPair } from "@/features/task-duel/lib/select-task-duel-pair";
import { getEligibleTasks } from "@/features/task-selection/lib/get-eligible-tasks";

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

describe("Task Duel pair selection", () => {
  test("returns null for zero tasks", () => {
    expect(selectTaskDuelPair([])).toBeNull();
  });

  test("returns null for one task", () => {
    expect(selectTaskDuelPair([createTask("only")])).toBeNull();
  });

  test("always returns both tasks when exactly two are available", () => {
    const tasks = [createTask("first"), createTask("second")];

    expect(
      selectTaskDuelPair(tasks, ["second", "first"], () => 0.75)?.map(
        (task) => task.id,
      ),
    ).toEqual(["first", "second"]);
  });

  test.each([
    [0, ["first", "second"]],
    [0.34, ["first", "third"]],
    [0.999, ["second", "third"]],
  ])("selects a deterministic pair for random value %s", (random, ids) => {
    const tasks = [
      createTask("first"),
      createTask("second"),
      createTask("third"),
    ];

    expect(
      selectTaskDuelPair(tasks, undefined, () => random)?.map(
        (task) => task.id,
      ),
    ).toEqual(ids);
  });

  test("never places the same task on both sides", () => {
    const tasks = [
      createTask("first"),
      createTask("second"),
      createTask("third"),
      createTask("fourth"),
    ];

    for (const random of [0, 0.2, 0.5, 0.8, 0.999]) {
      const pair = selectTaskDuelPair(tasks, undefined, () => random);

      expect(pair).not.toBeNull();
      expect(pair?.[0].id).not.toBe(pair?.[1].id);
    }
  });

  test("avoids the previous unordered pair when alternatives exist", () => {
    const tasks = [
      createTask("first"),
      createTask("second"),
      createTask("third"),
    ];

    const nextPair = selectTaskDuelPair(
      tasks,
      ["second", "first"],
      () => 0,
    );

    expect(nextPair?.map((task) => task.id)).toEqual(["first", "third"]);
  });

  test("uses the shared group filter before selecting a pair", () => {
    const tasks = [
      createTask("today"),
      createTask("soon", { type: "soon" }),
      createTask("inbox", { type: "inbox" }),
      createTask("completed-soon", { type: "soon" }, "done"),
    ];
    const eligibleTasks = getEligibleTasks(tasks, currentDate, [
      "soon",
      "inbox",
    ]);

    expect(eligibleTasks.map((task) => task.id)).toEqual(["soon", "inbox"]);
    expect(
      selectTaskDuelPair(eligibleTasks, undefined, () => 0)?.map(
        (task) => task.id,
      ),
    ).toEqual(["soon", "inbox"]);
  });

  test("does not mutate tasks or the previous pair", () => {
    const tasks: readonly Task[] = Object.freeze([
      Object.freeze(createTask("first")),
      Object.freeze(createTask("second")),
      Object.freeze(createTask("third")),
    ]);
    const previousPair = Object.freeze(["second", "first"] as const);
    const tasksBefore = JSON.stringify(tasks);
    const previousPairBefore = [...previousPair];

    selectTaskDuelPair(tasks, previousPair, () => 0.5);

    expect(JSON.stringify(tasks)).toBe(tasksBefore);
    expect(previousPair).toEqual(previousPairBefore);
  });
});
