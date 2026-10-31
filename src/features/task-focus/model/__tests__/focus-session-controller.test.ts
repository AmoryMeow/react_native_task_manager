import {
  getFocusDurationMs,
  type FocusSession,
} from "@/entities/focus-session/model/focus-session";
import { createFocusSessionRepository } from "@/entities/focus-session/repository/focus-session-repository";
import { createTaskRepository } from "@/entities/task/repository/task-repository";
import { migrateDb } from "@/shared/db/migrations";
import {
  createTestDatabase,
  type TestDatabase,
} from "@/shared/db/testing/node-sqlite-database";

import {
  createFocusSessionController,
  type FocusSessionSnapshot,
} from "../focus-session-controller";

const T0 = 1_800_000_000_000;
const MINUTE = 60_000;

let db: TestDatabase;
let clock: number;
let nextId: number;

function createRepository() {
  return createFocusSessionRepository(db, {
    createId: () => `session-${nextId++}`,
  });
}

function createController(taskId: string, repository = createRepository()) {
  const snapshots: FocusSessionSnapshot[] = [];
  const controller = createFocusSessionController({
    taskId,
    repository,
    runInTransaction: (work) => db.withTransactionAsync(work),
    now: () => clock,
    onChange: (snapshot) => snapshots.push(snapshot),
  });

  return { controller, snapshots };
}

function tracked(controller: { getSnapshot: () => FocusSessionSnapshot }) {
  const { state } = controller.getSnapshot();
  if (state.status !== "tracking") {
    throw new Error(`Expected tracking, got ${state.status}`);
  }
  return state.session;
}

async function insertTask(id: string, status = "todo") {
  await db.runAsync(
    `INSERT INTO tasks (id, title, status, created_at, updated_at)
     VALUES (?, ?, ?, '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z')`,
    [id, `Task ${id}`, status],
  );
}

async function countSessions() {
  const row = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) AS count FROM focus_sessions",
  );
  return row?.count;
}

beforeEach(async () => {
  db = createTestDatabase();
  await migrateDb(db);
  await insertTask("task-a");
  await insertTask("task-b");
  clock = T0;
  nextId = 1;
});

afterEach(() => db.close());

describe("opening Focus Mode", () => {
  test("first entry creates an active session", async () => {
    const { controller } = createController("task-a");

    await controller.init({ allowStart: true });

    expect(tracked(controller)).toMatchObject({
      taskId: "task-a",
      status: "active",
      startedAt: T0,
    });
    expect(await countSessions()).toBe(1);
  });

  test("reopening attaches to the same session without resetting it", async () => {
    const first = createController("task-a").controller;
    await first.init({ allowStart: true });
    clock = T0 + 10 * MINUTE;
    first.dispose();

    const reopened = createController("task-a").controller;
    await reopened.init({ allowStart: true });

    const session = tracked(reopened);
    expect(session.id).toBe(tracked(first).id);
    expect(getFocusDurationMs(session, clock)).toBe(10 * MINUTE);
    expect(await countSessions()).toBe(1);
  });

  test("reopening a paused session keeps it paused", async () => {
    const first = createController("task-a").controller;
    await first.init({ allowStart: true });
    clock = T0 + 4 * MINUTE;
    await first.pause();

    const reopened = createController("task-a").controller;
    clock = T0 + 30 * MINUTE;
    await reopened.init({ allowStart: true });

    expect(tracked(reopened).status).toBe("paused");
    expect(getFocusDurationMs(tracked(reopened), clock)).toBe(4 * MINUTE);
  });

  test("concurrent openings (remounts) never create a second session", async () => {
    const one = createController("task-a").controller;
    const two = createController("task-a").controller;

    await Promise.all([
      one.init({ allowStart: true }),
      two.init({ allowStart: true }),
    ]);

    expect(tracked(one).id).toBe(tracked(two).id);
    expect(await countSessions()).toBe(1);
  });

  test("repeated init calls are ignored once initialized", async () => {
    const { controller } = createController("task-a");

    await Promise.all([
      controller.init({ allowStart: true }),
      controller.init({ allowStart: true }),
    ]);
    await controller.init({ allowStart: true });

    expect(await countSessions()).toBe(1);
  });

  test("a completed task does not start a new session", async () => {
    await insertTask("task-done", "done");
    const { controller } = createController("task-done");

    await controller.init({ allowStart: false });

    expect(controller.getSnapshot().state).toEqual({ status: "none" });
    expect(await countSessions()).toBe(0);
  });
});

