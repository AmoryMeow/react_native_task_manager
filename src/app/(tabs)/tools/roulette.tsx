import { useCallback, useEffect, useRef, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  ReduceMotion,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

import type { Task } from "@/entities/task/model/types";
import { createTaskRepository } from "@/entities/task/repository/task-repository";
import {
  DEFAULT_ROULETTE_GROUPS,
  getEligibleRouletteTasks,
  selectRouletteTask,
  type RouletteTaskGroupId,
} from "@/features/task-roulette/lib/select-roulette-task";
import { formatTaskSelectionContext } from "@/features/task-selection/lib/format-task-selection-context";
import { TaskGroupFilter } from "@/features/task-selection/ui/task-group-filter";

const reelViewportHeight = 288;
const reelItemHeight = 144;
const reelItemGap = 12;
const reelItemStep = reelItemHeight + reelItemGap;
const reelWinnerIndex = 10;
const reelDuration = 1750;

type RouletteInteractionState = "idle" | "spinning" | "result";

function getCenteredReelOffset(itemIndex: number): number {
  return (reelViewportHeight - reelItemHeight) / 2 - itemIndex * reelItemStep;
}

function buildReelSequence(
  eligibleTasks: readonly Task[],
  winningTask: Task,
  previousTask: Task | null,
): Task[] {
  const sequence: Task[] = [];
  const previousEligibleTask = previousTask
    ? eligibleTasks.find((task) => task.id === previousTask.id)
    : undefined;

  if (previousEligibleTask) sequence.push(previousEligibleTask);

  while (sequence.length < reelWinnerIndex) {
    const previousVisualTask = sequence.at(-1);
    const isBeforeWinner = sequence.length === reelWinnerIndex - 1;
    const preferredCandidates = eligibleTasks.filter(
      (task) =>
        task.id !== previousVisualTask?.id &&
        (!isBeforeWinner || task.id !== winningTask.id),
    );
    const candidates =
      preferredCandidates.length > 0 ? preferredCandidates : eligibleTasks;
    sequence.push(candidates[Math.floor(Math.random() * candidates.length)]);
  }

  sequence.push(winningTask);

  const trailingCandidates = eligibleTasks.filter(
    (task) => task.id !== winningTask.id,
  );
  sequence.push(
    trailingCandidates.length > 0
      ? trailingCandidates[Math.floor(Math.random() * trailingCandidates.length)]
      : winningTask,
  );

  return sequence;
}

export default function TaskRouletteScreen() {
  const db = useSQLiteContext();
  const prefersReducedMotion = useReducedMotion();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [reelTasks, setReelTasks] = useState<Task[]>([]);
  const [winningReelIndex, setWinningReelIndex] = useState<number | null>(null);
  const [selectedGroups, setSelectedGroups] = useState<
    RouletteTaskGroupId[]
  >([...DEFAULT_ROULETTE_GROUPS]);
  const [interactionState, setInteractionState] =
    useState<RouletteInteractionState>("idle");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isFocusNavigationPending, setIsFocusNavigationPending] =
    useState(false);
  const selectedTaskIdRef = useRef<string | null>(null);
  const shouldPreserveResultOnReturnRef = useRef(false);
  const selectedGroupsRef = useRef<readonly RouletteTaskGroupId[]>(
    DEFAULT_ROULETTE_GROUPS,
  );
  const loadRequestIdRef = useRef(0);
  const spinRunIdRef = useRef(0);
  const spinFrameRef = useRef<ReturnType<typeof requestAnimationFrame> | null>(
    null,
  );
  const pendingSelectionRef = useRef<Task | null>(null);
  const focusNavigationPendingRef = useRef(false);
  const reelTranslateY = useSharedValue(0);
  const animatedReelStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: reelTranslateY.value }],
  }));

  const cancelSpin = useCallback(
    (resetUi: boolean) => {
      spinRunIdRef.current += 1;
      pendingSelectionRef.current = null;

      if (spinFrameRef.current !== null) {
        cancelAnimationFrame(spinFrameRef.current);
        spinFrameRef.current = null;
      }

      cancelAnimation(reelTranslateY);

      if (resetUi) {
        reelTranslateY.set(0);
        setReelTasks([]);
        setWinningReelIndex(null);
      }
    },
    [reelTranslateY],
  );

  const completeSpin = useCallback((runId: number) => {
    if (spinRunIdRef.current !== runId) return;

    const finalSelection = pendingSelectionRef.current;

    if (!finalSelection) return;

    selectedTaskIdRef.current = finalSelection.id;
    pendingSelectionRef.current = null;
    setSelectedTask(finalSelection);
    setInteractionState("result");
  }, []);

  const showResultImmediately = useCallback(
    (
      finalSelection: Task,
      eligibleTasks: readonly Task[],
      previousTask: Task | null = null,
    ) => {
      const nextReelTasks =
        eligibleTasks.length === 1
          ? [finalSelection]
          : buildReelSequence(eligibleTasks, finalSelection, previousTask);
      const nextWinningIndex =
        eligibleTasks.length === 1 ? 0 : reelWinnerIndex;

      reelTranslateY.set(getCenteredReelOffset(nextWinningIndex));
      selectedTaskIdRef.current = finalSelection.id;
      setReelTasks(nextReelTasks);
      setWinningReelIndex(nextWinningIndex);
      setSelectedTask(finalSelection);
      setInteractionState("result");
    },
    [reelTranslateY],
  );

  useEffect(
    () => () => {
      cancelSpin(false);
    },
    [cancelSpin],
  );

  const loadTasks = useCallback(
    async (preserveResult = false) => {
      cancelSpin(true);

      const requestId = ++loadRequestIdRef.current;

      setIsLoading(true);
      setLoadError(null);

      if (!preserveResult) {
        selectedTaskIdRef.current = null;
        setSelectedTask(null);
        setInteractionState("idle");
      }

      try {
        const savedTasks = await createTaskRepository(db).getTasks();

        if (loadRequestIdRef.current !== requestId) return;

        const currentDate = new Date();
        const eligibleTasks = getEligibleRouletteTasks(
          savedTasks,
          currentDate,
          selectedGroupsRef.current,
        );
        const currentSelection = eligibleTasks.find(
          (task) => task.id === selectedTaskIdRef.current,
        );

        setTasks(savedTasks);

        if (preserveResult && currentSelection) {
          showResultImmediately(currentSelection, eligibleTasks);
        } else {
          selectedTaskIdRef.current = null;
          setSelectedTask(null);
          setInteractionState("idle");
        }
      } catch (error) {
        if (loadRequestIdRef.current !== requestId) return;

        console.error("Failed to load tasks for Task Roulette:", error);
        setLoadError("Could not load tasks");
      } finally {
        if (loadRequestIdRef.current === requestId) setIsLoading(false);
      }
    },
    [cancelSpin, db, showResultImmediately],
  );

  useFocusEffect(
    useCallback(() => {
      focusNavigationPendingRef.current = false;
      setIsFocusNavigationPending(false);

      const preserveResult = shouldPreserveResultOnReturnRef.current;
      shouldPreserveResultOnReturnRef.current = false;
      void loadTasks(preserveResult);

      return () => {
        loadRequestIdRef.current += 1;
        cancelSpin(false);
      };
    }, [cancelSpin, loadTasks]),
  );

  const spin = () => {
    if (
      interactionState === "spinning" ||
      focusNavigationPendingRef.current
    ) {
      return;
    }

    const currentDate = new Date();
    const eligibleTasks = getEligibleRouletteTasks(
      tasks,
      currentDate,
      selectedGroupsRef.current,
    );
    const finalSelection = selectRouletteTask(
      tasks,
      currentDate,
      selectedGroupsRef.current,
      selectedTask?.id,
    );

    cancelSpin(true);

    if (!finalSelection) {
      selectedTaskIdRef.current = null;
      setSelectedTask(null);
      setInteractionState("idle");
      return;
    }

    if (eligibleTasks.length === 1 || prefersReducedMotion) {
      showResultImmediately(finalSelection, eligibleTasks, selectedTask);
      return;
    }

    const runId = spinRunIdRef.current;
    const nextReelTasks = buildReelSequence(
      eligibleTasks,
      finalSelection,
      selectedTask,
    );
    const startOffset = getCenteredReelOffset(0);
    const finalOffset = getCenteredReelOffset(reelWinnerIndex);

    pendingSelectionRef.current = finalSelection;
    reelTranslateY.set(startOffset);
    setReelTasks(nextReelTasks);
    setWinningReelIndex(reelWinnerIndex);
    setInteractionState("spinning");

    spinFrameRef.current = requestAnimationFrame(() => {
      spinFrameRef.current = null;

      if (spinRunIdRef.current !== runId) return;

      reelTranslateY.set(
        withTiming(
          finalOffset,
          {
            duration: reelDuration,
            easing: Easing.out(Easing.cubic),
            reduceMotion: ReduceMotion.System,
          },
          (finished) => {
            if (finished) runOnJS(completeSpin)(runId);
          },
        ),
      );
    });
  };

  const updateSelectedGroups = (
    nextGroups: readonly RouletteTaskGroupId[],
  ) => {
    if (
      nextGroups.length === selectedGroups.length &&
      nextGroups.every((groupId) => selectedGroups.includes(groupId))
    ) {
      return;
    }

    cancelSpin(true);

    selectedGroupsRef.current = nextGroups;
    selectedTaskIdRef.current = null;
    setSelectedGroups([...nextGroups]);
    setSelectedTask(null);
    setInteractionState("idle");
  };

  const openSelectedTask = () => {
    if (
      !selectedTask ||
      interactionState !== "result" ||
      focusNavigationPendingRef.current
    ) {
      return;
    }

    shouldPreserveResultOnReturnRef.current = true;

    router.push({
      pathname: "/task/[id]",
      params: { id: selectedTask.id, from: "roulette" },
    });
  };

  const startFocus = () => {
    if (
      !selectedTask ||
      selectedTask.status !== "todo" ||
      interactionState !== "result" ||
      focusNavigationPendingRef.current
    ) {
      return;
    }

    focusNavigationPendingRef.current = true;
    setIsFocusNavigationPending(true);
    shouldPreserveResultOnReturnRef.current = true;

    router.push({
      pathname: "/focus/[id]",
      params: { id: selectedTask.id, from: "roulette" },
    });
  };

  const isSpinning = interactionState === "spinning";
  const hasResult = interactionState === "result" && selectedTask !== null;
  const resultActionsDisabled = isSpinning || isFocusNavigationPending;
  const eligibleTasks = getEligibleRouletteTasks(
    tasks,
    new Date(),
    selectedGroups,
  );

  return (
    <SafeAreaView
      edges={["left", "right"]}
      className="flex-1 bg-zinc-100"
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerClassName="flex-grow px-4 pb-6 pt-4"
      >
        <TaskGroupFilter
          description="Task Roulette will choose from the selected groups."
          selectedGroups={selectedGroups}
          onChange={updateSelectedGroups}
        />

        {isLoading ? (
          <View className="flex-1 items-center justify-center gap-3 py-12">
            <ActivityIndicator color="#18181b" />
            <Text className="text-sm text-zinc-500">Choosing a task…</Text>
          </View>
        ) : loadError ? (
          <View className="flex-1 items-center justify-center gap-4 px-6 py-12">
            <Text className="text-center text-base font-medium text-zinc-900">
              {loadError}
            </Text>
            <Text className="text-center text-sm leading-5 text-zinc-500">
              Your tasks are still safely stored on this device.
            </Text>
            <Pressable
              accessibilityRole="button"
              className="min-h-12 justify-center rounded-xl border border-zinc-300 bg-white px-5 active:bg-zinc-50"
              onPress={() => void loadTasks()}
            >
              <Text className="text-center text-sm font-semibold text-zinc-900">
                Retry
              </Text>
            </Pressable>
          </View>
        ) : selectedGroups.length === 0 ? (
          <View className="flex-1 gap-6">
            <View className="flex-1 items-center justify-center gap-3 px-6 py-12">
              <Text className="text-center text-xl font-semibold text-zinc-900">
                Choose at least one group
              </Text>
              <Text className="text-center text-sm leading-5 text-zinc-500">
                Select the groups you want Task Roulette to choose from.
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Spin Task Roulette"
              accessibilityState={{ disabled: true }}
              disabled
              className="min-h-12 justify-center rounded-xl bg-zinc-950 px-5 opacity-40"
            >
              <Text className="text-center text-base font-semibold text-white">
                Spin
              </Text>
            </Pressable>
          </View>
        ) : eligibleTasks.length === 0 ? (
          <View className="flex-1 gap-6">
            <View className="flex-1 items-center justify-center gap-3 px-6 py-12">
              <Text className="text-center text-xl font-semibold text-zinc-900">
                No tasks in these groups
              </Text>
              <Text className="text-center text-sm leading-5 text-zinc-500">
                Choose another group or add an unfinished task to one of the
                selected groups.
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Spin Task Roulette"
              accessibilityState={{ disabled: true }}
              disabled
              className="min-h-12 justify-center rounded-xl bg-zinc-950 px-5 opacity-40"
            >
              <Text className="text-center text-base font-semibold text-white">
                Spin
              </Text>
            </Pressable>
          </View>
        ) : (
          <View className="flex-1 gap-6">
            <View className="flex-1 justify-center gap-4">
              {interactionState === "idle" ? (
                <View className="h-4" />
              ) : (
                <Text className="text-center text-xs font-semibold uppercase tracking-widest text-zinc-400">
                  {isSpinning ? "Spinning…" : "Your next task"}
                </Text>
              )}

              {interactionState === "idle" ? (
                <View
                  className="items-center justify-center rounded-3xl border border-zinc-200 bg-white px-8"
                  style={{ height: reelViewportHeight }}
                >
                  <Text className="text-center text-xl font-semibold leading-7 text-zinc-500">
                    Ready to pick your next task?
                  </Text>
                </View>
              ) : (
                <View
                  className="relative overflow-hidden rounded-3xl border border-zinc-200 bg-zinc-100"
                  style={{ height: reelViewportHeight }}
                >
                  <Animated.View
                    accessibilityElementsHidden={isSpinning}
                    importantForAccessibility={
                      isSpinning ? "no-hide-descendants" : "auto"
                    }
                    style={animatedReelStyle}
                  >
                    {reelTasks.map((task, index) => {
                      const isWinningCard =
                        interactionState === "result" &&
                        winningReelIndex === index;

                      return (
                        <View
                          key={`${index}-${task.id}`}
                          accessibilityElementsHidden={!isWinningCard}
                          importantForAccessibility={
                            isWinningCard ? "auto" : "no-hide-descendants"
                          }
                          className={`mx-3 justify-center rounded-2xl border px-5 ${
                            isWinningCard
                              ? "border-zinc-400 bg-white"
                              : interactionState === "result"
                                ? "border-zinc-200 bg-white opacity-60"
                                : "border-zinc-200 bg-white"
                          }`}
                          style={{
                            height: reelItemHeight,
                            marginBottom: reelItemGap,
                          }}
                        >
                          <Text className="mb-2 text-center text-xs font-medium text-zinc-500">
                            {formatTaskSelectionContext(task, new Date())}
                          </Text>
                          <Text
                            numberOfLines={3}
                            className={`text-center text-xl font-bold leading-7 tracking-tight ${
                              interactionState !== "result" || isWinningCard
                                ? "text-zinc-950"
                                : "text-zinc-600"
                            }`}
                          >
                            {task.title}
                          </Text>
                        </View>
                      );
                    })}
                  </Animated.View>

                  <View
                    pointerEvents="none"
                    className="absolute left-3 right-3 rounded-2xl border border-zinc-400"
                    style={{
                      height: reelItemHeight,
                      top: (reelViewportHeight - reelItemHeight) / 2,
                    }}
                  />
                </View>
              )}
            </View>

            <View className="gap-3">
              {hasResult ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Start focus on ${selectedTask.title}`}
                  accessibilityState={{ disabled: resultActionsDisabled }}
                  disabled={resultActionsDisabled}
                  className={`min-h-12 justify-center rounded-xl bg-zinc-950 px-5 active:bg-zinc-800 ${
                    resultActionsDisabled ? "opacity-40" : ""
                  }`}
                  onPress={startFocus}
                >
                  <Text className="text-center text-base font-semibold text-white">
                    Start focus
                  </Text>
                </Pressable>
              ) : (
                <View
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  pointerEvents="none"
                  className="min-h-12 justify-center px-5 opacity-0"
                >
                  <Text className="text-center text-base font-semibold">
                    Start focus
                  </Text>
                </View>
              )}

              <View className={hasResult ? "flex-row gap-3" : ""}>
                {hasResult ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${selectedTask.title}`}
                    accessibilityState={{ disabled: resultActionsDisabled }}
                    disabled={resultActionsDisabled}
                    className={`min-h-12 flex-1 justify-center rounded-xl border border-zinc-300 bg-white px-4 active:bg-zinc-50 ${
                      resultActionsDisabled ? "opacity-40" : ""
                    }`}
                    onPress={openSelectedTask}
                  >
                    <Text className="text-center text-base font-semibold text-zinc-900">
                      Open task
                    </Text>
                  </Pressable>
                ) : null}

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Spin Task Roulette"
                  accessibilityState={{ disabled: resultActionsDisabled }}
                  disabled={resultActionsDisabled}
                  className={`min-h-12 justify-center rounded-xl px-4 ${
                    hasResult
                      ? "flex-1 border border-zinc-300 bg-white active:bg-zinc-50"
                      : "bg-zinc-950 px-5 active:bg-zinc-800"
                  } ${resultActionsDisabled ? "opacity-40" : ""}`}
                  onPress={spin}
                >
                  <Text
                    className={`text-center text-base font-semibold ${
                      hasResult ? "text-zinc-900" : "text-white"
                    }`}
                  >
                    {isSpinning
                      ? "Spinning…"
                      : interactionState === "result"
                        ? "Spin again"
                        : "Spin"}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
