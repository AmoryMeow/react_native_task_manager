import type { FocusSession } from "@/entities/focus-session/model/focus-session";
import {
  FocusSessionConflictError,
  type createFocusSessionRepository,
} from "@/entities/focus-session/repository/focus-session-repository";

type FocusSessionRepository = Pick<
  ReturnType<typeof createFocusSessionRepository>,
  | "getUnfinishedSession"
  | "startSession"
  | "pauseSession"
  | "resumeSession"
  | "endSession"
>;

export type FocusSessionState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "none" }
  | { status: "tracking"; session: FocusSession }
  | { status: "conflict"; otherSession: FocusSession }
  | { status: "error"; error: unknown };

export type FocusSessionOperation =
  "init" | "pause" | "resume" | "finish" | "replace";

export interface FocusSessionSnapshot {
  state: FocusSessionState;
  pending: FocusSessionOperation | null;
}

export interface FocusSessionController {
  getSnapshot: () => FocusSessionSnapshot;
  init: (options: { allowStart: boolean }) => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  finish: (alsoWrite?: () => Promise<void>) => Promise<void>;
  replaceOtherSession: () => Promise<void>;
  dispose: () => void;
}

export function createFocusSessionController({
  taskId,
  repository,
  runInTransaction,
  now = Date.now,
  onChange,
}: {
  taskId: string;
  repository: FocusSessionRepository;
  runInTransaction: (task: () => Promise<void>) => Promise<void>;
  now?: () => number;
  onChange: (snapshot: FocusSessionSnapshot) => void;
}): FocusSessionController {
  let snapshot: FocusSessionSnapshot = {
    state: { status: "idle" },
    pending: null,
  };
  let inFlight: Promise<void> | null = null;
  let disposed = false;

  function emit(next: Partial<FocusSessionSnapshot>) {
    if (disposed) return;
    snapshot = { ...snapshot, ...next };
    onChange(snapshot);
  }

  function track(session: FocusSession) {
    emit({ state: { status: "tracking", session } });
  }

  function run(
    operation: FocusSessionOperation,
    task: () => Promise<void>,
  ): Promise<void> {
    if (inFlight) {
      if (snapshot.pending === operation) return inFlight;

      return inFlight.then(
        () => run(operation, task),
        () => run(operation, task),
      );
    }

    emit({ pending: operation });
    const promise = task().finally(() => {
      inFlight = null;
      emit({ pending: null });
    });
    inFlight = promise;

    return promise;
  }

  function attach(unfinished: FocusSession) {
    if (unfinished.taskId === taskId) {
      track(unfinished);
    } else {
      emit({ state: { status: "conflict", otherSession: unfinished } });
    }
  }

  function trackedUnfinished(): FocusSession | null {
    const { state } = snapshot;

    return state.status === "tracking" && state.session.status !== "completed"
      ? state.session
      : null;
  }

  return {
    getSnapshot: () => snapshot,

    init({ allowStart }) {
      const { status } = snapshot.state;
      if (status !== "idle" && status !== "error") return Promise.resolve();

      return run("init", async () => {
        emit({ state: { status: "loading" } });

        try {
          let unfinished = await repository.getUnfinishedSession();

          if (!unfinished && allowStart) {
            try {
              track(await repository.startSession(taskId, now()));
              return;
            } catch (error) {
              if (!(error instanceof FocusSessionConflictError)) throw error;
              unfinished =
                error.unfinishedSession ??
                (await repository.getUnfinishedSession());
            }
          }

          if (unfinished) attach(unfinished);
          else emit({ state: { status: "none" } });
        } catch (error) {
          emit({ state: { status: "error", error } });
          throw error;
        }
      });
    },

    pause() {
      return run("pause", async () => {
        const session = trackedUnfinished();
        if (session) track(await repository.pauseSession(session.id, now()));
      });
    },

    resume() {
      return run("resume", async () => {
        const session = trackedUnfinished();
        if (session) track(await repository.resumeSession(session.id, now()));
      });
    },

    finish(alsoWrite) {
      return run("finish", async () => {
        const session = trackedUnfinished();
        let ended = null as FocusSession | null;

        await runInTransaction(async () => {
          if (session) ended = await repository.endSession(session.id, now());
          await alsoWrite?.();
        });

        if (ended) track(ended);
      });
    },

    replaceOtherSession() {
      return run("replace", async () => {
        const { state } = snapshot;
        if (state.status !== "conflict") return;

        let started = null as FocusSession | null;

        await runInTransaction(async () => {
          await repository.endSession(state.otherSession.id, now());
          started = await repository.startSession(taskId, now());
        });

        if (started) track(started);
      });
    },

    dispose() {
      disposed = true;
    },
  };
}