describe("pause and resume", () => {
  test("pausing and resuming persists and excludes paused time", async () => {
    const { controller } = createController("task-a");
    await controller.init({ allowStart: true });

    clock = T0 + 5 * MINUTE;
    await controller.pause();
    expect(tracked(controller).status).toBe("paused");

    clock = T0 + 20 * MINUTE;
    await controller.resume();
    clock = T0 + 22 * MINUTE;

    const persisted = await createRepository().getUnfinishedSession();
    expect(persisted).toEqual(tracked(controller));
    expect(getFocusDurationMs(tracked(controller), clock)).toBe(7 * MINUTE);
  });

  test("state changes only after the write is persisted", async () => {
    const repository = createRepository();
    let releasePause!: () => void;
    const pauseSession = repository.pauseSession;
    repository.pauseSession = async (...args) => {
      await new Promise<void>((resolve) => {
        releasePause = resolve;
      });
      return pauseSession(...args);
    };
    const { controller } = createController("task-a", repository);
    await controller.init({ allowStart: true });

    const pausing = controller.pause();
    expect(controller.getSnapshot().pending).toBe("pause");
    expect(tracked(controller).status).toBe("active");

    releasePause();
    await pausing;

    expect(controller.getSnapshot().pending).toBeNull();
    expect(tracked(controller).status).toBe("paused");
  });

  test("repeated taps write once", async () => {
    const { controller } = createController("task-a");
    await controller.init({ allowStart: true });
    clock = T0 + 3 * MINUTE;

    await Promise.all([controller.pause(), controller.pause()]);

    const row = await db.getFirstAsync<{ version: number }>(
      "SELECT version FROM focus_sessions",
    );
    expect(row?.version).toBe(2);
    expect(tracked(controller).accumulatedMs).toBe(3 * MINUTE);
  });

  test("a different action tapped mid-operation runs after it", async () => {
    const { controller } = createController("task-a");
    await controller.init({ allowStart: true });
    clock = T0 + 2 * MINUTE;

    await Promise.all([controller.pause(), controller.finish()]);

    expect(tracked(controller)).toMatchObject({
      status: "completed",
      accumulatedMs: 2 * MINUTE,
    });
  });

  test("a failed pause keeps the session active and can be retried", async () => {
    const repository = createRepository();
    const pauseSession = repository.pauseSession;
    repository.pauseSession = jest
      .fn()
      .mockRejectedValueOnce(new Error("database is locked"))
      .mockImplementation(pauseSession);
    const { controller } = createController("task-a", repository);
    await controller.init({ allowStart: true });

    await expect(controller.pause()).rejects.toThrow("database is locked");
    expect(tracked(controller).status).toBe("active");
    expect(controller.getSnapshot().pending).toBeNull();

    await controller.pause();
    expect(tracked(controller).status).toBe("paused");
  });
});

