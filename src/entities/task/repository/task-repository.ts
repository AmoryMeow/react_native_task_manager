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

interface ScheduleColumns {
  schedule: TaskSchedule;
  scheduleType: TaskSchedule["type"];
  scheduledDate: string | null;
}

function isValidLocalDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsedDate = new Date(`${value}T00:00:00.000Z`);

  return (
    year >= 1 &&
    !Number.isNaN(parsedDate.getTime()) &&
    parsedDate.getUTCFullYear() === year &&
    parsedDate.getUTCMonth() + 1 === month &&
    parsedDate.getUTCDate() === day
  );
}

function getScheduleColumns(schedule: TaskSchedule): ScheduleColumns {
  const type = (schedule as { type?: unknown } | null)?.type;

  switch (type) {
    case "date": {
      const date = (schedule as { date?: unknown }).date;

      if (typeof date !== "string" || !isValidLocalDate(date)) {
        throw new Error("Task schedule date must be a valid YYYY-MM-DD date");
      }

      return {
        schedule: { type, date },
        scheduleType: type,
        scheduledDate: date,
      };
    }

    case "inbox":
    case "soon":
    case "someday":
      return {
        schedule: { type },
        scheduleType: type,
        scheduledDate: null,
      };

    default:
      throw new Error("Invalid task schedule");
  }
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

    async updateTaskTitle(task: Task, title: string): Promise<Task> {
      const trimmedTitle = title.trim();

      if (!trimmedTitle) {
        throw new Error("Task title cannot be empty");
      }

      const currentTask = await db.getFirstAsync<
        Pick<TaskRow, "title" | "updated_at">
      >(
        `SELECT title, updated_at
         FROM tasks
         WHERE id = ? AND deleted_at IS NULL`,
        [task.id],
      );

      if (!currentTask) {
        throw new Error(`Task ${task.id} was not found`);
      }

      if (currentTask.title === trimmedTitle) {
        return {
          ...task,
          title: currentTask.title,
          updatedAt: currentTask.updated_at,
        };
      }

      const updatedAt = new Date().toISOString();
      const result = await db.runAsync(
        `UPDATE tasks
         SET title = ?, updated_at = ?
         WHERE id = ? AND deleted_at IS NULL`,
        [trimmedTitle, updatedAt, task.id],
      );

      if (result.changes === 0) {
        throw new Error(`Task ${task.id} was not found`);
      }

      return {
        ...task,
        title: trimmedTitle,
        updatedAt,
      };
    },

    async updateTaskSchedule(
      taskId: string,
      schedule: TaskSchedule,
    ): Promise<Task> {
      const {
        schedule: normalizedSchedule,
        scheduleType,
        scheduledDate,
      } = getScheduleColumns(schedule);

      const currentTask = await db.getFirstAsync<TaskRow>(
        `SELECT * FROM tasks
         WHERE id = ? AND deleted_at IS NULL`,
        [taskId],
      );

      if (!currentTask) {
        throw new Error(`Task ${taskId} was not found`);
      }

      if (
        currentTask.schedule_type === scheduleType &&
        currentTask.scheduled_date === scheduledDate
      ) {
        return mapTask(currentTask);
      }

      const updatedAt = new Date().toISOString();
      const result = await db.runAsync(
        `UPDATE tasks
         SET schedule_type = ?, scheduled_date = ?, updated_at = ?
         WHERE id = ? AND deleted_at IS NULL`,
        [scheduleType, scheduledDate, updatedAt, taskId],
      );

      if (result.changes === 0) {
        throw new Error(`Task ${taskId} was not found`);
      }

      return {
        ...mapTask(currentTask),
        schedule: normalizedSchedule,
        updatedAt,
      };
    },

    async moveTaskToSchedule(
      taskId: string,
      schedule: TaskSchedule,
    ): Promise<Task> {
      const {
        schedule: normalizedSchedule,
        scheduleType,
        scheduledDate,
      } = getScheduleColumns(schedule);

      const currentTask = await db.getFirstAsync<TaskRow>(
        `SELECT * FROM tasks
         WHERE id = ? AND deleted_at IS NULL`,
        [taskId],
      );

      if (!currentTask) {
        throw new Error(`Task ${taskId} was not found`);
      }

      const shouldReopen = currentTask.status === "done";

      if (
        !shouldReopen &&
        currentTask.schedule_type === scheduleType &&
        currentTask.scheduled_date === scheduledDate
      ) {
        return mapTask(currentTask);
      }

      const updatedAt = new Date().toISOString();
      const status = shouldReopen ? "todo" : currentTask.status;
      const completedAt = shouldReopen ? null : currentTask.completed_at;
      const result = await db.runAsync(
        `UPDATE tasks
         SET schedule_type = ?, scheduled_date = ?, status = ?,
             completed_at = ?, updated_at = ?
         WHERE id = ? AND deleted_at IS NULL`,
        [scheduleType, scheduledDate, status, completedAt, updatedAt, taskId],
      );

      if (result.changes === 0) {
        throw new Error(`Task ${taskId} was not found`);
      }

      return {
        ...mapTask(currentTask),
        status,
        schedule: normalizedSchedule,
        completedAt: completedAt ?? undefined,
        updatedAt,
      };
    },

    async deleteTask(id: string): Promise<string> {
      const now = new Date().toISOString();

      const result = await db.runAsync(
        `UPDATE tasks
         SET deleted_at = ?, updated_at = ?
         WHERE id = ? AND deleted_at IS NULL`,
        [now, now, id],
      );

      if (result.changes === 0) {
        throw new Error(`Task ${id} was not found`);
      }

      return id;
    },

    async restoreTask(task: Task): Promise<Task> {
      const now = new Date().toISOString();
      const restoredTask: Task = {
        ...task,
        updatedAt: now,
      };

      const result = await db.runAsync(
        `UPDATE tasks
         SET deleted_at = NULL, updated_at = ?
         WHERE id = ? AND deleted_at IS NOT NULL`,
        [restoredTask.updatedAt, restoredTask.id],
      );

      if (result.changes === 0) {
        throw new Error(`Task ${task.id} was not found`);
      }

      return restoredTask;
    },
  };
}
