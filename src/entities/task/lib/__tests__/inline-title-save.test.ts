import { createSingleFlight } from "../../../../shared/lib/single-flight";
import type { Task } from "../../model/types";
import {
  getInlineTitleSaveMessage,
  isInlineTitleSaveSuccessful,
  saveInlineTaskTitle,
  TASK_BUSY_MESSAGE,
  type TaskBusyTracker,
} from "../inline-title-save";

const task: Task = {
  id: "task-1",
  title: "Original title",
  status: "todo",
  schedule: { type: "inbox" },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function createBusyTracker(initiallyBusy: string[] = []) {
  const busy = new Set(initiallyBusy);
  const tracker: TaskBusyTracker = {
    isBusy: (taskId) => busy.has(taskId),
    begin: jest.fn((taskId: string) => {
      busy.add(taskId);
    }),
    end: jest.fn((taskId: string) => {
      busy.delete(taskId);
    }),
  };

  return { busy, tracker };
}

function createDeferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });

  return { promise, resolve };
}

describe("saveInlineTaskTitle", () => {
  test("persists a changed title and releases the busy mark", async () => {
    const { busy, tracker } = createBusyTracker();
    const persistTitle = jest.fn(async () => {
      expect(busy.has("task-1")).toBe(true);
    });

    const result = await saveInlineTaskTitle({
      task,
      nextTitle: "  New title  ",
      busyTasks: tracker,
      persistTitle,
    });

    expect(result).toEqual({ status: "saved", title: "New title" });
    expect(persistTitle).toHaveBeenCalledWith(task, "New title");
    expect(busy.has("task-1")).toBe(false);
    expect(getInlineTitleSaveMessage(result)).toBeNull();
  });

  test("reports busy without writing while another operation owns the task", async () => {
    const { tracker } = createBusyTracker(["task-1"]);
    const persistTitle = jest.fn(async () => undefined);

    const result = await saveInlineTaskTitle({
      task,
      nextTitle: "New title",
      busyTasks: tracker,
      persistTitle,
    });

    expect(result).toEqual({ status: "busy" });
    expect(persistTitle).not.toHaveBeenCalled();
    expect(tracker.begin).not.toHaveBeenCalled();
    expect(tracker.end).not.toHaveBeenCalled();
    expect(isInlineTitleSaveSuccessful(result)).toBe(false);
    expect(getInlineTitleSaveMessage(result)).toBe(TASK_BUSY_MESSAGE);
  });

  test("distinguishes a SQLite failure from a busy task", async () => {
    const { busy, tracker } = createBusyTracker();
    const error = new Error("database is locked");

    const result = await saveInlineTaskTitle({
      task,
      nextTitle: "New title",
      busyTasks: tracker,
      persistTitle: async () => {
        throw error;
      },
    });

    expect(result).toEqual({ status: "failed", error });
    expect(getInlineTitleSaveMessage(result)).toBe(
      "Could not update task title",
    );
    expect(busy.has("task-1")).toBe(false);
  });

  test("keeps the existing empty-title and unchanged-title behavior", async () => {
    const { tracker } = createBusyTracker(["task-1"]);
    const persistTitle = jest.fn(async () => undefined);

    const empty = await saveInlineTaskTitle({
      task,
      nextTitle: "   ",
      busyTasks: tracker,
      persistTitle,
    });
    const unchanged = await saveInlineTaskTitle({
      task,
      nextTitle: " Original title ",
      busyTasks: tracker,
      persistTitle,
    });

    expect(getInlineTitleSaveMessage(empty)).toBe("Task title cannot be empty");
    expect(unchanged).toEqual({ status: "unchanged" });
    expect(isInlineTitleSaveSuccessful(unchanged)).toBe(true);
    expect(persistTitle).not.toHaveBeenCalled();
  });

  test("a second save while the first is writing reports busy instead of writing concurrently", async () => {
    const { tracker } = createBusyTracker();
    const write = createDeferred();
    const persistTitle = jest.fn(() => write.promise);

    const first = saveInlineTaskTitle({
      task,
      nextTitle: "First",
      busyTasks: tracker,
      persistTitle,
    });
    const second = await saveInlineTaskTitle({
      task,
      nextTitle: "Second",
      busyTasks: tracker,
      persistTitle,
    });

    expect(second).toEqual({ status: "busy" });
    write.resolve();
    await expect(first).resolves.toEqual({ status: "saved", title: "First" });
    expect(persistTitle).toHaveBeenCalledTimes(1);
  });
});

describe("opening Task Details while the task is busy", () => {
  // Mirrors the TaskCard + Tasks screen wiring: the card shares one save
  // attempt (single flight), releases a settled attempt on press-in, and
  // navigates only when the save reports success.
  function setup(initiallyBusy: string[]) {
    const { busy, tracker } = createBusyTracker(initiallyBusy);
    const flight = createSingleFlight<boolean>();
    const persistTitle = jest.fn(async () => undefined);
    const navigate = jest.fn();
    const messages: (string | null)[] = [];
    const draft = "Unsaved draft";
    let isOpening = false;

    const onSaveTitle = async () => {
      const result = await saveInlineTaskTitle({
        task,
        nextTitle: draft,
        busyTasks: tracker,
        persistTitle,
      });

      messages.push(getInlineTitleSaveMessage(result));
      return isInlineTitleSaveSuccessful(result);
    };

    const pressOpen = async () => {
      flight.releaseSettled();
      if (isOpening) return;
      isOpening = true;

      try {
        if (await flight.run(onSaveTitle)) navigate();
      } finally {
        isOpening = false;
      }
    };

    return { busy, messages, navigate, persistTitle, pressOpen };
  }

  test("blocks navigation with a visible busy message and keeps the draft", async () => {
    const card = setup(["task-1"]);

    await card.pressOpen();

    expect(card.navigate).not.toHaveBeenCalled();
    expect(card.persistTitle).not.toHaveBeenCalled();
    expect(card.messages).toEqual([TASK_BUSY_MESSAGE]);
  });

  test("retrying after the busy operation finishes saves the draft and navigates once", async () => {
    const card = setup(["task-1"]);

    await card.pressOpen();
    card.busy.delete("task-1");
    await Promise.all([card.pressOpen(), card.pressOpen()]);

    expect(card.persistTitle).toHaveBeenCalledTimes(1);
    expect(card.persistTitle).toHaveBeenCalledWith(task, "Unsaved draft");
    expect(card.navigate).toHaveBeenCalledTimes(1);
    expect(card.messages.at(-1)).toBeNull();
  });
});