describe("ending focus", () => {
  test("finish ends the session and keeps its recorded time", async () => {
    const { controller } = createController("task-a");
    await controller.init({ allowStart: true });
    clock = T0 + 12 * MINUTE;

    await controller.finish();

    const [stored] = await createRepository().getSessionsForTask("task-a");
    expect(stored).toMatchObject({
      status: "completed",
      endedAt: T0 + 12 * MINUTE,
      accumulatedMs: 12 * MINUTE,
    });
    expect(await createRepository().getUnfinishedSession()).toBeNull();
  });

  test("finishing twice does not change the ended session", async () => {
    const { controller } = createController("task-a");
    await controller.init({ allowStart: true });
    clock = T0 + MINUTE;
    await controller.finish();
    const ended = tracked(controller);

    clock = T0 + 50 * MINUTE;
    await controller.finish();

    expect(tracked(controller)).toEqual(ended);
  });

  test("completing the task ends the session in the same transaction", async () => {
    const { controller } = createController("task-a");
    await controller.init({ allowStart: true });
    clock = T0 + 25 * MINUTE;
    const tasks = createTaskRepository(db);

    await controller.finish(async () => {
      const task = await tasks.getTaskById("task-a");
      await tasks.toggleTask(task!);
    });

    expect((await tasks.getTaskById("task-a"))?.status).toBe("done");
    expect(tracked(controller).status).toBe("completed");
  });

  test("a failed task completion rolls back the session end", async () => {
    const { controller } = createController("task-a");
    await controller.init({ allowStart: true });
    const before = tracked(controller);
    clock = T0 + 25 * MINUTE;

    await expect(
      controller.finish(async () => {
        throw new Error("Task task-a was not found");
      }),
    ).rejects.toThrow("not found");

    expect(tracked(controller)).toEqual(before);
    expect(await createRepository().getUnfinishedSession()).toEqual(before);
    expect((await createTaskRepository(db).getTaskById("task-a"))?.status).toBe(
      "todo",
    );
  });

  test("moving to tomorrow and ending are saved together", async () => {
    const { controller } = createController("task-a");
    await controller.init({ allowStart: true });
    clock = T0 + 5 * MINUTE;

    await controller.finish(async () => {
      await createTaskRepository(db).updateTaskSchedule("task-a", {
        type: "date",
        date: "2027-01-16",
      });
    });

    expect(
      (await createTaskRepository(db).getTaskById("task-a"))?.schedule,
    ).toEqual({ type: "date", date: "2027-01-16" });
    expect(tracked(controller).status).toBe("completed");
  });
});

describe("a session for another task", () => {
  async function leaveSessionOpenFor(taskId: string) {
    const { controller } = createController(taskId);
    await controller.init({ allowStart: true });
    controller.dispose();
    return tracked(controller);
  }

  test("is reported as a conflict and never overwritten", async () => {
    const other = await leaveSessionOpenFor("task-b");
    const { controller } = createController("task-a");

    await controller.init({ allowStart: true });

    expect(controller.getSnapshot().state).toEqual({
      status: "conflict",
      otherSession: other,
    });
    expect(await createRepository().getUnfinishedSession()).toEqual(other);
  });

  test("finishing from the conflict screen leaves the other session alone", async () => {
    const other = await leaveSessionOpenFor("task-b");
    const { controller } = createController("task-a");
    await controller.init({ allowStart: true });

    await controller.finish();

    expect(await createRepository().getUnfinishedSession()).toEqual(other);
  });

  test("can be explicitly ended to start focusing here", async () => {
    const other = await leaveSessionOpenFor("task-b");
    const { controller } = createController("task-a");
    await controller.init({ allowStart: true });
    clock = T0 + 9 * MINUTE;

    await controller.replaceOtherSession();

    const [ended] = await createRepository().getSessionsForTask("task-b");
    expect(ended).toMatchObject({
      id: other.id,
      status: "completed",
      accumulatedMs: 9 * MINUTE,
    });
    expect(tracked(controller)).toMatchObject({
      taskId: "task-a",
      status: "active",
    });
  });
});

describe("errors and lifecycle", () => {
  test("an init failure is reported and can be retried", async () => {
    const repository = createRepository();
    const getUnfinishedSession = repository.getUnfinishedSession;
    repository.getUnfinishedSession = jest
      .fn()
      .mockRejectedValueOnce(new Error("disk I/O error"))
      .mockImplementation(getUnfinishedSession);
    const { controller } = createController("task-a", repository);

    await expect(controller.init({ allowStart: true })).rejects.toThrow(
      "disk I/O error",
    );
    expect(controller.getSnapshot().state.status).toBe("error");

    await controller.init({ allowStart: true });
    expect(tracked(controller).status).toBe("active");
  });

  test("no updates are emitted after dispose", async () => {
    const { controller, snapshots } = createController("task-a");
    const opening = controller.init({ allowStart: true });
    controller.dispose();
    const emittedBeforeDispose = snapshots.length;

    await opening;

    expect(snapshots).toHaveLength(emittedBeforeDispose);
  });

  test("an active session survives restarts with its duration intact", async () => {
    const { controller } = createController("task-a");
    await controller.init({ allowStart: true });
    const started: FocusSession = tracked(controller);
    controller.dispose();

    clock = T0 + 45 * MINUTE;
    const restored = createController("task-a").controller;
    await restored.init({ allowStart: true });

    expect(tracked(restored).id).toBe(started.id);
    expect(getFocusDurationMs(tracked(restored), clock)).toBe(45 * MINUTE);
  });
});
