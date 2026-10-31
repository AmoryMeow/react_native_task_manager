/**
 * Focus sessions record how long a task was actively focused on.
 *
 * All timestamps are Unix epoch milliseconds. Durations are derived from
 * persisted timestamps, never from a ticking counter, so a session survives
 * the app being suspended or terminated without any background work.
 */
export type FocusSessionStatus = "active" | "paused" | "completed";

export interface FocusSession {
  id: string;
  taskId: string;
  status: FocusSessionStatus;
  startedAt: number;
  /** Set only when completed. */
  endedAt: number | null;
  /** Focus time from finished active segments (excludes paused time). */
  accumulatedMs: number;
  /** Start of the running segment; set only while active. */
  activeSegmentStartedAt: number | null;
  /** Time of the last lifecycle change. */
  updatedAt: number;
}

export type FocusSessionAction = "pause" | "resume" | "end";

export class FocusSessionTransitionError extends Error {
  constructor(
    readonly sessionId: string,
    readonly status: FocusSessionStatus,
    readonly action: FocusSessionAction,
  ) {
    super(`Cannot ${action} focus session ${sessionId}: it is ${status}`);
    this.name = "FocusSessionTransitionError";
  }
}

function assertTimestamp(now: number): void {
  if (!Number.isSafeInteger(now) || now < 0) {
    throw new RangeError(`Invalid timestamp: ${now}`);
  }
}

// A wall clock can move backwards (manual change, NTP sync). Never let a
// transition happen before the previous one, so segments stay ordered and
// recorded focus time can never exceed elapsed time.
function monotonicNow(session: FocusSession, now: number): number {
  assertTimestamp(now);
  return Math.max(now, session.updatedAt);
}

function closeActiveSegment(session: FocusSession, at: number): number {
  return session.activeSegmentStartedAt === null
    ? session.accumulatedMs
    : session.accumulatedMs + (at - session.activeSegmentStartedAt);
}

export function startFocusSession({
  id,
  taskId,
  now,
}: {
  id: string;
  taskId: string;
  now: number;
}): FocusSession {
  assertTimestamp(now);

  return {
    id,
    taskId,
    status: "active",
    startedAt: now,
    endedAt: null,
    accumulatedMs: 0,
    activeSegmentStartedAt: now,
    updatedAt: now,
  };
}

/**
 * Transitions return the same object when nothing changes (pausing a paused
 * session, resuming an active one, ending a completed one), so repeated calls
 * are safe and never count time twice.
 */
export function pauseFocusSession(
  session: FocusSession,
  now: number,
): FocusSession {
  if (session.status === "completed") {
    throw new FocusSessionTransitionError(session.id, session.status, "pause");
  }
  if (session.status === "paused") return session;

  const at = monotonicNow(session, now);

  return {
    ...session,
    status: "paused",
    accumulatedMs: closeActiveSegment(session, at),
    activeSegmentStartedAt: null,
    updatedAt: at,
  };
}

export function resumeFocusSession(
  session: FocusSession,
  now: number,
): FocusSession {
  if (session.status === "completed") {
    throw new FocusSessionTransitionError(session.id, session.status, "resume");
  }
  if (session.status === "active") return session;

  const at = monotonicNow(session, now);

  return {
    ...session,
    status: "active",
    activeSegmentStartedAt: at,
    updatedAt: at,
  };
}

export function endFocusSession(
  session: FocusSession,
  now: number,
  correctedFocusMs?: number,
): FocusSession {
  if (session.status === "completed") {
    if (correctedFocusMs === undefined) return session;
    throw new FocusSessionTransitionError(session.id, session.status, "end");
  }

  const at = monotonicNow(session, now);
  const calculatedMs = closeActiveSegment(session, at);

  if (
    correctedFocusMs !== undefined &&
    (!Number.isSafeInteger(correctedFocusMs) ||
      correctedFocusMs < 0 ||
      correctedFocusMs > calculatedMs)
  ) {
    throw new RangeError(
      `Corrected focus time must be between 0 and ${calculatedMs} ms`,
    );
  }

  return {
    ...session,
    status: "completed",
    endedAt: at,
    accumulatedMs: correctedFocusMs ?? calculatedMs,
    activeSegmentStartedAt: null,
    updatedAt: at,
  };
}

/** Recorded focus time: active segments only, paused time excluded. */
export function getFocusDurationMs(session: FocusSession, now: number): number {
  if (session.status !== "active") return session.accumulatedMs;

  return closeActiveSegment(session, monotonicNow(session, now));
}

/** Wall-clock time since start, including paused time. */
export function getElapsedMs(session: FocusSession, now: number): number {
  const end = session.endedAt ?? monotonicNow(session, now);

  return end - session.startedAt;
}
