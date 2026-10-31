import * as Crypto from "expo-crypto";
import type { SQLiteDatabase } from "expo-sqlite";

import {
  endFocusSession,
  pauseFocusSession,
  resumeFocusSession,
  startFocusSession,
  type FocusSession,
  type FocusSessionStatus,
} from "../model/focus-session";

interface FocusSessionRow {
  id: string;
  task_id: string;
  status: FocusSessionStatus;
  started_at: number;
  ended_at: number | null;
  accumulated_ms: number;
  active_segment_started_at: number | null;
  updated_at: number;
  version: number;
}

export class FocusSessionConflictError extends Error {
  constructor(
    message: string,
    /** The unfinished session that blocked the operation, if known. */
    readonly unfinishedSession: FocusSession | null = null,
  ) {
    super(message);
    this.name = "FocusSessionConflictError";
  }
}

export class FocusSessionNotFoundError extends Error {
  constructor(readonly sessionId: string) {
    super(`Focus session ${sessionId} was not found`);
    this.name = "FocusSessionNotFoundError";
  }
}

const ONE_UNFINISHED_INDEX = "focus_sessions_one_unfinished";
// Concurrent writers retry from fresh state; a no-op transition then succeeds.
const MAX_WRITE_ATTEMPTS = 3;

function mapSession(row: FocusSessionRow): FocusSession {
  return {
    id: row.id,
    taskId: row.task_id,
    status: row.status,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    accumulatedMs: row.accumulated_ms,
    activeSegmentStartedAt: row.active_segment_started_at,
    updatedAt: row.updated_at,
  };
}

function isOneUnfinishedViolation(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);

  return (
    message.includes("UNIQUE constraint failed") &&
    message.includes(ONE_UNFINISHED_INDEX)
  );
}

export function createFocusSessionRepository(
  db: SQLiteDatabase,
  { createId = () => Crypto.randomUUID() }: { createId?: () => string } = {},
) {
  async function getRow(sessionId: string) {
    return db.getFirstAsync<FocusSessionRow>(
      `SELECT * FROM focus_sessions WHERE id = ?`,
      [sessionId],
    );
  }

  async function getUnfinishedSession(): Promise<FocusSession | null> {
    const row = await db.getFirstAsync<FocusSessionRow>(
      `SELECT * FROM focus_sessions
       WHERE status IN ('active', 'paused')
       LIMIT 1`,
    );

    return row ? mapSession(row) : null;
  }

  async function transition(
    sessionId: string,
    apply: (session: FocusSession) => FocusSession,
  ): Promise<FocusSession> {
    for (let attempt = 1; attempt <= MAX_WRITE_ATTEMPTS; attempt += 1) {
      const row = await getRow(sessionId);

      if (!row) throw new FocusSessionNotFoundError(sessionId);

      const current = mapSession(row);
      const next = apply(current);

      if (next === current) return current;

      // Compare-and-swap on version: a single atomic statement, so no
      // interleaved query can slip between the read and the write.
      const result = await db.runAsync(
        `UPDATE focus_sessions
         SET status = ?,
             ended_at = ?,
             accumulated_ms = ?,
             active_segment_started_at = ?,
             updated_at = ?,
             version = version + 1
         WHERE id = ? AND version = ?`,
        [
          next.status,
          next.endedAt,
          next.accumulatedMs,
          next.activeSegmentStartedAt,
          next.updatedAt,
          sessionId,
          row.version,
        ],
      );

      if (result.changes === 1) return next;
    }

    throw new FocusSessionConflictError(
      `Focus session ${sessionId} kept changing; try again`,
    );
  }

  return {
    getUnfinishedSession,

    async getSession(sessionId: string): Promise<FocusSession | null> {
      const row = await getRow(sessionId);
      return row ? mapSession(row) : null;
    },

    async getSessionsForTask(taskId: string): Promise<FocusSession[]> {
      const rows = await db.getAllAsync<FocusSessionRow>(
        `SELECT * FROM focus_sessions
         WHERE task_id = ?
         ORDER BY started_at ASC, id ASC`,
        [taskId],
      );

      return rows.map(mapSession);
    },

    /**
     * Starts an active session for an existing, non-deleted task. Rejects with
     * FocusSessionConflictError (carrying the existing session) if another
     * session is still active or paused; it is never overwritten.
     */
    async startSession(
      taskId: string,
      now: number = Date.now(),
    ): Promise<FocusSession> {
      const session = startFocusSession({ id: createId(), taskId, now });
      let changes: number;

      try {
        // Inserting from the tasks table makes the existence check and the
        // write one atomic statement.
        const result = await db.runAsync(
          `INSERT INTO focus_sessions (
             id, task_id, status, started_at, ended_at, accumulated_ms,
             active_segment_started_at, updated_at
           )
           SELECT ?, id, ?, ?, NULL, ?, ?, ?
           FROM tasks
           WHERE id = ? AND deleted_at IS NULL`,
          [
            session.id,
            session.status,
            session.startedAt,
            session.accumulatedMs,
            session.activeSegmentStartedAt,
            session.updatedAt,
            taskId,
          ],
        );
        changes = result.changes;
      } catch (error) {
        if (!isOneUnfinishedViolation(error)) throw error;

        const unfinished = await getUnfinishedSession();
        throw new FocusSessionConflictError(
          "Another focus session is still active or paused",
          unfinished,
        );
      }

      if (changes === 0) {
        throw new Error(`Task ${taskId} was not found`);
      }

      return session;
    },

    pauseSession(sessionId: string, now: number = Date.now()) {
      return transition(sessionId, (session) =>
        pauseFocusSession(session, now),
      );
    },

    resumeSession(sessionId: string, now: number = Date.now()) {
      return transition(sessionId, (session) =>
        resumeFocusSession(session, now),
      );
    },

    endSession(sessionId: string, now: number = Date.now()) {
      return transition(sessionId, (session) => endFocusSession(session, now));
    },
  };
}
