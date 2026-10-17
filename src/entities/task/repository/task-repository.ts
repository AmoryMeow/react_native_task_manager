import * as Crypto from "expo-crypto";
import type { SQLiteDatabase } from "expo-sqlite";
import type { Task, TaskSchedule } from "../model/types";

interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  status: Task["status"];
  schedule_type: TaskSchedule["type"];
  scheduled_date: string | null;
  due_at: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

function mapTask(row: TaskRow): Task {
  const schedule: TaskSchedule =
    row.schedule_type === "date"
      ? { type: "date", date: row.scheduled_date! }
      : { type: row.schedule_type };

  return {
    id: row.id,
    title: row.title,
    description: row.description ?? undefined,
    status: row.status,
    schedule,
    dueAt: row.due_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at ?? undefined,
  };
}

export function createTaskRepository(db: SQLiteDatabase) {
  return {
    async getTasks(): Promise<Task[]> {
      const rows = await db.getAllAsync<TaskRow>(
        `SELECT * FROM tasks
         WHERE deleted_at IS NULL
         ORDER BY created_at DESC`,
      );

      return rows.map(mapTask);
    },

    async addTask(title: string, schedule: TaskSchedule): Promise<Task> {
      const now = new Date().toISOString();
      const task: Task = {
        id: Crypto.randomUUID(),
        title: title.trim(),
        status: "todo",
        schedule,
        createdAt: now,
        updatedAt: now,
      };

      await db.runAsync(
        `INSERT INTO tasks (
          id, title, status, schedule_type,
          scheduled_date, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          task.id,
          task.title,
          task.status,
          task.schedule.type,
          task.schedule.type === "date" ? task.schedule.date : null,
          task.createdAt,
          task.updatedAt,
        ],
      );

      return task;
    },

    async toggleTask(task: Task): Promise<Task> {
      const isDone = task.status === "done";
      const now = new Date().toISOString();
      const updatedTask: Task = {
        ...task,
        status: isDone ? "todo" : "done",
        completedAt: isDone ? undefined : now,
        updatedAt: now,
      };

      const result = await db.runAsync(
        `UPDATE tasks
         SET status = ?, completed_at = ?, updated_at = ?
         WHERE id = ? AND deleted_at IS NULL`,
        [
          updatedTask.status,
          updatedTask.completedAt ?? null,
          updatedTask.updatedAt,
          updatedTask.id,
        ],
      );

      if (result.changes === 0) {
        throw new Error(`Task ${task.id} was not found`);
      }

      return updatedTask;
    },
  };
}
