import { router, useFocusEffect } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useThemeColors } from "@/shared/theme/use-theme-colors";

import type { Task } from "@/entities/task/model/types";
import { createTaskRepository } from "@/entities/task/repository/task-repository";
import { getFocusTasks } from "@/features/task-focus/lib/get-focus-tasks";
import { formatTaskSelectionContext } from "@/features/task-selection/lib/format-task-selection-context";

export default function FocusTaskPickerScreen() {
  const colors = useThemeColors();
  const db = useSQLiteContext();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isNavigationPending, setIsNavigationPending] = useState(false);
  const loadRequestIdRef = useRef(0);
  const navigationPendingRef = useRef(false);

  const loadTasks = useCallback(async () => {
    const requestId = ++loadRequestIdRef.current;

    setIsLoading(true);
    setLoadError(null);

    try {
      const savedTasks = await createTaskRepository(db).getTasks();

      if (loadRequestIdRef.current !== requestId) return;

      setTasks(savedTasks);
    } catch (error) {
      if (loadRequestIdRef.current !== requestId) return;

      console.error("Failed to load tasks for Focus Mode:", error);
      setLoadError("Could not load tasks");
    } finally {
      if (loadRequestIdRef.current === requestId) setIsLoading(false);
    }
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      navigationPendingRef.current = false;
      setIsNavigationPending(false);
      void loadTasks();

      return () => {
        loadRequestIdRef.current += 1;
      };
    }, [loadTasks]),
  );

  const currentDate = new Date();
  const availableTasks = getFocusTasks(tasks, currentDate);
  const visibleTasks = getFocusTasks(availableTasks, currentDate, query);

  function startFocus(task: Task) {
    if (task.status !== "todo" || navigationPendingRef.current) return;

    navigationPendingRef.current = true;
    setIsNavigationPending(true);
    Keyboard.dismiss();

    router.push({
      pathname: "/focus/[id]",
      params: { id: task.id, from: "tools" },
    });
  }

  return (
    <SafeAreaView edges={["left", "right"]} className="flex-1 bg-canvas">
      <View className="flex-1 px-4 pb-4 pt-4">
        <Text className="mb-4 text-sm leading-5 text-muted">
          Choose one task to work on without the surrounding list.
        </Text>

        <TextInput
          accessibilityLabel="Search focus tasks"
          value={query}
          onChangeText={setQuery}
          editable={!isNavigationPending}
          placeholder="Search tasks"
          placeholderTextColor={colors.faint}
          returnKeyType="search"
          selectionColor={colors.foreground}
          className="mb-3 min-h-11 rounded-xl border border-line-strong bg-surface px-3.5 text-base text-foreground"
        />

        {isLoading ? (
          <View className="flex-1 items-center justify-center gap-3">
            <ActivityIndicator color={colors.foreground} />
            <Text className="text-sm text-muted">Loading tasks…</Text>
          </View>
        ) : loadError ? (
          <View className="flex-1 items-center justify-center gap-4 px-6">
            <Text className="text-center text-base font-medium text-foreground">
              {loadError}
            </Text>
            <Text className="text-center text-sm leading-5 text-muted">
              Your tasks are still safely stored on this device.
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Retry loading focus tasks"
              onPress={() => void loadTasks()}
              className="min-h-11 justify-center rounded-xl border border-line-strong bg-surface px-5 active:bg-pressed"
            >
              <Text className="text-center text-sm font-semibold text-foreground">
                Retry
              </Text>
            </Pressable>
          </View>
        ) : (
          <FlatList
            data={visibleTasks}
            keyExtractor={(task) => task.id}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerClassName={
              visibleTasks.length === 0 ? "flex-grow" : "gap-2 pb-4"
            }
            ListEmptyComponent={
              <View className="flex-1 items-center justify-center gap-2 px-8 pb-20">
                <Text className="text-center text-lg font-semibold text-foreground">
                  {availableTasks.length === 0
                    ? "No tasks available"
                    : "No matching tasks"}
                </Text>
                <Text className="text-center text-sm leading-5 text-muted">
                  {availableTasks.length === 0
                    ? "Add an unfinished task, then return here to focus on it."
                    : "Try a different search."}
                </Text>
              </View>
            }
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Start focus on ${item.title}`}
                accessibilityState={{ disabled: isNavigationPending }}
                disabled={isNavigationPending}
                onPress={() => startFocus(item)}
                className={`min-h-16 justify-center rounded-xl border border-line bg-surface px-4 py-3 active:bg-pressed ${
                  isNavigationPending ? "opacity-40" : ""
                }`}
              >
                <Text
                  numberOfLines={2}
                  className="text-base font-semibold leading-5 text-foreground"
                >
                  {item.title}
                </Text>
                <Text className="mt-1 text-xs font-medium text-muted">
                  {formatTaskSelectionContext(item, currentDate)}
                </Text>
              </Pressable>
            )}
          />
        )}
      </View>
    </SafeAreaView>
  );
}
