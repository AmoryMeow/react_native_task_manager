import {
  pauseFocusSession,
  startFocusSession,
} from "@/entities/focus-session/model/focus-session";
import { createFocusSessionRepository } from "@/entities/focus-session/repository/focus-session-repository";
import { createTaskRepository } from "@/entities/task/repository/task-repository";
import { migrateDb } from "@/shared/db/migrations";
import {
  createTestDatabase,
  type TestDatabase,
} from "@/shared/db/testing/node-sqlite-database";

import {
  formatSessionStart,
  LONG_SESSION_REVIEW_MS,
  loadFocusRecovery,
  needsDurationReview,
  parseDurationInput,
  splitDuration,
} from "../focus-recovery";

const T0 = new Date(2026, 9, 31, 9, 41).getTime();
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

describe("loadFocusRecovery", () => {
  let db: TestDatabase;
  let sessions: ReturnType<typeof createFocusSessionRepository>;
  let tasks: ReturnType<typeof createTaskRepository>;

  const load = () =>
    loadFocusRecovery({
      getUnfinishedSession: () => sessions.getUnfinishedSession(),
      getTaskById: (taskId) => tasks.getTaskById(taskId),
    });

  beforeEach(async () => {
    db = createTestDatabase();
    await migrateDb(db);
    await db.runAsync(
      `INSERT INTO tasks (id, title, status, schedule_type, scheduled_date,
         due_at, created_at, updated_at)
       VALUES ('task-a', 'Write the report', 'todo', 'date', '2026-10-31',
         '2026-11-05', '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z')`,
    );
    let nextId = 1;
    sessions = createFocusSessionRepository(db, {
      createId: () => `session-${nextId++}`,
    });
    tasks = createTaskRepository(db);
  });

  afterEach(() => db.close());

  test("finds nothing when no session is unfinished", async () => {
    expect(await load()).toBeNull();

    const { id } = await sessions.startSession("task-a", T0);
    await sessions.endSession(id, T0 + MINUTE);

    expect(await load()).toBeNull();
  });

  test("recovers an active session with its task", async () => {
    const started = await sessions.startSession("task-a", T0);

    expect(await load()).toEqual({
      session: started,
      task: expect.objectContaining({
        id: "task-a",
        title: "Write the report",
      }),
    });
  });

  test("recovers a paused session as paused", async () => {
    const { id } = await sessions.startSession("task-a", T0);
    await sessions.pauseSession(id, T0 + 5 * MINUTE);

    const recovery = await load();

    expect(recovery?.session).toMatchObject({
      status: "paused",
      accumulatedMs: 5 * MINUTE,
    });
  });

  test("keeps a session whose task was deleted, without a task", async () => {
    const started = await sessions.startSession("task-a", T0);
    await tasks.deleteTask("task-a");

    expect(await load()).toEqual({ session: started, task: null });
  });

  test("ending a recovered session leaves the task untouched", async () => {
    const before = await tasks.getTaskById("task-a");
    const { id } = await sessions.startSession("task-a", T0);

    await sessions.endSession(id, T0 + 30 * MINUTE);

    expect(await load()).toBeNull();
    expect(await tasks.getTaskById("task-a")).toEqual(before);
  });
});

describe("needsDurationReview", () => {
  const active = startFocusSession({ id: "s", taskId: "t", now: T0 });

  test("asks for review only after more than 4 hours of focus", () => {
    expect(needsDurationReview(active, T0 + LONG_SESSION_REVIEW_MS)).toBe(
      false,
    );
    expect(needsDurationReview(active, T0 + LONG_SESSION_REVIEW_MS + 1)).toBe(
      true,
    );
  });

  test("includes time the app spent in the background", () => {
    expect(needsDurationReview(active, T0 + 5 * HOUR)).toBe(true);
  });

  test("a paused session does not grow into a review", () => {
    const paused = pauseFocusSession(active, T0 + 3 * HOUR);

    expect(needsDurationReview(paused, T0 + 30 * HOUR)).toBe(false);
  });
});

describe("parseDurationInput", () => {
  const max = 5 * HOUR + 12 * MINUTE + 40_000;

  test.each([
    ["1", "30", 90 * MINUTE],
    ["0", "0", 0],
    ["", "45", 45 * MINUTE],
    [" 2 ", "", 2 * HOUR],
    ["5", "12", 5 * HOUR + 12 * MINUTE],
  ])("accepts %s h %s min", (hours, minutes, expected) => {
    expect(parseDurationInput(hours, minutes, max)).toEqual({
      ok: true,
      ms: expected,
    });
  });

  test.each([
    ["-1", "0", "Use whole numbers for hours and minutes."],
    ["1.5", "0", "Use whole numbers for hours and minutes."],
    ["abc", "0", "Use whole numbers for hours and minutes."],
    ["1", "60", "Minutes must be between 0 and 59."],
    ["5", "13", "Focus time can't be longer than the recorded time."],
    ["99", "0", "Focus time can't be longer than the recorded time."],
  ])("rejects %s h %s min", (hours, minutes, error) => {
    expect(parseDurationInput(hours, minutes, max)).toEqual({
      ok: false,
      error,
    });
  });
});

describe("splitDuration", () => {
  test("rounds down to whole minutes", () => {
    expect(splitDuration(5 * HOUR + 12 * MINUTE + 59_000)).toEqual({
      hours: 5,
      minutes: 12,
    });
    expect(splitDuration(0)).toEqual({ hours: 0, minutes: 0 });
  });
});

describe("formatSessionStart", () => {
  test("shows only the time for a session started today", () => {
    expect(formatSessionStart(T0, T0 + 2 * HOUR)).toBe("Started 9:41 AM");
  });

  test("adds the date for a session started on another day", () => {
    expect(formatSessionStart(T0, T0 + 20 * HOUR)).toBe(
      "Started Oct 31, 9:41 AM",
    );
  });

  test("adds the year for a session from another year", () => {
    expect(formatSessionStart(T0, new Date(2027, 0, 2, 8, 0).getTime())).toBe(
      "Started Oct 31, 2026, 9:41 AM",
    );
  });
});
