import type { Task } from "../model/types";

export type TaskLoadState =
  | { status: "loading"; taskId: string }
  | { status: "ready"; taskId: string; task: Task }
  | { status: "not-found"; taskId: string }
  | { status: "error"; taskId: string; error: unknown };

export interface TaskLoader {
  /**
   * Starts a fresh read for `taskId`. A call for the task that is already
   * being read joins that request instead of starting a duplicate one. A call
   * for a different task supersedes the current request.
   */
  load: (taskId: string) => Promise<void>;
  /** Ignores every pending and future result, e.g. when the screen unmounts. */
  dispose: () => void;
}

interface TaskLoaderOptions {
  fetchTask: (taskId: string) => Promise<Task | null>;
  onStateChange: (state: TaskLoadState) => void;
  onError?: (error: unknown, taskId: string) => void;
}

export function createTaskLoader({
  fetchTask,
  onStateChange,
  onError,
}: TaskLoaderOptions): TaskLoader {
  let latestRequestId = 0;
  let inFlight: { taskId: string; promise: Promise<void> } | null = null;
  let disposed = false;

  return {
    load(taskId) {
      if (disposed) return Promise.resolve();

      if (inFlight?.taskId === taskId) {
        return inFlight.promise;
      }

      const requestId = ++latestRequestId;
      const isCurrent = () => !disposed && requestId === latestRequestId;

      onStateChange({ status: "loading", taskId });

      const promise = (async () => {
        let nextState: TaskLoadState;

        try {
          const task = await fetchTask(taskId);

          nextState = task
            ? { status: "ready", taskId, task }
            : { status: "not-found", taskId };
        } catch (error) {
          onError?.(error, taskId);
          nextState = { status: "error", taskId, error };
        }

        if (isCurrent()) {
          onStateChange(nextState);
        }
      })().finally(() => {
        if (inFlight?.promise === promise) {
          inFlight = null;
        }
      });

      inFlight = { taskId, promise };
      return promise;
    },
    dispose() {
      disposed = true;
      inFlight = null;
    },
  };
}
