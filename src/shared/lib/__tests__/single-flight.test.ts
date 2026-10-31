import { createDebouncedAction } from "../debounced-action";
import { createSingleFlight } from "../single-flight";

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

async function flushMicrotasks() {
  for (let index = 0; index < 5; index += 1) {
    await Promise.resolve();
  }
}

describe("createSingleFlight", () => {
  test("joins an in-flight attempt instead of starting a duplicate", async () => {
    const flight = createSingleFlight<boolean>();
    const deferred = createDeferred<boolean>();
    const attempt = jest.fn(() => deferred.promise);

    const first = flight.run(attempt);
    const second = flight.run(attempt);
    flight.releaseSettled();
    const third = flight.run(attempt);

    expect(attempt).toHaveBeenCalledTimes(1);

    deferred.resolve(true);
    await expect(Promise.all([first, second, third])).resolves.toEqual([
      true,
      true,
      true,
    ]);
  });

  test("reuses a settled attempt until it is released", async () => {
    const flight = createSingleFlight<boolean>();
    const attempt = jest.fn(async () => false);

    await flight.run(attempt);
    await flight.run(attempt);
    expect(attempt).toHaveBeenCalledTimes(1);

    flight.releaseSettled();
    await flight.run(attempt);
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  test("converts a synchronous throw into a rejected attempt", async () => {
    const flight = createSingleFlight<boolean>();

    await expect(
      flight.run(() => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
  });

  test("an older attempt settling late does not release a newer in-flight one", async () => {
    const flight = createSingleFlight<boolean>();
    const older = createDeferred<boolean>();
    const newer = createDeferred<boolean>();
    const attempt = jest
      .fn<Promise<boolean>, []>()
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(newer.promise);

    void flight.run(attempt);
    flight.reset();
    const newerRun = flight.run(attempt);

    older.resolve(false);
    await flushMicrotasks();
    flight.releaseSettled();

    expect(flight.run(attempt)).toBe(newerRun);
    expect(attempt).toHaveBeenCalledTimes(2);

    newer.resolve(true);
    await expect(newerRun).resolves.toBe(true);
  });
});

describe("inline title save before opening details", () => {
  // Mirrors the TaskCard wiring: blur defers a save to the next tick, while
  // opening details saves immediately and cancels the deferred save.
  function setup(results: boolean[]) {
    const flight = createSingleFlight<boolean>();
    const blurSave = createDebouncedAction(0);
    const savedDrafts: string[] = [];
    let draft = "";
    const persist = jest.fn(async () => {
      savedDrafts.push(draft);
      return results.shift() ?? true;
    });
    const save = () => {
      blurSave.cancel();
      return flight.run(persist);
    };

    return {
      blur: () => blurSave.schedule(() => void save()),
      pressInOpen: () => flight.releaseSettled(),
      open: save,
      setDraft: (value: string) => {
        draft = value;
      },
      persist,
      savedDrafts,
    };
  }

  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test("opening before the blur timer fires saves the latest draft once", async () => {
    const card = setup([true]);

    card.setDraft("Edited title");
    card.pressInOpen();
    card.blur();

    await expect(card.open()).resolves.toBe(true);
    jest.runAllTimers();

    expect(card.persist).toHaveBeenCalledTimes(1);
    expect(card.savedDrafts).toEqual(["Edited title"]);
  });

  test("opening after the blur save started joins it instead of saving twice", async () => {
    const card = setup([true]);

    card.setDraft("Edited title");
    card.pressInOpen();
    card.blur();
    jest.runAllTimers();

    await expect(card.open()).resolves.toBe(true);
    expect(card.persist).toHaveBeenCalledTimes(1);
  });

  test("a failed save blocks navigation and the next press retries the same draft", async () => {
    const card = setup([false, true]);

    card.setDraft("Edited title");
    card.pressInOpen();
    card.blur();
    await expect(card.open()).resolves.toBe(false);

    card.pressInOpen();
    await expect(card.open()).resolves.toBe(true);

    expect(card.savedDrafts).toEqual(["Edited title", "Edited title"]);
  });
});
