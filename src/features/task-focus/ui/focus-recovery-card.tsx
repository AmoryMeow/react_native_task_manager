import { useEffect, useRef, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useThemeColors } from "@/shared/theme/use-theme-colors";

import {
  formatSessionStart,
  needsDurationReview,
  parseDurationInput,
  splitDuration,
  UNAVAILABLE_TASK_TITLE,
  type FocusRecovery,
} from "../lib/focus-recovery";
import {
  describeFocusDuration,
  formatFocusDuration,
} from "../lib/format-focus-duration";
import { useFocusDuration } from "../model/use-focus-duration";

interface FocusRecoveryCardProps {
  recovery: FocusRecovery;
  onResume: (taskId: string) => void;
  onEnd: (sessionId: string, correctedFocusMs?: number) => Promise<void>;
}

export function FocusRecoveryCard({
  recovery,
  onResume,
  onEnd,
}: FocusRecoveryCardProps) {
  const colors = useThemeColors();
  const { session, task } = recovery;
  const { now, durationMs } = useFocusDuration(session);
  const [isReviewing, setIsReviewing] = useState(false);
  const [hoursInput, setHoursInput] = useState("");
  const [minutesInput, setMinutesInput] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);
  const [endError, setEndError] = useState<string | null>(null);
  const [isEnding, setIsEnding] = useState(false);
  const endingRef = useRef(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const isActive = session.status === "active";
  const isLong = needsDurationReview(session, now);
  const title = task?.title ?? UNAVAILABLE_TASK_TITLE;

  async function end(correctedFocusMs?: number) {
    if (endingRef.current) return;

    endingRef.current = true;
    setIsEnding(true);
    setEndError(null);

    try {
      await onEnd(session.id, correctedFocusMs);
    } catch (error) {
      console.error("Failed to end recovered focus session", error);
      if (isMountedRef.current) {
        setEndError("The session wasn't ended. Please try again.");
      }
    } finally {
      endingRef.current = false;
      if (isMountedRef.current) setIsEnding(false);
    }
  }

  function startEnding() {
    if (!isLong) {
      void end();
      return;
    }

    const { hours, minutes } = splitDuration(durationMs);
    setHoursInput(String(hours));
    setMinutesInput(String(minutes));
    setInputError(null);
    setIsReviewing(true);
  }

  function endWithAdjustedTime() {
    const result = parseDurationInput(hoursInput, minutesInput, durationMs);

    if (!result.ok) {
      setInputError(result.error);
      return;
    }

    setInputError(null);
    void end(result.ms);
  }

  return (
    <View
      accessibilityLabel="Unfinished focus session"
      className="mb-4 gap-3 rounded-2xl border border-line bg-surface p-4"
    >
      <View className="flex-row items-center justify-between gap-3">
        <View className="flex-row items-center gap-2">
          <View
            className={`h-2 w-2 rounded-full ${
              isActive ? "bg-primary" : "bg-line-strong"
            }`}
          />
          <Text className="text-xs font-semibold uppercase tracking-widest text-muted">
            {isActive ? "Active" : "Paused"}
          </Text>
        </View>
        <Text
          accessibilityRole="timer"
          accessibilityLabel={`Recovered focus time, ${describeFocusDuration(
            durationMs,
          )}`}
          className="text-sm font-semibold text-secondary"
          style={{ fontVariant: ["tabular-nums"] }}
        >
          {formatFocusDuration(durationMs)}
        </Text>
      </View>

      <View className="gap-0.5">
        <Text
          numberOfLines={2}
          className="text-base font-semibold leading-6 text-foreground"
        >
          {title}
        </Text>
        <Text className="text-xs text-muted">
          {formatSessionStart(session.startedAt, now)}
          {task ? "" : " · The task is no longer available"}
        </Text>
      </View>

      {isLong ? (
        <Text className="rounded-lg bg-warning-surface px-3 py-2 text-xs leading-5 text-warning">
          This session has been running for over 4 hours. Review the recorded
          time when you end it.
        </Text>
      ) : null}

      {endError ? (
        <Text
          accessibilityLiveRegion="polite"
          className="rounded-lg bg-danger-surface px-3 py-2 text-xs leading-5 text-danger"
        >
          {endError}
        </Text>
      ) : null}

      {isReviewing ? (
        <View className="gap-3">
          <Text className="text-sm leading-5 text-secondary">
            Recorded focus time is {formatFocusDuration(durationMs)}. Adjust it
            if you weren&apos;t focusing the whole time.
          </Text>

          <View className="flex-row items-center gap-2">
            <TextInput
              accessibilityLabel="Focus hours"
              value={hoursInput}
              onChangeText={setHoursInput}
              keyboardType="number-pad"
              editable={!isEnding}
              selectionColor={colors.foreground}
              className="h-10 w-16 rounded-lg border border-line-strong bg-surface px-3 text-base text-foreground"
            />
            <Text className="text-sm text-secondary">h</Text>
            <TextInput
              accessibilityLabel="Focus minutes"
              value={minutesInput}
              onChangeText={setMinutesInput}
              keyboardType="number-pad"
              editable={!isEnding}
              selectionColor={colors.foreground}
              className="h-10 w-16 rounded-lg border border-line-strong bg-surface px-3 text-base text-foreground"
            />
            <Text className="text-sm text-secondary">min</Text>
          </View>

          {inputError ? (
            <Text
              accessibilityLiveRegion="polite"
              className="text-xs text-danger"
            >
              {inputError}
            </Text>
          ) : null}

          <View className="flex-row flex-wrap gap-2">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="End with adjusted time"
              accessibilityState={{ disabled: isEnding }}
              disabled={isEnding}
              onPress={endWithAdjustedTime}
              className={`min-h-10 justify-center rounded-xl bg-primary px-4 active:bg-primary-pressed ${
                isEnding ? "opacity-40" : ""
              }`}
            >
              <Text className="text-sm font-semibold text-primary-foreground">
                {isEnding ? "Ending..." : "End with adjusted time"}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Keep recorded time and end"
              accessibilityState={{ disabled: isEnding }}
              disabled={isEnding}
              onPress={() => void end()}
              className="min-h-10 justify-center rounded-xl border border-line-strong bg-surface px-4 active:bg-pressed"
            >
              <Text className="text-sm font-semibold text-foreground">
                Keep recorded time
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel review"
              disabled={isEnding}
              onPress={() => setIsReviewing(false)}
              className="min-h-10 justify-center px-2"
            >
              <Text className="text-sm font-medium text-muted">Cancel</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View className="flex-row flex-wrap gap-2">
          {task ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Resume focus on ${task.title}`}
              disabled={isEnding}
              onPress={() => onResume(task.id)}
              className={`min-h-10 justify-center rounded-xl bg-primary px-4 active:bg-primary-pressed ${
                isEnding ? "opacity-40" : ""
              }`}
            >
              <Text className="text-sm font-semibold text-primary-foreground">
                Resume focus
              </Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              isLong ? "Review and end session" : "End session"
            }
            accessibilityState={{ disabled: isEnding }}
            disabled={isEnding}
            onPress={startEnding}
            className={`min-h-10 justify-center rounded-xl border border-line-strong bg-surface px-4 active:bg-pressed ${
              isEnding ? "opacity-40" : ""
            }`}
          >
            <Text className="text-sm font-semibold text-foreground">
              {isEnding
                ? "Ending..."
                : isLong
                  ? "Review and end"
                  : "End session"}
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
