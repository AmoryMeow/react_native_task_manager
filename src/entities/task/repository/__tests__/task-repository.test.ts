import type { SQLiteDatabase, SQLiteRunResult } from "expo-sqlite";

import { createTaskRepository } from "../task-repository";

function createDatabaseMock(changes: number) {
  const runAsync = jest.fn<Promise<SQLiteRunResult>, Parameters<SQLiteDatabase["runAsync"]>>()
    .mockResolvedValue({ changes, lastInsertRowId: 0 });

  return {
    db: { runAsync } as unknown as SQLiteDatabase,
    runAsync,
  };
}

describe("TaskRepository.updateTaskDescription", () => {
  test("updates the description of an existing task", async () => {
    const { db, runAsync } = createDatabaseMock(1);
    const repository = createTaskRepository(db);

    await expect(
      repository.updateTaskDescription("task-1", "Updated description"),
    ).resolves.toBeUndefined();

    expect(runAsync).toHaveBeenCalledTimes(1);
    expect(runAsync).toHaveBeenCalledWith(
      expect.stringContaining("WHERE id = ? AND deleted_at IS NULL"),
      ["Updated description", expect.any(String), "task-1"],
    );
  });

  test("rejects an update for a missing task", async () => {
    const { db } = createDatabaseMock(0);
    const repository = createTaskRepository(db);

    await expect(
      repository.updateTaskDescription("missing-task", "Description"),
    ).rejects.toThrow("Task missing-task was not found");
  });

  test("does not update a soft-deleted task", async () => {
    const { db, runAsync } = createDatabaseMock(0);
    const repository = createTaskRepository(db);

    await expect(
      repository.updateTaskDescription("deleted-task", "Description"),
    ).rejects.toThrow("Task deleted-task was not found");

    expect(runAsync).toHaveBeenCalledWith(
      expect.stringContaining("deleted_at IS NULL"),
      expect.any(Array),
    );
  });

  test("rejects whenever SQLite reports zero affected rows", async () => {
    const { db, runAsync } = createDatabaseMock(0);
    const repository = createTaskRepository(db);

    await expect(
      repository.updateTaskDescription("task-1", "Unchanged or unavailable"),
    ).rejects.toThrow("Task task-1 was not found");

    expect(runAsync).toHaveReturnedTimes(1);
  });
});

describe("TaskRepository.updateTaskSchedule", () => {
  test("moves a task to another date without touching deadline or status", async () => {
    const row = {
      id: "task-1",
      title: "Write the report",
      description: null,
      status: "todo",
      schedule_type: "date",
      scheduled_date: "2026-10-31",
      due_at: "2026-11-05",
      created_at: "2026-10-01T00:00:00.000Z",
      updated_at: "2026-10-01T00:00:00.000Z",
      completed_at: null,
    };
    const getFirstAsync = jest.fn().mockResolvedValue(row);
    const runAsync = jest
      .fn()
      .mockResolvedValue({ changes: 1, lastInsertRowId: 0 });
    const db = { getFirstAsync, runAsync } as unknown as SQLiteDatabase;

    const updatedTask = await createTaskRepository(db).updateTaskSchedule(
      "task-1",
      { type: "date", date: "2026-11-01" },
    );

    const [sql, params] = runAsync.mock.calls[0] as [string, unknown[]];
    const setClause = sql.slice(sql.indexOf("SET"), sql.indexOf("WHERE"));

    expect(setClause).toContain("schedule_type");
    expect(setClause).toContain("scheduled_date");
    expect(setClause).not.toMatch(/due_at|status|completed_at/);
    expect(params.slice(0, 2)).toEqual(["date", "2026-11-01"]);
    expect(updatedTask).toMatchObject({
      schedule: { type: "date", date: "2026-11-01" },
      dueAt: "2026-11-05",
      status: "todo",
    });
  });
});
