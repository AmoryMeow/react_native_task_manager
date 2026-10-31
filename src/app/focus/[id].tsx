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
  AccessibilityInfo,
  ActivityIndicator,
  AppState,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { createFocusSessionRepository } from "../../entities/focus-session/repository/focus-session-repository";
import type { Task } from "../../entities/task/model/types";
import { createTaskRepository } from "../../entities/task/repository/task-repository";
import { parseFocusOrigin } from "../../features/task-focus/lib/focus-origin";
import {
  applyEndFocusChoice,
  getTomorrowSuggestion,
  shouldSuggestTomorrow,
  type EndFocusChoice,
} from "../../features/task-focus/lib/tomorrow-suggestion";
import {
  createFocusSessionController,
  type FocusSessionController,
  type FocusSessionSnapshot,
} from "../../features/task-focus/model/focus-session-controller";
import { FocusOrb } from "../../features/task-focus/ui/focus-orb";
import { FocusTimer } from "../../features/task-focus/ui/focus-timer";

type LoadState = "loading" | "ready" | "error";
type FinishKind = "complete" | "move" | "keep" | "exit";

interface Failure {
  message: string;
  retry: () => void;
}

const FINISH_ERRORS: Record<FinishKind, string> = {
  complete: "The task wasn't completed. Please try again.",
  move: "The task wasn't moved. Please try again.",
  keep: "Focus time wasn't saved. Please try again.",
  exit: "Focus time wasn't saved. Please try again.",
};

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
  const [sessionSnapshot, setSessionSnapshot] = useState<FocusSessionSnapshot>({
    state: { status: "idle" },
    pending: null,
  });
  const [otherTask, setOtherTask] = useState<Task | null>(null);
  const [finishKind, setFinishKind] = useState<FinishKind | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [isTomorrowPromptOpen, setIsTomorrowPromptOpen] = useState(false);
  const isMountedRef = useRef(true);
  const loadRequestRef = useRef(0);
  const controllerRef = useRef<FocusSessionController | null>(null);
  const finishingRef = useRef(false);
  const allowRemovalRef = useRef(false);
  const pendingRemovalRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      loadRequestRef.current += 1;
    };
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web") return;

    return () => {
      if (allowRemovalRef.current || finishingRef.current) return;

      controllerRef.current?.finish().catch((error) => {
        console.error("Failed to end focus after browser navigation", error);
      });
    };
  }, []);

  useEffect(() => {
    const controller = createFocusSessionController({
      taskId: id,
      repository: createFocusSessionRepository(db),
      runInTransaction: (work) => db.withTransactionAsync(work),
      onChange: setSessionSnapshot,
    });
    controllerRef.current = controller;

    return () => {
      controller.dispose();
      if (controllerRef.current === controller) controllerRef.current = null;
    };
  }, [db, id]);

  const loadTask = useCallback(async () => {
    if (!id || finishingRef.current) return;

    const requestId = loadRequestRef.current + 1;
    loadRequestRef.current = requestId;

    if (isMountedRef.current) {
      setLoadState((current) => (current === "ready" ? current : "loading"));
    }

    try {
      const loadedTask = await createTaskRepository(db).getTaskById(id);

      if (!isMountedRef.current || loadRequestRef.current !== requestId) return;

      setTask(loadedTask);
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

  const initSession = useCallback((allowStart: boolean) => {
    const controller = controllerRef.current;
    if (!controller) return;

    setFailure(null);
    controller.init({ allowStart }).catch((error) => {
      console.error("Failed to start focus session", error);
      if (!isMountedRef.current) return;

      setFailure({
        message: "Focus time isn't being recorded. Please try again.",
        retry: () => initSession(allowStart),
      });
    });
  }, []);

  const loadedTaskId = task?.id;
  const isLoadedTaskDone = task?.status === "done";

  useEffect(() => {
    if (!loadedTaskId) return;
    if (controllerRef.current?.getSnapshot().state.status !== "idle") return;

    initSession(!isLoadedTaskDone);
  }, [db, id, initSession, isLoadedTaskDone, loadedTaskId]);

  const sessionState = sessionSnapshot.state;
  const otherSession =
    sessionState.status === "conflict" ? sessionState.otherSession : null;
  const otherTaskId = otherSession?.taskId ?? null;

  useEffect(() => {
    if (!otherTaskId) return;

    let active = true;

    createTaskRepository(db)
      .getTaskById(otherTaskId)
      .then((loaded) => {
        if (active) setOtherTask(loaded);
      })
      .catch((error) => {
        console.error("Failed to load the other focus task", error);
      });

    return () => {
      active = false;
    };
  }, [db, otherTaskId]);

  const trackedSession =
    sessionState.status === "tracking" ? sessionState.session : null;
  const hasUnfinishedSession =
    trackedSession !== null && trackedSession.status !== "completed";

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

  function leave() {
    allowRemovalRef.current = true;
    const continueRemoval = pendingRemovalRef.current;
    pendingRemovalRef.current = null;

    if (continueRemoval) continueRemoval();
    else returnFromFocus();
  }

  function finishFocus(kind: FinishKind, alsoWrite?: () => Promise<void>) {
    const controller = controllerRef.current;
    if (!controller || finishingRef.current) return;

    finishingRef.current = true;
    setFinishKind(kind);
    setFailure(null);

    controller
      .finish(alsoWrite)
      .then(() => {
        if (isMountedRef.current) leave();
      })
      .catch((error) => {
        console.error("Failed to finish focus", error);
        if (!isMountedRef.current) return;

        setFailure({
          message: FINISH_ERRORS[kind],
          retry: () => finishFocus(kind, alsoWrite),
        });
      })
      .finally(() => {
        finishingRef.current = false;
        if (isMountedRef.current) setFinishKind(null);
      });
  }

  function exitFocus() {
    if (finishingRef.current) return;

    if (task && shouldSuggestTomorrow(task, new Date())) {
      setFailure(null);
      setIsTomorrowPromptOpen(true);
      AccessibilityInfo.announceForAccessibility(
        "Would you like to continue this task tomorrow?",
      );
      return;
    }

    finishFocus("exit");
  }

  function chooseEndFocus(choice: EndFocusChoice) {
    if (!task) return;

    const taskAtChoice = task;

    finishFocus(choice === "move-to-tomorrow" ? "move" : "keep", async () => {
      const result = await applyEndFocusChoice({
        choice,
        task: taskAtChoice,
        now: new Date(),
        updateSchedule: (taskId, schedule) =>
          createTaskRepository(db).updateTaskSchedule(taskId, schedule),
      });

      if (result.status === "failed") throw result.error;
    });
  }

  function completeTask() {
    if (!task || task.status === "done") return;

    const taskId = task.id;

    finishFocus("complete", async () => {
      const repository = createTaskRepository(db);
      const current = await repository.getTaskById(taskId);

      if (!current) throw new Error(`Task ${taskId} was not found`);
      if (current.status !== "done") await repository.toggleTask(current);
    });
  }

  function togglePause() {
    const controller = controllerRef.current;
    const state = controller?.getSnapshot().state;
    if (!controller || state?.status !== "tracking") return;

    const isPausing = state.session.status === "active";

    setFailure(null);
    (isPausing ? controller.pause() : controller.resume()).catch((error) => {
      console.error("Failed to change focus session", error);
      if (!isMountedRef.current) return;

      setFailure({
        message: isPausing
          ? "Focus wasn't paused. Please try again."
          : "Focus wasn't resumed. Please try again.",
        retry: togglePause,
      });
    });
  }

  function replaceOtherSession() {
    const controller = controllerRef.current;
    if (!controller) return;

    setFailure(null);
    controller.replaceOtherSession().catch((error) => {
      console.error("Failed to replace focus session", error);
      if (!isMountedRef.current) return;

      setFailure({
        message: "The other session wasn't ended. Please try again.",
        retry: replaceOtherSession,
      });
    });
  }

  function returnToOtherSession() {
    if (!otherSession) return;

    router.replace({
      pathname: "/focus/[id]",
      params: from
        ? { id: otherSession.taskId, from }
        : { id: otherSession.taskId },
    });
  }

  useEffect(() => {
    return navigation.addListener("beforeRemove", (event) => {
      if (allowRemovalRef.current) return;
      if (!finishingRef.current && !hasUnfinishedSession) return;

      event.preventDefault();
      if (finishingRef.current) return;

      pendingRemovalRef.current = () => navigation.dispatch(event.data.action);
      exitFocus();
    });
  });

  const isFinishing = finishKind !== null;
  const isSessionBusy = sessionSnapshot.pending !== null;
  const isCompleted = task?.status === "done";
  const isPaused = trackedSession?.status === "paused";
  const tomorrowSuggestion = task
    ? getTomorrowSuggestion(task, new Date())
    : null;
  const showTomorrowPrompt =
    isTomorrowPromptOpen && tomorrowSuggestion !== null;
  const keepLabel =
    tomorrowSuggestion === "overdue" ? "Keep current date" : "Keep for today";
  const returnLabel =
    from === "roulette"
      ? "Back to Task Roulette"
      : from === "duel"
        ? "Back to Task Duel"
        : from === "tools"
          ? "Back to Focus Mode"
          : "Back to Tasks";

  const failureBanner = failure ? (
    <View
      accessibilityLiveRegion="polite"
      className="mb-1 flex-row items-center justify-between gap-3 rounded-xl bg-red-50 px-3 py-2"
    >
      <Text className="flex-1 text-sm text-red-700">{failure.message}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Retry"
        disabled={isFinishing || isSessionBusy}
        onPress={failure.retry}
        className="min-h-10 justify-center px-2"
      >
        <Text className="text-sm font-semibold text-red-700">Retry</Text>
      </Pressable>
    </View>
  ) : null;

  return (
    <>
      <Stack.Screen
        options={{ gestureEnabled: !hasUnfinishedSession && !isFinishing }}
      />

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
                <Text className="font-semibold text-zinc-800">
                  {returnLabel}
                </Text>
              </Pressable>
            </View>
          ) : otherSession ? (
            <View className="mx-auto flex-1 w-full max-w-xl justify-center gap-4">
              <Text
                accessibilityRole="header"
                className="text-center text-2xl font-bold tracking-tight text-zinc-950"
              >
                Another focus session is open
              </Text>
              <Text className="text-center text-base leading-6 text-zinc-600">
                {otherTask
                  ? `“${otherTask.title}” is still ${
                      otherSession.status === "paused" ? "paused" : "in focus"
                    }.`
                  : "A focus session for another task is still open."}{" "}
                End it before focusing on “{task.title}”, or return to it.
              </Text>

              <View className="mt-4 gap-2">
                {failureBanner}

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="End it and focus here"
                  accessibilityState={{ disabled: isSessionBusy }}
                  disabled={isSessionBusy}
                  onPress={replaceOtherSession}
                  className={`min-h-14 items-center justify-center rounded-2xl bg-zinc-950 px-5 active:bg-zinc-700 ${
                    isSessionBusy ? "opacity-40" : ""
                  }`}
                >
                  <Text className="text-base font-semibold text-white">
                    {sessionSnapshot.pending === "replace"
                      ? "Ending..."
                      : "End it and focus here"}
                  </Text>
                </Pressable>

                {otherTask ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Return to that session"
                    disabled={isSessionBusy}
                    onPress={returnToOtherSession}
                    className="min-h-12 items-center justify-center rounded-xl border border-zinc-300 bg-white px-5 active:bg-zinc-100"
                  >
                    <Text className="text-base font-semibold text-zinc-800">
                      Return to that session
                    </Text>
                  </Pressable>
                ) : null}

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={returnLabel}
                  disabled={isSessionBusy}
                  onPress={returnFromFocus}
                  className="min-h-12 items-center justify-center rounded-xl px-5 active:bg-zinc-100"
                >
                  <Text className="text-base font-medium text-zinc-600">
                    {returnLabel}
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View className="mx-auto flex-1 w-full max-w-xl">
              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerClassName="flex-grow justify-center py-10"
              >
                <View className="items-center gap-5">
                  <FocusOrb active={!isCompleted && !isPaused} />

                  <Text className="text-center text-xs font-semibold uppercase tracking-widest text-zinc-400">
                    {isCompleted ? "Completed" : isPaused ? "Paused" : "Focus"}
                  </Text>
                  <Text
                    accessibilityRole="header"
                    className={`text-center text-4xl font-bold leading-tight tracking-tight ${
                      isCompleted
                        ? "text-zinc-400 line-through"
                        : "text-zinc-950"
                    }`}
                  >
                    {task.title}
                  </Text>
                  {task.description ? (
                    <Text className="text-center text-lg leading-7 text-zinc-600">
                      {task.description}
                    </Text>
                  ) : null}
                  {isCompleted ? (
                    <Text
                      accessibilityLiveRegion="polite"
                      className="text-center text-sm leading-5 text-zinc-500"
                    >
                      This task was completed while Focus Mode was open.
                    </Text>
                  ) : null}

                  {trackedSession ? (
                    <View className="mt-2 items-center gap-2">
                      <FocusTimer session={trackedSession} />
                      {hasUnfinishedSession ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={
                            isPaused ? "Resume focus" : "Pause focus"
                          }
                          accessibilityState={{
                            disabled: isSessionBusy || isFinishing,
                          }}
                          disabled={isSessionBusy || isFinishing}
                          onPress={togglePause}
                          className={`min-h-10 justify-center rounded-full border border-zinc-300 bg-white px-5 active:bg-zinc-100 ${
                            isSessionBusy || isFinishing ? "opacity-40" : ""
                          }`}
                        >
                          <Text className="text-sm font-semibold text-zinc-800">
                            {isPaused ? "Resume" : "Pause"}
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              </ScrollView>

              {showTomorrowPrompt ? (
                <View className="gap-2 pb-2 pt-4">
                  <Text
                    accessibilityLiveRegion="polite"
                    className="mb-2 text-center text-base font-medium leading-6 text-zinc-800"
                  >
                    Would you like to continue this task tomorrow?
                  </Text>

                  {failureBanner}

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Move to tomorrow"
                    accessibilityState={{ disabled: isFinishing }}
                    disabled={isFinishing}
                    onPress={() => chooseEndFocus("move-to-tomorrow")}
                    className={`min-h-14 items-center justify-center rounded-2xl bg-zinc-950 px-5 active:bg-zinc-700 ${
                      isFinishing ? "opacity-40" : ""
                    }`}
                  >
                    <Text className="text-base font-semibold text-white">
                      {finishKind === "move" ? "Moving..." : "Move to tomorrow"}
                    </Text>
                  </Pressable>

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={keepLabel}
                    accessibilityState={{ disabled: isFinishing }}
                    disabled={isFinishing}
                    onPress={() => chooseEndFocus("keep")}
                    className={`min-h-12 items-center justify-center rounded-xl px-5 active:bg-zinc-100 ${
                      isFinishing ? "opacity-40" : ""
                    }`}
                  >
                    <Text className="text-base font-medium text-zinc-600">
                      {keepLabel}
                    </Text>
                  </Pressable>
                </View>
              ) : (
                <View className="gap-2 pb-2 pt-4">
                  {failureBanner}

                  {!isCompleted ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Complete task"
                      accessibilityState={{ disabled: isFinishing }}
                      disabled={isFinishing}
                      onPress={completeTask}
                      className={`min-h-14 items-center justify-center rounded-2xl bg-zinc-950 px-5 active:bg-zinc-700 ${
                        isFinishing ? "opacity-40" : ""
                      }`}
                    >
                      <Text className="text-base font-semibold text-white">
                        {finishKind === "complete"
                          ? "Completing..."
                          : "Complete task"}
                      </Text>
                    </Pressable>
                  ) : null}

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Exit focus"
                    accessibilityState={{ disabled: isFinishing }}
                    disabled={isFinishing}
                    onPress={exitFocus}
                    className={`min-h-12 items-center justify-center rounded-xl px-5 active:bg-zinc-100 ${
                      isFinishing ? "opacity-40" : ""
                    }`}
                  >
                    <Text className="text-base font-medium text-zinc-600">
                      {finishKind === "exit" || finishKind === "keep"
                        ? "Saving..."
                        : "Exit focus"}
                    </Text>
                  </Pressable>
                </View>
              )}
            </View>
          )}
        </View>
      </SafeAreaView>
    </>
  );
}
