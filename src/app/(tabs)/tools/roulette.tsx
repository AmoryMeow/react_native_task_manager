import { useCallback, useEffect, useRef, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import {
  ActivityIndicator,
  Modal,
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

import { toLocalDateString } from "@/entities/task/lib/format-task-schedule";
import type { Task } from "@/entities/task/model/types";
import { createTaskRepository } from "@/entities/task/repository/task-repository";
import {
  DEFAULT_ROULETTE_GROUPS,
  getEligibleRouletteTasks,
  selectRouletteTask,
  type RouletteTaskGroupId,
} from "@/features/task-roulette/lib/select-roulette-task";
import { ChevronIcon } from "@/shared/ui/icons/chevron-icon";

const rouletteGroupOptions: readonly {
  id: RouletteTaskGroupId;
  label: string;
}[] = [
  { id: "earlier", label: "Earlier" },
  { id: "today", label: "Today" },
  { id: "upcoming", label: "Upcoming" },
  { id: "soon", label: "Soon" },
  { id: "someday", label: "Someday" },
  { id: "inbox", label: "Inbox" },
];
const allRouletteGroups = rouletteGroupOptions.map((group) => group.id);
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

function formatGroupSelection(groups: readonly RouletteTaskGroupId[]): string {
  if (groups.length === 0) return "No groups selected";
  if (groups.length === rouletteGroupOptions.length) return "All groups";

  const selectedLabels = rouletteGroupOptions
    .filter((group) => groups.includes(group.id))
    .map((group) => group.label);

  if (selectedLabels.length <= 2) return selectedLabels.join(" + ");

  return `${selectedLabels[0]} + ${selectedLabels.length - 1} more`;
}

function formatScheduleContext(task: Task, currentDate: Date): string {
  if (task.schedule.type === "inbox") return "Inbox";
  if (task.schedule.type === "soon") return "Soon";
  if (task.schedule.type === "someday") return "Someday";

  const currentLocalDate = toLocalDateString(currentDate);

  if (task.schedule.date === currentLocalDate) return "Today";

  const [year, month, day] = task.schedule.date.split("-").map(Number);
  const scheduledDate = new Date(year, month - 1, day);
  const formattedDate = scheduledDate.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    ...(year !== currentDate.getFullYear() ? { year: "numeric" } : {}),
  });
  const groupLabel =
    task.schedule.date < currentLocalDate ? "Earlier" : "Upcoming";

  return `${groupLabel} · ${formattedDate}`;
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
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [interactionState, setInteractionState] =
    useState<RouletteInteractionState>("idle");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const selectedTaskIdRef = useRef<string | null>(null);
  const isReturningFromTaskDetailsRef = useRef(false);
  const selectedGroupsRef = useRef<readonly RouletteTaskGroupId[]>(
    DEFAULT_ROULETTE_GROUPS,
  );
  const loadRequestIdRef = useRef(0);
  const spinRunIdRef = useRef(0);
  const spinFrameRef = useRef<ReturnType<typeof requestAnimationFrame> | null>(
    null,
  );
  const pendingSelectionRef = useRef<Task | null>(null);
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
      const preserveResult = isReturningFromTaskDetailsRef.current;
      isReturningFromTaskDetailsRef.current = false;
      void loadTasks(preserveResult);

      return () => {
        loadRequestIdRef.current += 1;
        cancelSpin(false);
      };
    }, [cancelSpin, loadTasks]),
  );

  const spin = () => {
    if (interactionState === "spinning") return;

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

  const toggleGroup = (groupId: RouletteTaskGroupId) => {
    const nextSelectedGroupIds = new Set(selectedGroups);

    if (nextSelectedGroupIds.has(groupId)) {
      nextSelectedGroupIds.delete(groupId);
    } else {
      nextSelectedGroupIds.add(groupId);
    }

    updateSelectedGroups(
      rouletteGroupOptions
        .filter((group) => nextSelectedGroupIds.has(group.id))
        .map((group) => group.id),
    );
  };

  const openSelectedTask = () => {
    if (!selectedTask || interactionState !== "result") return;

    isReturningFromTaskDetailsRef.current = true;

    router.push({
      pathname: "/task/[id]",
      params: { id: selectedTask.id },
    });
  };

  const isSpinning = interactionState === "spinning";
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
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Choose task groups. ${formatGroupSelection(selectedGroups)}`}
          accessibilityHint="Opens task group filters"
          className="mb-3 min-h-12 flex-row items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-2 active:bg-zinc-50"
          onPress={() => setIsFilterOpen(true)}
        >
          <Text className="text-sm text-zinc-500">Choose from</Text>
          <View className="min-w-0 flex-1 flex-row items-center justify-end gap-2">
            <Text
              numberOfLines={1}
              className="shrink text-right text-sm font-semibold text-zinc-900"
            >
              {formatGroupSelection(selectedGroups)}
            </Text>
            <ChevronIcon direction="down" size={12} />
          </View>
        </Pressable>

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
                            {formatScheduleContext(task, new Date())}
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
              {selectedTask && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${selectedTask.title}`}
                  accessibilityState={{ disabled: isSpinning }}
                  disabled={isSpinning}
                  className={`min-h-12 justify-center rounded-xl bg-zinc-950 px-5 active:bg-zinc-800 ${
                    isSpinning ? "opacity-40" : ""
                  }`}
                  onPress={openSelectedTask}
                >
                  <Text className="text-center text-base font-semibold text-white">
                    Open task
                  </Text>
                </Pressable>
              )}
              {!selectedTask && (
                <View
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  pointerEvents="none"
                  className="min-h-12 justify-center px-5 opacity-0"
                >
                  <Text className="text-center text-base font-semibold">
                    Open task
                  </Text>
                </View>
              )}

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Spin Task Roulette"
                accessibilityState={{ disabled: isSpinning }}
                disabled={isSpinning}
                className={`min-h-12 justify-center rounded-xl px-5 ${
                  selectedTask
                    ? "border border-zinc-300 bg-white active:bg-zinc-50"
                    : "bg-zinc-950 active:bg-zinc-800"
                } ${isSpinning ? "opacity-40" : ""}`}
                onPress={spin}
              >
                <Text
                  className={`text-center text-base font-semibold ${
                    selectedTask ? "text-zinc-900" : "text-white"
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
        )}
      </ScrollView>

      <Modal
        allowSwipeDismissal
        animationType="slide"
        presentationStyle="pageSheet"
        visible={isFilterOpen}
        onRequestClose={() => setIsFilterOpen(false)}
      >
        <SafeAreaView className="flex-1 bg-zinc-100">
          <View className="border-b border-zinc-200 px-5 pb-4 pt-2">
            <Text className="text-xl font-bold tracking-tight text-zinc-950">
              Choose groups
            </Text>
            <Text className="mt-1 text-sm leading-5 text-zinc-500">
              Task Roulette will choose from the selected groups.
            </Text>
          </View>

          <View className="flex-row gap-2 px-4 py-3">
            <Pressable
              accessibilityRole="button"
              className="min-h-11 flex-1 justify-center rounded-xl border border-zinc-300 bg-white px-3 active:bg-zinc-50"
              onPress={() => updateSelectedGroups(allRouletteGroups)}
            >
              <Text className="text-center text-sm font-semibold text-zinc-900">
                Select all
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              className="min-h-11 flex-1 justify-center rounded-xl border border-zinc-300 bg-white px-3 active:bg-zinc-50"
              onPress={() => updateSelectedGroups(DEFAULT_ROULETTE_GROUPS)}
            >
              <Text className="text-center text-sm font-semibold text-zinc-900">
                Reset
              </Text>
            </Pressable>
          </View>

          <ScrollView
            className="flex-1"
            contentContainerClassName="px-4 pb-4"
            showsVerticalScrollIndicator={false}
          >
            <View className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
              {rouletteGroupOptions.map((group, index) => {
                const isSelected = selectedGroups.includes(group.id);

                return (
                  <Pressable
                    key={group.id}
                    accessibilityRole="checkbox"
                    accessibilityLabel={`Include ${group.label} tasks`}
                    accessibilityState={{ checked: isSelected }}
                    className={`min-h-14 flex-row items-center justify-between gap-4 px-4 py-2 active:bg-zinc-50 ${
                      index < rouletteGroupOptions.length - 1
                        ? "border-b border-zinc-200"
                        : ""
                    }`}
                    onPress={() => toggleGroup(group.id)}
                  >
                    <Text className="flex-1 text-base font-medium text-zinc-900">
                      {group.label}
                    </Text>
                    <View
                      className={
                        isSelected
                          ? "h-6 w-6 items-center justify-center rounded-md bg-zinc-950"
                          : "h-6 w-6 rounded-md border-2 border-zinc-400"
                      }
                    >
                      {isSelected && (
                        <Text className="text-sm font-bold text-white">✓</Text>
                      )}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          <View className="border-t border-zinc-200 bg-zinc-100 px-4 pb-2 pt-3">
            <Pressable
              accessibilityRole="button"
              className="min-h-12 justify-center rounded-xl bg-zinc-950 px-5 active:bg-zinc-800"
              onPress={() => setIsFilterOpen(false)}
            >
              <Text className="text-center text-base font-semibold text-white">
                Done
              </Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}
