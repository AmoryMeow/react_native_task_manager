import { useEffect, useState } from "react";
import { AppState } from "react-native";

import {
  getFocusDurationMs,
  type FocusSession,
} from "@/entities/focus-session/model/focus-session";

const TICK_MS = 1000;

export function useFocusDuration(session: FocusSession) {
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

  return { now, durationMs: getFocusDurationMs(session, now) };
}
