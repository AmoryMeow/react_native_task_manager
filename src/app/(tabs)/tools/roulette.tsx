import { useCallback, useRef, useState } from "react";
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
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [selectedGroups, setSelectedGroups] = useState<
    RouletteTaskGroupId[]
  >([...DEFAULT_ROULETTE_GROUPS]);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const selectedTaskIdRef = useRef<string | null>(null);
  const selectedGroupsRef = useRef<readonly RouletteTaskGroupId[]>(
    DEFAULT_ROULETTE_GROUPS,
  );
  const loadRequestIdRef = useRef(0);

  const loadTasks = useCallback(async () => {
    const requestId = ++loadRequestIdRef.current;

    setIsLoading(true);
    setLoadError(null);

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
      const nextSelection =
        currentSelection ??
        selectRouletteTask(
          savedTasks,
          currentDate,
          selectedGroupsRef.current,
          selectedTaskIdRef.current ?? undefined,
        );

      if (nextSelection) selectedTaskIdRef.current = nextSelection.id;
      setTasks(savedTasks);
      setSelectedTask(nextSelection);
    } catch (error) {
      if (loadRequestIdRef.current !== requestId) return;

      console.error("Failed to load tasks for Task Roulette:", error);
      setLoadError("Could not load tasks");
    } finally {
      if (loadRequestIdRef.current === requestId) setIsLoading(false);
    }
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      void loadTasks();

      return () => {
        loadRequestIdRef.current += 1;
      };
    }, [loadTasks]),
  );

  const tryAnotherTask = () => {
    const nextSelection = selectRouletteTask(
      tasks,
      new Date(),
      selectedGroupsRef.current,
      selectedTask?.id,
    );

    if (nextSelection) selectedTaskIdRef.current = nextSelection.id;
    setSelectedTask(nextSelection);
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

    const nextSelection = selectRouletteTask(
      tasks,
      new Date(),
      nextGroups,
      selectedTaskIdRef.current ?? undefined,
    );

    selectedGroupsRef.current = nextGroups;
    setSelectedGroups([...nextGroups]);

    if (nextSelection) selectedTaskIdRef.current = nextSelection.id;
    setSelectedTask(nextSelection);
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
    if (!selectedTask) return;

    router.push({
      pathname: "/task/[id]",
      params: { id: selectedTask.id },
    });
  };

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
          <View className="flex-1 items-center justify-center gap-3 px-6 py-12">
            <Text className="text-center text-xl font-semibold text-zinc-900">
              Choose at least one group
            </Text>
            <Text className="text-center text-sm leading-5 text-zinc-500">
              Select the groups you want Task Roulette to choose from.
            </Text>
          </View>
        ) : selectedTask ? (
          <View className="flex-1 gap-6">
            <View className="flex-1 justify-center gap-4">
              <Text className="text-center text-xs font-semibold uppercase tracking-widest text-zinc-400">
                Your next task
              </Text>

              <View className="h-64 justify-center rounded-3xl border border-zinc-200 bg-white px-6 py-8">
                <Text className="mb-3 text-center text-sm font-medium text-zinc-500">
                  {formatScheduleContext(selectedTask, new Date())}
                </Text>
                <Text
                  numberOfLines={4}
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
                onPress={openSelectedTask}
              >
                <Text className="text-center text-base font-semibold text-white">
                  Open task
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                className="min-h-12 justify-center rounded-xl border border-zinc-300 bg-white px-5 active:bg-zinc-50"
                onPress={tryAnotherTask}
              >
                <Text className="text-center text-base font-semibold text-zinc-900">
                  Try another
                </Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View className="flex-1 items-center justify-center gap-3 px-6 py-12">
            <Text className="text-center text-xl font-semibold text-zinc-900">
              No tasks in these groups
            </Text>
            <Text className="text-center text-sm leading-5 text-zinc-500">
              Choose another group or add an unfinished task to one of the
              selected groups.
            </Text>
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
