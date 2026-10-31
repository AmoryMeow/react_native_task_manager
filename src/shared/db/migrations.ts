import type { SQLiteDatabase } from "expo-sqlite";

interface Migration {
  version: number;
  up: (db: SQLiteDatabase) => Promise<void>;
}

const migrations: readonly Migration[] = [
  {
    version: 1,
    async up(db) {
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS tasks (
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
      `);
    },
  },
  {
    version: 2,
    async up(db) {
      // Timestamps are epoch milliseconds so durations are plain arithmetic.
      // Tasks are only soft-deleted, so sessions keep their task row; the
      // RESTRICT rule also protects history if foreign keys are enabled later.
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS focus_sessions (
          id TEXT PRIMARY KEY NOT NULL,
          task_id TEXT NOT NULL REFERENCES tasks (id) ON DELETE RESTRICT,
          status TEXT NOT NULL
            CHECK (status IN ('active', 'paused', 'completed')),
          started_at INTEGER NOT NULL CHECK (started_at >= 0),
          ended_at INTEGER,
          accumulated_ms INTEGER NOT NULL DEFAULT 0
            CHECK (accumulated_ms >= 0),
          active_segment_started_at INTEGER,
          updated_at INTEGER NOT NULL,
          version INTEGER NOT NULL DEFAULT 1,
          CHECK ((status = 'active') = (active_segment_started_at IS NOT NULL)),
          CHECK ((status = 'completed') = (ended_at IS NOT NULL)),
          CHECK (ended_at IS NULL OR ended_at >= started_at),
          CHECK (
            active_segment_started_at IS NULL
            OR active_segment_started_at >= started_at
          ),
          CHECK (updated_at >= started_at),
          CHECK (ended_at IS NULL OR accumulated_ms <= ended_at - started_at)
        );

        -- At most one unfinished (active or paused) session at a time.
        CREATE UNIQUE INDEX IF NOT EXISTS focus_sessions_one_unfinished
          ON focus_sessions ((1))
          WHERE status IN ('active', 'paused');

        CREATE INDEX IF NOT EXISTS focus_sessions_task_started
          ON focus_sessions (task_id, started_at);
      `);
    },
  },
];

export const LATEST_DB_VERSION = migrations[migrations.length - 1].version;

export async function migrateDb(db: SQLiteDatabase) {
  const result = await db.getFirstAsync<{ user_version: number }>(
    "PRAGMA user_version",
  );
  const currentVersion = result?.user_version ?? 0;

  for (const migration of migrations) {
    if (migration.version <= currentVersion) continue;

    // Each step and its version bump commit together or not at all.
    await db.withTransactionAsync(async () => {
      await migration.up(db);
      await db.execAsync(`PRAGMA user_version = ${migration.version}`);
    });
  }
}
