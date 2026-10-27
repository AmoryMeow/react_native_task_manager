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
