import type { Task } from "../../model/types";
import { createTaskLoader, type TaskLoadState } from "../task-loader";

function createTask(id: string, title = `Task ${id}`): Task {
  return {
    id,
    title,
    status: "todo",
    schedule: { type: "inbox" },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

function setup() {
  const requests: { taskId: string; deferred: Deferred<Task | null> }[] = [];
  const states: TaskLoadState[] = [];
  const fetchTask = jest.fn((taskId: string) => {
    const deferred = createDeferred<Task | null>();
    requests.push({ taskId, deferred });
    return deferred.promise;
  });
  const onError = jest.fn();
  const loader = createTaskLoader({
    fetchTask,
    onError,
    onStateChange: (state) => states.push(state),
  });

  return { fetchTask, loader, onError, requests, states };
}

describe("createTaskLoader", () => {
  test("reports loading and then ready for an existing task", async () => {
    const { loader, requests, states } = setup();
    const task = createTask("task-1");

    const loading = loader.load("task-1");
    expect(states).toEqual([{ status: "loading", taskId: "task-1" }]);

    requests[0].deferred.resolve(task);
    await loading;

    expect(states).toEqual([
      { status: "loading", taskId: "task-1" },
      { status: "ready", taskId: "task-1", task },
    ]);
  });

  test("reports not-found only when the repository returns no task", async () => {
    const { loader, onError, requests, states } = setup();

    const loading = loader.load("missing");
    requests[0].deferred.resolve(null);
    await loading;

    expect(states.at(-1)).toEqual({ status: "not-found", taskId: "missing" });
    expect(onError).not.toHaveBeenCalled();
  });

  test("reports an error, not not-found, when the SQLite read fails", async () => {
    const { loader, onError, requests, states } = setup();
    const error = new Error("database is locked");

    const loading = loader.load("task-1");
    requests[0].deferred.reject(error);
    await loading;

    expect(states.at(-1)).toEqual({
      status: "error",
      taskId: "task-1",
      error,
    });
    expect(states.some((state) => state.status === "not-found")).toBe(false);
    expect(onError).toHaveBeenCalledWith(error, "task-1");
  });

  test("treats a synchronous repository throw as a load error", async () => {
    const states: TaskLoadState[] = [];
    const error = new Error("no database");
    const loader = createTaskLoader({
      fetchTask: () => {
        throw error;
      },
      onStateChange: (state) => states.push(state),
    });

    await loader.load("task-1");

    expect(states.at(-1)).toEqual({ status: "error", taskId: "task-1", error });
  });

  test("retry after a failure performs a fresh read and becomes ready", async () => {
    const { fetchTask, loader, requests, states } = setup();
    const task = createTask("task-1");

    const firstLoad = loader.load("task-1");
    requests[0].deferred.reject(new Error("disk I/O error"));
    await firstLoad;

    const retry = loader.load("task-1");
    expect(fetchTask).toHaveBeenCalledTimes(2);
    expect(states.at(-1)).toEqual({ status: "loading", taskId: "task-1" });

    requests[1].deferred.resolve(task);
    await retry;

    expect(states.at(-1)).toEqual({ status: "ready", taskId: "task-1", task });
  });

  test("repeated retry taps while a read is in flight issue one request", async () => {
    const { fetchTask, loader, requests, states } = setup();
    const task = createTask("task-1");

    const firstLoad = loader.load("task-1");
    requests[0].deferred.reject(new Error("disk I/O error"));
    await firstLoad;

    const retries = [
      loader.load("task-1"),
      loader.load("task-1"),
      loader.load("task-1"),
    ];

    expect(fetchTask).toHaveBeenCalledTimes(2);
    expect(
      states.filter((state) => state.status === "loading"),
    ).toHaveLength(2);

    requests[1].deferred.resolve(task);
    await Promise.all(retries);

    expect(
      states.filter((state) => state.status === "ready"),
    ).toHaveLength(1);
  });

  test("a stale response for a previous task does not overwrite a newer one", async () => {
    const { loader, requests, states } = setup();
    const taskA = createTask("task-a");
    const taskB = createTask("task-b");

    const loadA = loader.load("task-a");
    const loadB = loader.load("task-b");

    requests[1].deferred.resolve(taskB);
    await loadB;
    requests[0].deferred.resolve(taskA);
    await loadA;

    expect(states.at(-1)).toEqual({
      status: "ready",
      taskId: "task-b",
      task: taskB,
    });
    expect(states.some((state) => state.status === "ready" && state.task === taskA)).toBe(false);
  });

  test("a stale failure does not overwrite a newer successful result", async () => {
    const { loader, requests, states } = setup();
    const taskB = createTask("task-b");

    const loadA = loader.load("task-a");
    const loadB = loader.load("task-b");

    requests[1].deferred.resolve(taskB);
    await loadB;
    requests[0].deferred.reject(new Error("late failure"));
    await loadA;

    expect(states.at(-1)).toEqual({
      status: "ready",
      taskId: "task-b",
      task: taskB,
    });
  });

  test("an earlier request resolving after a later retry for the same task is ignored", async () => {
    const { loader, requests, states } = setup();
    const staleTask = createTask("task-1", "Stale title");
    const freshTask = createTask("task-1", "Fresh title");

    const loadA = loader.load("task-a");
    const loadOne = loader.load("task-1");
    const loadAAgain = loader.load("task-a");
    const loadOneAgain = loader.load("task-1");

    requests[3].deferred.resolve(freshTask);
    await loadOneAgain;
    requests[1].deferred.resolve(staleTask);
    requests[0].deferred.resolve(null);
    requests[2].deferred.resolve(null);
    await Promise.all([loadA, loadOne, loadAAgain]);

    expect(states.at(-1)).toEqual({
      status: "ready",
      taskId: "task-1",
      task: freshTask,
    });
  });

  test("does not report results after dispose (unmount during loading)", async () => {
    const { fetchTask, loader, requests, states } = setup();

    const loading = loader.load("task-1");
    loader.dispose();
    requests[0].deferred.resolve(createTask("task-1"));
    await loading;

    expect(states).toEqual([{ status: "loading", taskId: "task-1" }]);

    await loader.load("task-1");
    expect(fetchTask).toHaveBeenCalledTimes(1);
  });

  test("does not report a failure after dispose", async () => {
    const { loader, onError, requests, states } = setup();
    const error = new Error("late failure");

    const loading = loader.load("task-1");
    loader.dispose();
    requests[0].deferred.reject(error);
    await loading;

    expect(states).toEqual([{ status: "loading", taskId: "task-1" }]);
    // The failure is still logged rather than silently swallowed.
    expect(onError).toHaveBeenCalledWith(error, "task-1");
  });
});
