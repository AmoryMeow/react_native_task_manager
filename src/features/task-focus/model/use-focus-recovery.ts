import { useFocusEffect } from "expo-router";
import type { SQLiteDatabase } from "expo-sqlite";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

import { createFocusSessionRepository } from "@/entities/focus-session/repository/focus-session-repository";
import { createTaskRepository } from "@/entities/task/repository/task-repository";

import { loadFocusRecovery, type FocusRecovery } from "../lib/focus-recovery";

export function useFocusRecovery(db: SQLiteDatabase) {
  const [recovery, setRecovery] = useState<FocusRecovery | null>(null);
  const requestRef = useRef(0);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      requestRef.current += 1;
    };
  }, []);

  const reload = useCallback(async () => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;

    try {
      const result = await loadFocusRecovery({
        getUnfinishedSession: () =>
          createFocusSessionRepository(db).getUnfinishedSession(),
        getTaskById: (taskId) => createTaskRepository(db).getTaskById(taskId),
      });

      if (isMountedRef.current && requestRef.current === requestId) {
        setRecovery(result);
      }
    } catch (error) {
      console.error("Failed to load unfinished focus session", error);
    }
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") void reload();
    });

    return () => subscription.remove();
  }, [reload]);

  const endSession = useCallback(
    async (sessionId: string, correctedFocusMs?: number) => {
      await createFocusSessionRepository(db).endSession(sessionId, Date.now(), {
        correctedFocusMs,
      });

      requestRef.current += 1;
      if (isMountedRef.current) {
        setRecovery((current) =>
          current?.session.id === sessionId ? null : current,
        );
      }
      void reload();
    },
    [db, reload],
  );

  return { recovery, reload, endSession };
}
