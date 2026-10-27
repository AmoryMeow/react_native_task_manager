import { createDebouncedAction } from "../debounced-action";

describe("createDebouncedAction", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("runs the scheduled action after the debounce delay", () => {
    const action = jest.fn();
    const debounce = createDebouncedAction(500);

    debounce.schedule(action);
    jest.advanceTimersByTime(499);
    expect(action).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(action).toHaveBeenCalledTimes(1);
  });

  test("continued activity resets the debounce delay", () => {
    const action = jest.fn();
    const debounce = createDebouncedAction(500);

    debounce.schedule(action);
    jest.advanceTimersByTime(400);
    debounce.schedule(action);
    jest.advanceTimersByTime(499);
    expect(action).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(action).toHaveBeenCalledTimes(1);
  });

  test("only runs the newest scheduled action", () => {
    const olderAction = jest.fn();
    const newestAction = jest.fn();
    const debounce = createDebouncedAction(500);

    debounce.schedule(olderAction);
    debounce.schedule(newestAction);
    jest.advanceTimersByTime(500);

    expect(olderAction).not.toHaveBeenCalled();
    expect(newestAction).toHaveBeenCalledTimes(1);
  });

  test("flush runs a pending action immediately without a later duplicate", () => {
    const action = jest.fn();
    const debounce = createDebouncedAction(500);

    debounce.schedule(action);

    expect(debounce.flush()).toBe(true);
    expect(action).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(500);
    expect(action).toHaveBeenCalledTimes(1);
    expect(debounce.flush()).toBe(false);
  });

  test("does nothing when no action has been scheduled", () => {
    const debounce = createDebouncedAction(500);

    jest.advanceTimersByTime(1_000);

    expect(debounce.flush()).toBe(false);
  });

  test("cancel discards a pending timer without treating it as a flush", () => {
    const action = jest.fn();
    const debounce = createDebouncedAction(500);

    debounce.schedule(action);
    debounce.cancel();
    jest.advanceTimersByTime(500);

    expect(action).not.toHaveBeenCalled();
    expect(debounce.flush()).toBe(false);
  });

  test("a later intentional edit can schedule another action", () => {
    const firstAction = jest.fn();
    const retryAfterEdit = jest.fn();
    const debounce = createDebouncedAction(500);

    debounce.schedule(firstAction);
    jest.advanceTimersByTime(500);
    debounce.schedule(retryAfterEdit);
    jest.advanceTimersByTime(500);

    expect(firstAction).toHaveBeenCalledTimes(1);
    expect(retryAfterEdit).toHaveBeenCalledTimes(1);
  });
});
