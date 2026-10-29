import {
  router,
  Stack,
  useFocusEffect,
  useLocalSearchParams,
  useNavigation,
} from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import type { Task } from "../../entities/task/model/types";
import { createTaskRepository } from "../../entities/task/repository/task-repository";
import { parseFocusOrigin } from "../../features/task-focus/lib/focus-origin";

type LoadState = "loading" | "ready" | "error";

export default function FocusScreen() {
  const { id, from: fromParam } = useLocalSearchParams<{
    id: string;
    from?: string | string[];
  }>();
  const from = parseFocusOrigin(fromParam);
  const db = useSQLiteContext();
  const navigation = useNavigation();
  const [task, setTask] = useState<Task | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [completionSaving, setCompletionSaving] = useState(false);
  const [completionError, setCompletionError] = useState<string | null>(null);
  const isMountedRef = useRef(true);
  const loadRequestRef = useRef(0);
  const completionPromiseRef = useRef<Promise<Task> | null>(null);
  const allowRemovalRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      loadRequestRef.current += 1;
    };
  }, []);

  const loadTask = useCallback(async () => {
    if (!id || completionPromiseRef.current) return;

    const requestId = loadRequestRef.current + 1;
    loadRequestRef.current = requestId;

    if (isMountedRef.current) {
      setLoadState((current) =>
        current === "ready" ? current : "loading",
      );
    }

    try {
      const loadedTask = await createTaskRepository(db).getTaskById(id);

      if (!isMountedRef.current || loadRequestRef.current !== requestId) return;

      setTask(loadedTask);
      setCompletionError(null);
      setLoadState("ready");
    } catch (error) {
      console.error("Failed to load focus task", error);

      if (!isMountedRef.current || loadRequestRef.current !== requestId) return;

      setLoadState("error");
    }
  }, [db, id]);

  useFocusEffect(
    useCallback(() => {
      void loadTask();
    }, [loadTask]),
  );

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        void loadTask();
      }
    });

    return () => subscription.remove();
  }, [loadTask]);

  useEffect(() => {
    return navigation.addListener("beforeRemove", (event) => {
      if (allowRemovalRef.current || !completionPromiseRef.current) return;

      event.preventDefault();
    });
  }, [navigation]);

  function returnFromFocus() {
    if (from === "roulette") {
      router.dismissTo("/tools/roulette");
      return;
    }

    if (from === "duel") {
      router.dismissTo("/tools/duel");
      return;
    }

    if (from === "tools") {
      router.dismissTo("/tools/focus");
      return;
    }

    router.dismissTo("/");
  }

  function completeTask() {
    if (
      !task ||
      task.status === "done" ||
      completionPromiseRef.current
    ) {
      return;
    }

    setCompletionSaving(true);
    setCompletionError(null);

    const savePromise = createTaskRepository(db).toggleTask(task);
    completionPromiseRef.current = savePromise;

    void savePromise
      .then((updatedTask) => {
        if (!isMountedRef.current) return;

        setTask(updatedTask);
        allowRemovalRef.current = true;
        returnFromFocus();
      })
      .catch((error) => {
        console.error("Failed to complete focus task", error);
        if (!isMountedRef.current) return;

        setCompletionError("The task wasn't completed. Please try again.");
      })
      .finally(() => {
        completionPromiseRef.current = null;

        if (isMountedRef.current) {
          setCompletionSaving(false);
        }
      });
  }

  const isCompleted = task?.status === "done";
  const returnLabel =
    from === "roulette"
      ? "Back to Task Roulette"
      : from === "duel"
        ? "Back to Task Duel"
        : from === "tools"
          ? "Back to Focus Mode"
        : "Back to tasks";

  return (
    <>
      <Stack.Screen options={{ gestureEnabled: !completionSaving }} />

      <SafeAreaView className="flex-1 bg-zinc-50">
        <View className="flex-1 px-6 py-5">
          {loadState === "loading" ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator accessibilityLabel="Loading task" />
            </View>
          ) : loadState === "error" ? (
            <View className="mx-auto flex-1 w-full max-w-xl items-center justify-center gap-4">
              <Text className="text-center text-lg font-semibold text-zinc-900">
                Couldn&apos;t load this task
              </Text>
              <Text className="text-center text-sm leading-5 text-zinc-500">
                Check the connection to local storage and try again.
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Retry loading task"
                onPress={() => void loadTask()}
                className="min-h-11 justify-center rounded-xl bg-zinc-950 px-5 active:bg-zinc-700"
              >
                <Text className="font-semibold text-white">Try again</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={returnLabel}
                onPress={returnFromFocus}
                className="min-h-11 justify-center px-5"
              >
                <Text className="font-medium text-zinc-600">{returnLabel}</Text>
              </Pressable>
            </View>
          ) : !task ? (
            <View className="mx-auto flex-1 w-full max-w-xl items-center justify-center gap-4">
              <Text className="text-center text-lg font-semibold text-zinc-900">
                Task not found
              </Text>
              <Text className="text-center text-sm leading-5 text-zinc-500">
                It may have been deleted.
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={returnLabel}
                onPress={returnFromFocus}
                className="min-h-11 justify-center rounded-xl border border-zinc-300 bg-white px-5 active:bg-zinc-100"
              >
                <Text className="font-semibold text-zinc-800">{returnLabel}</Text>
              </Pressable>
            </View>
          ) : (
            <View className="mx-auto flex-1 w-full max-w-xl">
              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerClassName="flex-grow justify-center py-10"
              >
                <View className="gap-5">
                  <Text className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
                    {isCompleted ? "Completed" : "Focus"}
                  </Text>
                  <Text
                    accessibilityRole="header"
                    className={`text-4xl font-bold leading-tight tracking-tight ${
                      isCompleted
                        ? "text-zinc-400 line-through"
                        : "text-zinc-950"
                    }`}
                  >
                    {task.title}
                  </Text>
                  {task.description ? (
                    <Text className="text-lg leading-7 text-zinc-600">
                      {task.description}
                    </Text>
                  ) : null}
                  {isCompleted ? (
                    <Text
                      accessibilityLiveRegion="polite"
                      className="text-sm leading-5 text-zinc-500"
                    >
                      This task was completed while Focus Mode was open.
                    </Text>
                  ) : null}
                </View>
              </ScrollView>

              <View className="gap-2 pb-2 pt-4">
                {completionError ? (
                  <View
                    accessibilityLiveRegion="polite"
                    className="mb-1 flex-row items-center justify-between gap-3 rounded-xl bg-red-50 px-3 py-2"
                  >
                    <Text className="flex-1 text-sm text-red-700">
                      {completionError}
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Retry completing task"
                      disabled={completionSaving}
                      onPress={completeTask}
                      className="min-h-10 justify-center px-2"
                    >
                      <Text className="text-sm font-semibold text-red-700">
                        Retry
                      </Text>
                    </Pressable>
                  </View>
                ) : null}

                {!isCompleted ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Complete task"
                    accessibilityState={{ disabled: completionSaving }}
                    disabled={completionSaving}
                    onPress={completeTask}
                    className={`min-h-14 items-center justify-center rounded-2xl bg-zinc-950 px-5 active:bg-zinc-700 ${
                      completionSaving ? "opacity-40" : ""
                    }`}
                  >
                    <Text className="text-base font-semibold text-white">
                      {completionSaving ? "Completing..." : "Complete task"}
                    </Text>
                  </Pressable>
                ) : null}

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Exit focus"
                  accessibilityState={{ disabled: completionSaving }}
                  disabled={completionSaving}
                  onPress={returnFromFocus}
                  className={`min-h-12 items-center justify-center rounded-xl px-5 active:bg-zinc-100 ${
                    completionSaving ? "opacity-40" : ""
                  }`}
                >
                  <Text className="text-base font-medium text-zinc-600">
                    Exit focus
                  </Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>
      </SafeAreaView>
    </>
  );
}
