import {
  endFocusSession,
  FocusSessionTransitionError,
  getElapsedMs,
  getFocusDurationMs,
  pauseFocusSession,
  resumeFocusSession,
  startFocusSession,
} from "../focus-session";

const T0 = 1_800_000_000_000;
const SECOND = 1_000;
const MINUTE = 60 * SECOND;

function start(now = T0) {
  return startFocusSession({ id: "session-1", taskId: "task-1", now });
}

describe("focus session lifecycle", () => {
  test("starts active with no recorded time", () => {
    const session = start();

    expect(session).toEqual({
      id: "session-1",
      taskId: "task-1",
      status: "active",
      startedAt: T0,
      endedAt: null,
      accumulatedMs: 0,
      activeSegmentStartedAt: T0,
      updatedAt: T0,
    });
    expect(getFocusDurationMs(session, T0)).toBe(0);
  });

  test("counts active time live from the segment start", () => {
    const session = start();

    expect(getFocusDurationMs(session, T0 + 5 * MINUTE)).toBe(5 * MINUTE);
    expect(getElapsedMs(session, T0 + 5 * MINUTE)).toBe(5 * MINUTE);
  });

  test("start, pause, resume, end records only active time", () => {
    let session = start();
    session = pauseFocusSession(session, T0 + 10 * MINUTE);
    session = resumeFocusSession(session, T0 + 15 * MINUTE);
    session = endFocusSession(session, T0 + 25 * MINUTE);

    expect(session.status).toBe("completed");
    expect(session.endedAt).toBe(T0 + 25 * MINUTE);
    expect(session.activeSegmentStartedAt).toBeNull();
    expect(getFocusDurationMs(session, T0 + 99 * MINUTE)).toBe(20 * MINUTE);
    expect(getElapsedMs(session, T0 + 99 * MINUTE)).toBe(25 * MINUTE);
  });

  test("excludes paused time across multiple pause/resume cycles", () => {
    let session = start();

    for (let cycle = 0; cycle < 3; cycle += 1) {
      const base = T0 + cycle * 10 * MINUTE;
      session = pauseFocusSession(session, base + 6 * MINUTE);
      session = resumeFocusSession(session, base + 10 * MINUTE);
    }

    expect(session.status).toBe("active");
    expect(session.accumulatedMs).toBe(18 * MINUTE);
    expect(getFocusDurationMs(session, T0 + 32 * MINUTE)).toBe(20 * MINUTE);
    expect(getElapsedMs(session, T0 + 32 * MINUTE)).toBe(32 * MINUTE);
  });

  test("does not grow while paused", () => {
    const paused = pauseFocusSession(start(), T0 + 3 * MINUTE);

    expect(getFocusDurationMs(paused, T0 + 3 * MINUTE)).toBe(3 * MINUTE);
    expect(getFocusDurationMs(paused, T0 + 60 * MINUTE)).toBe(3 * MINUTE);
    expect(getElapsedMs(paused, T0 + 60 * MINUTE)).toBe(60 * MINUTE);
  });

  test("ending while paused keeps the recorded time", () => {
    let session = pauseFocusSession(start(), T0 + 7 * MINUTE);
    session = endFocusSession(session, T0 + 30 * MINUTE);

    expect(session.accumulatedMs).toBe(7 * MINUTE);
    expect(getElapsedMs(session, T0 + 30 * MINUTE)).toBe(30 * MINUTE);
  });
});

describe("repeated operations", () => {
  test("pausing twice returns the same session and adds no time", () => {
    const paused = pauseFocusSession(start(), T0 + MINUTE);

    expect(pauseFocusSession(paused, T0 + 9 * MINUTE)).toBe(paused);
  });

  test("resuming an active session is a no-op", () => {
    const active = start();

    expect(resumeFocusSession(active, T0 + MINUTE)).toBe(active);
  });

  test("ending twice keeps the first end time and duration", () => {
    const ended = endFocusSession(start(), T0 + 4 * MINUTE);

    expect(endFocusSession(ended, T0 + 40 * MINUTE)).toBe(ended);
    expect(getFocusDurationMs(ended, T0 + 40 * MINUTE)).toBe(4 * MINUTE);
  });
});

describe("invalid transitions", () => {
  const ended = endFocusSession(start(), T0 + MINUTE);

  test.each([
    ["pause", () => pauseFocusSession(ended, T0 + 2 * MINUTE)],
    ["resume", () => resumeFocusSession(ended, T0 + 2 * MINUTE)],
  ])("cannot %s a completed session", (_action, act) => {
    expect(act).toThrow(FocusSessionTransitionError);
  });

  test.each([Number.NaN, -1, 1.5, Number.POSITIVE_INFINITY])(
    "rejects invalid timestamp %s",
    (now) => {
      expect(() => start(now)).toThrow(RangeError);
      expect(() => pauseFocusSession(start(), now)).toThrow(RangeError);
    },
  );
});

describe("app termination and clock changes", () => {
  test("a restored active session includes time since its segment start", () => {
    // Persisted while active, app killed, restored an hour later: the duration
    // comes from stored timestamps; no background work was needed.
    const persisted = { ...start() };

    expect(getFocusDurationMs(persisted, T0 + 60 * MINUTE)).toBe(60 * MINUTE);
  });

  test("a clock moving backwards never yields negative or inflated time", () => {
    let session = pauseFocusSession(start(), T0 + 10 * MINUTE);
    session = resumeFocusSession(session, T0 + 2 * MINUTE);

    expect(session.activeSegmentStartedAt).toBe(T0 + 10 * MINUTE);
    expect(getFocusDurationMs(session, T0)).toBe(10 * MINUTE);

    session = endFocusSession(session, T0 + 5 * MINUTE);

    expect(session.endedAt).toBe(T0 + 10 * MINUTE);
    expect(session.accumulatedMs).toBeLessThanOrEqual(
      session.endedAt! - session.startedAt,
    );
  });
});
