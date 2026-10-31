import { LATEST_DB_VERSION, migrateDb } from "../migrations";
import {
  createTestDatabase,
  type TestDatabase,
} from "../testing/node-sqlite-database";

// The schema exactly as shipped at user_version 1, to simulate an existing install.
const V1_SCHEMA = `
  CREATE TABLE tasks (
    id TEXT PRIMARY KEY NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'todo',
    schedule_type TEXT NOT NULL DEFAULT 'inbox',
    scheduled_date TEXT,
    due_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    completed_at TEXT,
    deleted_at TEXT
  );
  PRAGMA user_version = 1;
`;

async function getVersion(db: TestDatabase) {
  const row = await db.getFirstAsync<{ user_version: number }>(
    "PRAGMA user_version",
  );
  return row?.user_version;
}

async function getTableNames(db: TestDatabase) {
  const rows = await db.getAllAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type IN ('table', 'index') ORDER BY name",
  );
  return rows.map((row) => row.name);
}

describe("migrateDb", () => {
  let db: TestDatabase;

  beforeEach(() => {
    db = createTestDatabase();
  });

  afterEach(() => db.close());

  test("creates the latest schema on a fresh database", async () => {
    await migrateDb(db);

    expect(LATEST_DB_VERSION).toBe(2);
    expect(await getVersion(db)).toBe(2);
    expect(await getTableNames(db)).toEqual(
      expect.arrayContaining([
        "tasks",
        "focus_sessions",
        "focus_sessions_one_unfinished",
        "focus_sessions_task_started",
      ]),
    );
  });

  test("upgrades a version 1 database without touching existing tasks", async () => {
    await db.execAsync(V1_SCHEMA);
    await db.runAsync(
      `INSERT INTO tasks (id, title, description, status, schedule_type,
         scheduled_date, due_at, created_at, updated_at, completed_at, deleted_at)
       VALUES
         ('a', 'Active task', 'Notes', 'todo', 'date', '2026-10-31', '2026-11-05',
          '2026-10-01T00:00:00.000Z', '2026-10-02T00:00:00.000Z', NULL, NULL),
         ('b', 'Deleted task', NULL, 'done', 'inbox', NULL, NULL,
          '2026-10-01T00:00:00.000Z', '2026-10-03T00:00:00.000Z',
          '2026-10-03T00:00:00.000Z', '2026-10-04T00:00:00.000Z')`,
    );
    const before = await db.getAllAsync("SELECT * FROM tasks ORDER BY id");

    await migrateDb(db);

    expect(await getVersion(db)).toBe(2);
    expect(await db.getAllAsync("SELECT * FROM tasks ORDER BY id")).toEqual(
      before,
    );
    expect(await getTableNames(db)).toContain("focus_sessions");
  });

  test("is safe to run again on an up-to-date database", async () => {
    await migrateDb(db);
    await db.runAsync(
      `INSERT INTO tasks (id, title, created_at, updated_at)
       VALUES ('a', 'Task', 'now', 'now')`,
    );

    await migrateDb(db);

    expect(await getVersion(db)).toBe(2);
    expect(await db.getAllAsync("SELECT id FROM tasks")).toEqual([{ id: "a" }]);
  });

  test("rolls back a failed step and leaves the previous version intact", async () => {
    await db.execAsync(V1_SCHEMA);
    // An object that collides with a name created by step 2 makes it fail.
    await db.execAsync("CREATE TABLE focus_sessions_task_started (x)");

    await expect(migrateDb(db)).rejects.toThrow();

    expect(await getVersion(db)).toBe(1);
    expect(await getTableNames(db)).not.toContain("focus_sessions");
  });
});
