import { useCallback, useRef, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import type { Task } from "@/entities/task/model/types";
import { createTaskRepository } from "@/entities/task/repository/task-repository";
import {
  selectTaskDuelPair,
  type TaskDuelPair,
} from "@/features/task-duel/lib/select-task-duel-pair";
import { formatTaskSelectionContext } from "@/features/task-selection/lib/format-task-selection-context";
import {
  DEFAULT_TASK_SELECTION_GROUPS,
  getEligibleTasks,
  type TaskSelectionGroupId,
} from "@/features/task-selection/lib/get-eligible-tasks";
import { TaskGroupFilter } from "@/features/task-selection/ui/task-group-filter";

interface DuelTaskCardProps {
  task: Task;
  onPress: () => void;
  compact: boolean;
}

function DuelTaskCard({ task, onPress, compact }: DuelTaskCardProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Choose ${task.title}`}
      className={`${compact ? "" : "flex-1"} justify-center rounded-2xl border border-zinc-200 bg-white px-5 py-5 active:bg-zinc-50`}
      style={{ minHeight: compact ? 148 : 236 }}
      onPress={onPress}
    >
      <Text className="mb-3 text-center text-xs font-semibold uppercase tracking-wider text-zinc-400">
        {formatTaskSelectionContext(task, new Date())}
      </Text>
      <Text
        numberOfLines={compact ? 3 : 5}
        className="text-center text-xl font-bold leading-7 tracking-tight text-zinc-950"
      >
        {task.title}
      </Text>
    </Pressable>
  );
}

export default function TaskDuelScreen() {
  const db = useSQLiteContext();
  const { width } = useWindowDimensions();
  const useVerticalCards = width < 390;
  const [tasks, setTasks] = useState<Task[]>([]);
  const [pair, setPair] = useState<TaskDuelPair | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [selectedGroups, setSelectedGroups] = useState<
    TaskSelectionGroupId[]
  >([...DEFAULT_TASK_SELECTION_GROUPS]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const selectedGroupsRef = useRef<readonly TaskSelectionGroupId[]>(
    DEFAULT_TASK_SELECTION_GROUPS,
  );
  const pairRef = useRef<TaskDuelPair | null>(null);
  const selectedTaskIdRef = useRef<string | null>(null);
  const isReturningFromTaskDetailsRef = useRef(false);
  const loadRequestIdRef = useRef(0);

  const setCurrentPair = useCallback((nextPair: TaskDuelPair | null) => {
    pairRef.current = nextPair;
    setPair(nextPair);
  }, []);

  const resetToComparison = useCallback(
    (
      eligibleTasks: readonly Task[],
      previousPair?: TaskDuelPair | null,
    ) => {
      const previousTaskIds = previousPair
        ? ([previousPair[0].id, previousPair[1].id] as const)
        : undefined;
      const nextPair = selectTaskDuelPair(
        eligibleTasks,
        previousTaskIds,
      );

      selectedTaskIdRef.current = null;
      setSelectedTask(null);
      setCurrentPair(nextPair);
    },
    [setCurrentPair],
  );

  const loadTasks = useCallback(
    async (preserveSelection = false) => {
      const requestId = ++loadRequestIdRef.current;

      setIsLoading(true);
      setLoadError(null);

      try {
        const savedTasks = await createTaskRepository(db).getTasks();

        if (loadRequestIdRef.current !== requestId) return;

        const eligibleTasks = getEligibleTasks(
          savedTasks,
          new Date(),
          selectedGroupsRef.current,
        );

        setTasks(savedTasks);

        if (preserveSelection && selectedTaskIdRef.current) {
          const refreshedResult = eligibleTasks.find(
            (task) => task.id === selectedTaskIdRef.current,
          );

          if (refreshedResult) {
            setSelectedTask(refreshedResult);
            return;
          }
        }

        if (preserveSelection && pairRef.current) {
          const refreshedPairTasks = pairRef.current
            .map((currentTask) =>
              eligibleTasks.find((task) => task.id === currentTask.id),
            )
            .filter((task): task is Task => Boolean(task));

          if (refreshedPairTasks.length === 2) {
            selectedTaskIdRef.current = null;
            setSelectedTask(null);
            setCurrentPair([refreshedPairTasks[0], refreshedPairTasks[1]]);
            return;
          }
        }

        resetToComparison(eligibleTasks);
      } catch (error) {
        if (loadRequestIdRef.current !== requestId) return;

        console.error("Failed to load tasks for Task Duel:", error);
        setLoadError("Could not load tasks");
      } finally {
        if (loadRequestIdRef.current === requestId) setIsLoading(false);
      }
    },
    [db, resetToComparison, setCurrentPair],
  );

  useFocusEffect(
    useCallback(() => {
      const preserveSelection = isReturningFromTaskDetailsRef.current;
      isReturningFromTaskDetailsRef.current = false;
      void loadTasks(preserveSelection);

      return () => {
        loadRequestIdRef.current += 1;
      };
    }, [loadTasks]),
  );

  const eligibleTasks = getEligibleTasks(
    tasks,
    new Date(),
    selectedGroups,
  );
  const onlyTask = eligibleTasks.length === 1 ? eligibleTasks[0] : null;
  const hasAlternativePairs = eligibleTasks.length >= 3;

  const updateSelectedGroups = (
    nextGroups: readonly TaskSelectionGroupId[],
  ) => {
    if (
      nextGroups.length === selectedGroups.length &&
      nextGroups.every((groupId) => selectedGroups.includes(groupId))
    ) {
      return;
    }

    selectedGroupsRef.current = nextGroups;
    setSelectedGroups([...nextGroups]);
    resetToComparison(
      getEligibleTasks(tasks, new Date(), nextGroups),
    );
  };

  const chooseTask = (task: Task) => {
    selectedTaskIdRef.current = task.id;
    setSelectedTask(task);
  };

  const drawNewPair = () => {
    if (!hasAlternativePairs) return;
    resetToComparison(eligibleTasks, pairRef.current);
  };

  const openTask = (task: Task) => {
    isReturningFromTaskDetailsRef.current = true;
    router.push({
      pathname: "/task/[id]",
      params: { id: task.id },
    });
  };

  return (
    <SafeAreaView edges={["left", "right"]} className="flex-1 bg-zinc-100">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerClassName="flex-grow px-4 pb-6 pt-4"
      >
        <TaskGroupFilter
          description="Task Duel will compare tasks from the selected groups."
          selectedGroups={selectedGroups}
          onChange={updateSelectedGroups}
        />

        {isLoading ? (
          <View className="flex-1 items-center justify-center gap-3 py-12">
            <ActivityIndicator color="#18181b" />
            <Text className="text-sm text-zinc-500">Preparing a pair…</Text>
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
        ) : eligibleTasks.length === 0 ? (
          <View className="flex-1 items-center justify-center gap-3 px-6 py-12">
            <Text className="text-center text-xl font-semibold text-zinc-900">
              No tasks to compare.
            </Text>
            <Text className="text-center text-sm leading-5 text-zinc-500">
              Choose other groups or add an unfinished task.
            </Text>
          </View>
        ) : onlyTask ? (
          <View className="flex-1 gap-6">
            <View className="flex-1 justify-center gap-4">
              <Text className="text-center text-sm leading-5 text-zinc-500">
                Only one task available. No need to choose this time.
              </Text>
              <View className="min-h-56 justify-center rounded-3xl border border-zinc-200 bg-white px-6 py-8">
                <Text className="mb-3 text-center text-sm font-medium text-zinc-500">
                  {formatTaskSelectionContext(onlyTask, new Date())}
                </Text>
                <Text
                  numberOfLines={5}
                  className="text-center text-3xl font-bold leading-10 tracking-tight text-zinc-950"
                >
                  {onlyTask.title}
                </Text>
              </View>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Open ${onlyTask.title}`}
              className="min-h-12 justify-center rounded-xl bg-zinc-950 px-5 active:bg-zinc-800"
              onPress={() => openTask(onlyTask)}
            >
              <Text className="text-center text-base font-semibold text-white">
                Open task
              </Text>
            </Pressable>
          </View>
        ) : selectedTask ? (
          <View className="flex-1 gap-6">
            <View className="flex-1 justify-center gap-4">
              <Text className="text-center text-xs font-semibold uppercase tracking-widest text-zinc-400">
                Your choice
              </Text>
              <View className="min-h-64 justify-center rounded-3xl border border-zinc-300 bg-white px-6 py-8">
                <Text className="mb-3 text-center text-sm font-medium text-zinc-500">
                  {formatTaskSelectionContext(selectedTask, new Date())}
                </Text>
                <Text
                  numberOfLines={5}
                  className="text-center text-3xl font-bold leading-10 tracking-tight text-zinc-950"
                >
                  {selectedTask.title}
                </Text>
              </View>
            </View>
            <View className="gap-3">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Open ${selectedTask.title}`}
                className="min-h-12 justify-center rounded-xl bg-zinc-950 px-5 active:bg-zinc-800"
                onPress={() => openTask(selectedTask)}
              >
                <Text className="text-center text-base font-semibold text-white">
                  Open task
                </Text>
              </Pressable>
              {hasAlternativePairs && (
                <Pressable
                  accessibilityRole="button"
                  className="min-h-12 justify-center rounded-xl border border-zinc-300 bg-white px-5 active:bg-zinc-50"
                  onPress={drawNewPair}
                >
                  <Text className="text-center text-base font-semibold text-zinc-900">
                    Try another pair
                  </Text>
                </Pressable>
              )}
            </View>
          </View>
        ) : pair ? (
          <View className="flex-1 gap-6">
            <View className="flex-1 justify-center gap-4">
              <Text className="text-center text-xl font-semibold tracking-tight text-zinc-950">
                Which one would you rather do?
              </Text>
              <View
                className={useVerticalCards ? "gap-3" : "flex-row gap-3"}
              >
                <DuelTaskCard
                  compact={useVerticalCards}
                  task={pair[0]}
                  onPress={() => chooseTask(pair[0])}
                />
                <DuelTaskCard
                  compact={useVerticalCards}
                  task={pair[1]}
                  onPress={() => chooseTask(pair[1])}
                />
              </View>
            </View>
            {hasAlternativePairs && (
              <Pressable
                accessibilityRole="button"
                className="min-h-12 justify-center rounded-xl border border-zinc-300 bg-white px-5 active:bg-zinc-50"
                onPress={drawNewPair}
              >
                <Text className="text-center text-base font-semibold text-zinc-900">
                  New pair
                </Text>
              </Pressable>
            )}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
