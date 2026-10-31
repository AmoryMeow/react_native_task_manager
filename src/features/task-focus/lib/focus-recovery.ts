import {
  getFocusDurationMs,
  type FocusSession,
} from "@/entities/focus-session/model/focus-session";
import type { Task } from "@/entities/task/model/types";

export const LONG_SESSION_REVIEW_MS = 4 * 60 * 60 * 1000;
export const UNAVAILABLE_TASK_TITLE = "Unavailable task";

export interface FocusRecovery {
  session: FocusSession;
  task: Task | null;
}

export async function loadFocusRecovery({
  getUnfinishedSession,
  getTaskById,
}: {
  getUnfinishedSession: () => Promise<FocusSession | null>;
  getTaskById: (taskId: string) => Promise<Task | null>;
}): Promise<FocusRecovery | null> {
  const session = await getUnfinishedSession();

  if (!session) return null;

  return { session, task: await getTaskById(session.taskId) };
}

export function needsDurationReview(session: FocusSession, now: number) {
  return getFocusDurationMs(session, now) > LONG_SESSION_REVIEW_MS;
}

type DurationInputResult =
  { ok: true; ms: number } | { ok: false; error: string };

export function parseDurationInput(
  hoursInput: string,
  minutesInput: string,
  maxMs: number,
): DurationInputResult {
  const hoursText = hoursInput.trim();
  const minutesText = minutesInput.trim();

  if (!/^\d*$/.test(hoursText) || !/^\d*$/.test(minutesText)) {
    return { ok: false, error: "Use whole numbers for hours and minutes." };
  }

  const hours = Number(hoursText || "0");
  const minutes = Number(minutesText || "0");

  if (minutes > 59) {
    return { ok: false, error: "Minutes must be between 0 and 59." };
  }

  const ms = (hours * 60 + minutes) * 60 * 1000;

  if (ms > maxMs) {
    return {
      ok: false,
      error: "Focus time can't be longer than the recorded time.",
    };
  }

  return { ok: true, ms };
}

export function splitDuration(ms: number) {
  const totalMinutes = Math.floor(Math.max(0, ms) / 60_000);

  return {
    hours: Math.floor(totalMinutes / 60),
    minutes: totalMinutes % 60,
  };
}

function isSameLocalDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

export function formatSessionStart(startedAt: number, now: number) {
  const start = new Date(startedAt);
  const time = start
    .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    .replace(/\u202f/g, " ");

  if (isSameLocalDay(start, new Date(now))) return `Started ${time}`;

  const date = start.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(start.getFullYear() !== new Date(now).getFullYear()
      ? { year: "numeric" }
      : {}),
  });

  return `Started ${date}, ${time}`;
}
