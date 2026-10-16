export type TaskSchedule =
  | { type: "inbox" }
  | { type: "date"; date: string }
  | { type: "soon" }
  | { type: "someday" };

export type TaskStatus = "todo" | "in_progress" | "done";

export interface Task {
  id: string;
  title: string;
  description?: string;

  status: TaskStatus;
  schedule: TaskSchedule;

  dueAt?: string;

  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}
