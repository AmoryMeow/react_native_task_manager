import { createTaskRepository } from "@/entities/task/repository/task-repository";
import { migrateDb } from "@/shared/db/migrations";
import {
  createTestDatabase,
  type TestDatabase,
} from "@/shared/db/testing/node-sqlite-database";

import {
  FocusSessionTransitionError,
  getElapsedMs,
  getFocusDurationMs,
} from "../../model/focus-session";
import {
  createFocusSessionRepository,
  FocusSessionConflictError,
  FocusSessionNotFoundError,
} from "../focus-session-repository";

const T0 = 1_800_000_000_000;
const MINUTE = 60_000;

let db: TestDatabase;
let repository: ReturnType<typeof createFocusSessionRepository>;

function createRepository() {
  let nextId = 1;
  return createFocusSessionRepository(db, {
    createId: () => `session-${nextId++}`,
  });
}

async function insertTask(id: string) {
  await db.runAsync(
    `INSERT INTO tasks (id, title, created_at, updated_at)
     VALUES (?, ?, '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z')`,
    [id, `Task ${id}`],
  );
}

async function getVersion(sessionId: string) {
  const row = await db.getFirstAsync<{ version: number }>(
    "SELECT version FROM focus_sessions WHERE id = ?",
    [sessionId],
  );
  return row?.version;
}

beforeEach(async () => {
  db = createTestDatabase();
  await migrateDb(db);
  await insertTask("task-a");
  await insertTask("task-b");
  repository = createRepository();
});

afterEach(() => db.close());

describe("session lifecycle", () => {
  test("start, pause, resume and end are persisted", async () => {
    const started = await repository.startSession("task-a", T0);
    expect(await repository.getSession(started.id)).toEqual(started);

    await repository.pauseSession(started.id, T0 + 10 * MINUTE);
    await repository.resumeSession(started.id, T0 + 15 * MINUTE);
    const ended = await repository.endSession(started.id, T0 + 25 * MINUTE);

    const stored = await repository.getSession(started.id);
    expect(stored).toEqual(ended);
    expect(stored).toMatchObject({
      status: "completed",
      endedAt: T0 + 25 * MINUTE,
      accumulatedMs: 20 * MINUTE,
      activeSegmentStartedAt: null,
    });
    expect(getElapsedMs(stored!, T0 + 99 * MINUTE)).toBe(25 * MINUTE);
  });

  test("multiple pause/resume cycles exclude every paused interval", async () => {
    const { id } = await repository.startSession("task-a", T0);

    for (let cycle = 0; cycle < 4; cycle += 1) {
      const base = T0 + cycle * 10 * MINUTE;
      await repository.pauseSession(id, base + 7 * MINUTE);
      await repository.resumeSession(id, base + 10 * MINUTE);
    }
    const ended = await repository.endSession(id, T0 + 45 * MINUTE);

    expect(ended.accumulatedMs).toBe(4 * 7 * MINUTE + 5 * MINUTE);
  });
});

describe("single unfinished session", () => {
  test("starting while another session is active is rejected, not overwritten", async () => {
    const first = await repository.startSession("task-a", T0);

    const attempt = repository.startSession("task-b", T0 + MINUTE);

    await expect(attempt).rejects.toBeInstanceOf(FocusSessionConflictError);
    await expect(attempt).rejects.toMatchObject({
      unfinishedSession: { id: first.id, status: "active" },
    });
    expect(await repository.getUnfinishedSession()).toEqual(first);
    expect(await repository.getSessionsForTask("task-b")).toEqual([]);
  });

  test("a paused session also blocks a new start", async () => {
    const first = await repository.startSession("task-a", T0);
    await repository.pauseSession(first.id, T0 + MINUTE);

    await expect(
      repository.startSession("task-a", T0 + 2 * MINUTE),
    ).rejects.toBeInstanceOf(FocusSessionConflictError);
  });

  test("two concurrent starts create exactly one session", async () => {
    const results = await Promise.allSettled([
      repository.startSession("task-a", T0),
      repository.startSession("task-b", T0),
    ]);

    expect(results.map((result) => result.status).sort()).toEqual([
      "fulfilled",
      "rejected",
    ]);
    const rows = await db.getAllAsync("SELECT id FROM focus_sessions");
    expect(rows).toHaveLength(1);
  });

  test("a new session can start once the previous one has ended", async () => {
    const first = await repository.startSession("task-a", T0);
    await repository.endSession(first.id, T0 + MINUTE);

    const second = await repository.startSession("task-b", T0 + 2 * MINUTE);

    expect(await repository.getUnfinishedSession()).toEqual(second);
  });
});

