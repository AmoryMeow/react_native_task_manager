import { Text } from "react-native";

import type { FocusSession } from "@/entities/focus-session/model/focus-session";

import {
  describeFocusDuration,
  formatFocusDuration,
} from "../lib/format-focus-duration";
import { useFocusDuration } from "../model/use-focus-duration";

export function FocusTimer({ session }: { session: FocusSession }) {
  const { durationMs } = useFocusDuration(session);
  const isActive = session.status === "active";

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
