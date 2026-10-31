import { useEffect, useState } from "react";
import { AppState, Text } from "react-native";

import {
  getFocusDurationMs,
  type FocusSession,
} from "@/entities/focus-session/model/focus-session";

import {
  describeFocusDuration,
  formatFocusDuration,
} from "../lib/format-focus-duration";

const TICK_MS = 1000;

export function FocusTimer({ session }: { session: FocusSession }) {
  const [now, setNow] = useState(() => Date.now());
  const isActive = session.status === "active";

  useEffect(() => {
    if (!isActive) return;

    let interval: ReturnType<typeof setInterval> | null = null;
    const tick = () => setNow(Date.now());
    const startTicking = () => {
      tick();
      interval ??= setInterval(tick, TICK_MS);
    };
    const stopTicking = () => {
      if (interval !== null) clearInterval(interval);
      interval = null;
    };

    if (AppState.currentState !== "background") startTicking();

    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") startTicking();
      else stopTicking();
    });

    return () => {
      stopTicking();
      subscription.remove();
    };
  }, [isActive]);

  const durationMs = getFocusDurationMs(session, now);

  return (
    <Text
      accessibilityRole="timer"
      accessibilityLabel={`Focus time, ${describeFocusDuration(durationMs)}`}
      className={`text-xl font-medium tracking-tight ${
        isActive ? "text-zinc-500" : "text-zinc-400"
      }`}
      style={{ fontVariant: ["tabular-nums"] }}
    >
      {formatFocusDuration(durationMs)}
    </Text>
  );
}
