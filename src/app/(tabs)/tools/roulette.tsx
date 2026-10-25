import { useCallback, useRef, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import {
  ActivityIndicator,
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
  getEligibleRouletteTasks,
  selectRouletteTask,
} from "@/features/task-roulette/lib/select-roulette-task";

function formatScheduleContext(task: Task, currentDate: Date): string {
  if (task.schedule.type !== "date") return "";
  if (task.schedule.date === toLocalDateString(currentDate)) return "Today";

  const [year, month, day] = task.schedule.date.split("-").map(Number);
  const scheduledDate = new Date(year, month - 1, day);
  const formattedDate = scheduledDate.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    ...(year !== currentDate.getFullYear() ? { year: "numeric" } : {}),
  });

  return `Earlier · ${formattedDate}`;
}

export default function TaskRouletteScreen() {
  const db = useSQLiteContext();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const selectedTaskIdRef = useRef<string | null>(null);
  const loadRequestIdRef = useRef(0);

  const loadTasks = useCallback(async () => {
    const requestId = ++loadRequestIdRef.current;

    setIsLoading(true);
    setLoadError(null);

    try {
      const savedTasks = await createTaskRepository(db).getTasks();

      if (loadRequestIdRef.current !== requestId) return;

      const currentDate = new Date();
      const eligibleTasks = getEligibleRouletteTasks(savedTasks, currentDate);
      const currentSelection = eligibleTasks.find(
        (task) => task.id === selectedTaskIdRef.current,
      );
      const nextSelection =
        currentSelection ??
        selectRouletteTask(
          savedTasks,
          currentDate,
          selectedTaskIdRef.current ?? undefined,
        );

      selectedTaskIdRef.current = nextSelection?.id ?? null;
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
      selectedTask?.id,
    );

    selectedTaskIdRef.current = nextSelection?.id ?? null;
    setSelectedTask(nextSelection);
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
        contentContainerClassName="flex-grow justify-center px-4 py-6"
      >
        {isLoading ? (
          <View className="items-center gap-3 py-12">
            <ActivityIndicator color="#18181b" />
            <Text className="text-sm text-zinc-500">Choosing a task…</Text>
          </View>
        ) : loadError ? (
          <View className="items-center gap-4 px-6 py-12">
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
          <View className="items-center gap-3 px-6 py-12">
            <Text className="text-center text-xl font-semibold text-zinc-900">
              Nothing to choose right now
            </Text>
            <Text className="text-center text-sm leading-5 text-zinc-500">
              Schedule a task for today when you want it to appear here.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
