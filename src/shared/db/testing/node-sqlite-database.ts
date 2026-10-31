import type { SQLiteDatabase } from "expo-sqlite";

/**
 * Test-only: a real in-memory SQLite (Node's built-in `node:sqlite`) behind
 * the subset of the expo-sqlite API this app uses, so migrations, CHECK
 * constraints and indexes are exercised for real in Jest.
 */

type SqlValue = string | number | null;

interface NodeStatement {
  run(...params: SqlValue[]): {
    changes: number | bigint;
    lastInsertRowid: number | bigint;
  };
  get(...params: SqlValue[]): unknown;
  all(...params: SqlValue[]): unknown[];
}

interface NodeDatabase {
  exec(sql: string): void;
  prepare(sql: string): NodeStatement;
  close(): void;
}

function loadNodeSqlite(): new (path: string) => NodeDatabase {
  try {
    return jest.requireActual<{
      DatabaseSync: new (path: string) => NodeDatabase;
    }>("node:sqlite").DatabaseSync;
  } catch (error) {
    throw new Error(
      `Database tests need Node.js >= 22.13 (node:sqlite). Current: ${process.version}`,
      { cause: error },
    );
  }
}

function toParams(params: unknown[]): SqlValue[] {
  const values =
    params.length === 1 && Array.isArray(params[0]) ? params[0] : params;

  return values as SqlValue[];
}

export interface TestDatabase extends SQLiteDatabase {
  close: () => void;
}

export function createTestDatabase(): TestDatabase {
  const DatabaseSync = loadNodeSqlite();
  const db = new DatabaseSync(":memory:");

  const adapter = {
    async execAsync(sql: string) {
      db.exec(sql);
    },
    async runAsync(sql: string, ...params: unknown[]) {
      const result = db.prepare(sql).run(...toParams(params));

      return {
        changes: Number(result.changes),
        lastInsertRowId: Number(result.lastInsertRowid),
      };
    },
    async getFirstAsync(sql: string, ...params: unknown[]) {
      return db.prepare(sql).get(...toParams(params)) ?? null;
    },
    async getAllAsync(sql: string, ...params: unknown[]) {
      return db.prepare(sql).all(...toParams(params));
    },
    async withTransactionAsync(task: () => Promise<void>) {
      db.exec("BEGIN");
      try {
        await task();
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
    close() {
      db.close();
    },
  };

  return adapter as unknown as TestDatabase;
}