describe("repeated and concurrent operations", () => {
  test("repeated pause, resume and end do not double-count or rewrite", async () => {
    const { id } = await repository.startSession("task-a", T0);

    await repository.pauseSession(id, T0 + 5 * MINUTE);
    const versionAfterPause = await getVersion(id);
    await repository.pauseSession(id, T0 + 50 * MINUTE);
    expect(await getVersion(id)).toBe(versionAfterPause);

    await repository.resumeSession(id, T0 + 10 * MINUTE);
    await repository.resumeSession(id, T0 + 12 * MINUTE);

    const ended = await repository.endSession(id, T0 + 20 * MINUTE);
    const endedAgain = await repository.endSession(id, T0 + 90 * MINUTE);

    expect(ended.accumulatedMs).toBe(15 * MINUTE);
    expect(endedAgain).toEqual(ended);
  });

  test("concurrent pauses record the segment once", async () => {
    const { id } = await repository.startSession("task-a", T0);

    await Promise.all([
      repository.pauseSession(id, T0 + 5 * MINUTE),
      repository.pauseSession(id, T0 + 6 * MINUTE),
    ]);

    const stored = await repository.getSession(id);
    expect(stored?.status).toBe("paused");
    expect([5 * MINUTE, 6 * MINUTE]).toContain(stored?.accumulatedMs);
    expect(await getVersion(id)).toBe(2);
  });
});

describe("invalid operations", () => {
  test("cannot resume or pause a completed session", async () => {
    const { id } = await repository.startSession("task-a", T0);
    await repository.endSession(id, T0 + MINUTE);

    await expect(
      repository.resumeSession(id, T0 + 2 * MINUTE),
    ).rejects.toBeInstanceOf(FocusSessionTransitionError);
    await expect(
      repository.pauseSession(id, T0 + 2 * MINUTE),
    ).rejects.toBeInstanceOf(FocusSessionTransitionError);
  });

  test("unknown sessions are reported as not found", async () => {
    await expect(repository.pauseSession("missing", T0)).rejects.toBeInstanceOf(
      FocusSessionNotFoundError,
    );
  });

  test("cannot start a session for a missing or deleted task", async () => {
    await createTaskRepository(db).deleteTask("task-b");

    await expect(repository.startSession("missing", T0)).rejects.toThrow(
      "Task missing was not found",
    );
    await expect(repository.startSession("task-b", T0)).rejects.toThrow(
      "Task task-b was not found",
    );
    expect(await db.getAllAsync("SELECT id FROM focus_sessions")).toEqual([]);
  });

  test("SQLite errors propagate to the caller", async () => {
    await db.execAsync("DROP TABLE focus_sessions");

    await expect(repository.startSession("task-a", T0)).rejects.toThrow(
      /no such table/,
    );
  });
});

describe("persistence across app restarts", () => {
  test("an active session restored after termination keeps counting from its timestamps", async () => {
    const started = await repository.startSession("task-a", T0);

    // Simulate the app being killed and relaunched later.
    const restored = await createRepository().getUnfinishedSession();

    expect(restored).toEqual(started);
    expect(getFocusDurationMs(restored!, T0 + 42 * MINUTE)).toBe(42 * MINUTE);
  });

  test("a paused session restored later has not accrued time", async () => {
    const { id } = await repository.startSession("task-a", T0);
    await repository.pauseSession(id, T0 + 8 * MINUTE);

    const restored = await createRepository().getUnfinishedSession();

    expect(getFocusDurationMs(restored!, T0 + 600 * MINUTE)).toBe(8 * MINUTE);
  });
});

describe("history", () => {
  test("sessions are kept and listed in order after the task is deleted", async () => {
    const first = await repository.startSession("task-a", T0);
    await repository.endSession(first.id, T0 + 10 * MINUTE);
    const second = await repository.startSession("task-a", T0 + 60 * MINUTE);
    await repository.endSession(second.id, T0 + 75 * MINUTE);

    await createTaskRepository(db).deleteTask("task-a");

    const sessions = await repository.getSessionsForTask("task-a");
    expect(sessions.map((session) => session.id)).toEqual([
      first.id,
      second.id,
    ]);
    expect(sessions.map((session) => session.accumulatedMs)).toEqual([
      10 * MINUTE,
      15 * MINUTE,
    ]);
  });
});

describe("database invariants", () => {
  const insert = (values: string) =>
    db.runAsync(
      `INSERT INTO focus_sessions (id, task_id, status, started_at, ended_at,
         accumulated_ms, active_segment_started_at, updated_at)
       VALUES ${values}`,
    );

  test.each([
    ["unknown status", `('x', 'task-a', 'running', 100, NULL, 0, 100, 100)`],
    [
      "active without a segment start",
      `('x', 'task-a', 'active', 100, NULL, 0, NULL, 100)`,
    ],
    [
      "paused with a segment start",
      `('x', 'task-a', 'paused', 100, NULL, 0, 100, 100)`,
    ],
    [
      "completed without an end",
      `('x', 'task-a', 'completed', 100, NULL, 0, NULL, 100)`,
    ],
    [
      "ended before it started",
      `('x', 'task-a', 'completed', 100, 50, 0, NULL, 100)`,
    ],
    [
      "negative duration",
      `('x', 'task-a', 'paused', 100, NULL, -1, NULL, 100)`,
    ],
    [
      "more focus than elapsed time",
      `('x', 'task-a', 'completed', 100, 200, 500, NULL, 200)`,
    ],
  ])("rejects a session with %s", async (_label, values) => {
    await expect(insert(values)).rejects.toThrow(/constraint failed/i);
  });

  test("rejects a second unfinished session written directly", async () => {
    await insert(`('x', 'task-a', 'paused', 100, NULL, 0, NULL, 100)`);

    await expect(
      insert(`('y', 'task-b', 'active', 200, NULL, 0, 200, 200)`),
    ).rejects.toThrow(/UNIQUE constraint failed/);
  });
});
