import {
  getFocusDurationMs,
  pauseFocusSession,
  startFocusSession,
} from "@/entities/focus-session/model/focus-session";

import {
  describeFocusDuration,
  formatFocusDuration,
} from "../format-focus-duration";

describe("formatFocusDuration", () => {
  test.each([
    [0, "00:00:00"],
    [999, "00:00:00"],
    [1_000, "00:00:01"],
    [59_999, "00:00:59"],
    [61_000, "00:01:01"],
    [3_661_000, "01:01:01"],
    [100 * 3_600_000, "100:00:00"],
    [-5_000, "00:00:00"],
  ])("formats %d ms as %s", (ms, expected) => {
    expect(formatFocusDuration(ms)).toBe(expected);
  });
});

describe("describeFocusDuration", () => {
  test.each([
    [0, "0 seconds"],
    [1_000, "1 second"],
    [65_000, "1 minute, 5 seconds"],
    [3_723_000, "1 hour, 2 minutes, 3 seconds"],
  ])("describes %d ms as %s", (ms, expected) => {
    expect(describeFocusDuration(ms)).toBe(expected);
  });
});

describe("timer display across background and foreground", () => {
  const T0 = 1_800_000_000_000;

  test("an active session shows the time spent in the background on return", () => {
    const session = startFocusSession({ id: "s", taskId: "t", now: T0 });

    expect(formatFocusDuration(getFocusDurationMs(session, T0 + 90_000))).toBe(
      "00:01:30",
    );
  });

  test("a paused session stays frozen however long the app was away", () => {
    const paused = pauseFocusSession(
      startFocusSession({ id: "s", taskId: "t", now: T0 }),
      T0 + 42_000,
    );

    expect(
      formatFocusDuration(getFocusDurationMs(paused, T0 + 6 * 3_600_000)),
    ).toBe("00:00:42");
  });
});
