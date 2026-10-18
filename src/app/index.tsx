import { useCallback, useEffect, useState } from "react";
import {
  Pressable,
  ScrollView,
  SectionList,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useSQLiteContext } from "expo-sqlite";

import { groupTasks, type TaskGroupId } from "@/entities/task/lib/group-tasks";
import type { Task, TaskSchedule } from "@/entities/task/model/types";
import { createTaskRepository } from "@/entities/task/repository/task-repository";
import { TaskCard } from "@/entities/task/ui/task-card";
import { TaskSectionHeader } from "@/entities/task/ui/task-section-header";

type ScheduleOption = "inbox" | "today" | "tomorrow" | "soon" | "someday";

const scheduleOptions: { value: ScheduleOption; label: string }[] = [
  { value: "inbox", label: "Inbox" },
  { value: "today", label: "Today" },
  { value: "tomorrow", label: "Tomorrow" },
  { value: "soon", label: "Soon" },
  { value: "someday", label: "Someday" },
];

export default function HomeScreen() {
  const db = useSQLiteContext();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [updatingTaskIds, setUpdatingTaskIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [lastDeletedTask, setLastDeletedTask] = useState<Task | null>(null);

  const [scheduleOption, setScheduleOption] = useState<ScheduleOption>("inbox");

  const [collapsedGroups, setCollapsedGroups] = useState<Set<TaskGroupId>>(
    () => new Set(["completed"]),
  );

  const toggleGroup = (id: TaskGroupId) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return next;
    });
  };

  const remainingTasks = tasks.filter((task) => task.status !== "done").length;

  const sections = groupTasks(tasks).map((group) => ({
    ...group,
    count: group.data.length,
    data: collapsedGroups.has(group.id) ? [] : group.data,
  }));
  const getTasks = useCallback(() => createTaskRepository(db).getTasks(), [db]);

  useEffect(() => {
    let isCancelled = false;

    const loadInitialTasks = async () => {
      try {
        const savedTasks = await getTasks();

        if (!isCancelled) setTasks(savedTasks);
      } catch (error) {
        if (isCancelled) return;

        console.error("Failed to load tasks:", error);
        setLoadError("Could not load tasks");
      } finally {
        if (!isCancelled) setIsLoading(false);
      }
    };

    void loadInitialTasks();

    return () => {
      isCancelled = true;
    };
  }, [getTasks]);

  const retryLoadingTasks = async () => {
    setIsLoading(true);
    setLoadError(null);

    try {
      setTasks(await getTasks());
    } catch (error) {
      console.error("Failed to load tasks:", error);
      setLoadError("Could not load tasks");
    } finally {
      setIsLoading(false);
    }
  };

  const isInputDisabled = isLoading || loadError !== null || isSaving;
  const isAddDisabled = isInputDisabled || !title.trim();

  const addTask = async () => {
    const trimmedTitle = title.trim();

    if (!trimmedTitle || isInputDisabled || isSaving) return;

    setActionError(null);
    setIsSaving(true);

    try {
      const task = await createTaskRepository(db).addTask(
        trimmedTitle,
        toTaskSchedule(scheduleOption),
      );

      setTasks((currentTasks) => [task, ...currentTasks]);
      setTitle("");
      setScheduleOption("inbox");
    } catch (error) {
      console.error("Failed to save task:", error);
      setActionError("Could not save task");
    } finally {
      setIsSaving(false);
    }
  };

  const toggleTask = async (task: Task) => {
    if (updatingTaskIds.has(task.id)) return;

    setActionError(null);
    setUpdatingTaskIds((prev) => new Set(prev).add(task.id));

    try {
      const updatedTask = await createTaskRepository(db).toggleTask(task);

      setTasks((currentTasks) =>
        currentTasks.map((currentTask) =>
          currentTask.id === updatedTask.id ? updatedTask : currentTask,
        ),
      );
    } catch (error) {
      console.error("Failed to toggle task:", error);
      setActionError("Could not update task");
    } finally {
      setUpdatingTaskIds((prev) => {
        const next = new Set(prev);
        next.delete(task.id);
        return next;
      });
    }
  };

  const startEditingTask = (task: Task) => {
    if (
      updatingTaskIds.has(task.id) ||
      (editingTaskId !== null && editingTaskId !== task.id)
    ) {
      return;
    }

    setActionError(null);
    setEditingTaskId(task.id);
  };

  const cancelEditingTask = (task: Task) => {
    setEditingTaskId((currentTaskId) =>
      currentTaskId === task.id ? null : currentTaskId,
    );
    setActionError(null);
  };

  const saveTaskTitle = async (
    task: Task,
    nextTitle: string,
  ): Promise<boolean> => {
    const trimmedTitle = nextTitle.trim();

    if (!trimmedTitle) {
      setActionError("Task title cannot be empty");
      return false;
    }

    if (trimmedTitle === task.title) {
      setActionError(null);
      setEditingTaskId((currentTaskId) =>
        currentTaskId === task.id ? null : currentTaskId,
      );
      return true;
    }

    if (updatingTaskIds.has(task.id)) return false;

    setActionError(null);
    setUpdatingTaskIds((prev) => new Set(prev).add(task.id));

    try {
      await createTaskRepository(db).updateTaskTitle(task, trimmedTitle);
      setTasks(await getTasks());
      setEditingTaskId((currentTaskId) =>
        currentTaskId === task.id ? null : currentTaskId,
      );
      return true;
    } catch (error) {
      console.error("Failed to update task title:", error);
      setActionError("Could not update task title");
      return false;
    } finally {
      setUpdatingTaskIds((prev) => {
        const next = new Set(prev);
        next.delete(task.id);
        return next;
      });
    }
  };

  const deleteTask = async (task: Task) => {
    if (updatingTaskIds.has(task.id)) return;

    setActionError(null);
    setUpdatingTaskIds((prev) => new Set(prev).add(task.id));

    try {
      const deletedTaskId = await createTaskRepository(db).deleteTask(task.id);

      setTasks((currentTasks) =>
        currentTasks.filter((currentTask) => currentTask.id !== deletedTaskId),
      );
      setLastDeletedTask(task);
    } catch (error) {
      console.error("Failed to delete task:", error);
      setActionError("Could not delete task");
    } finally {
      setUpdatingTaskIds((prev) => {
        const next = new Set(prev);
        next.delete(task.id);
        return next;
      });
    }
  };

  const undoDelete = async () => {
    if (!lastDeletedTask) return;

    const task = lastDeletedTask;
    setLastDeletedTask(null);
    setActionError(null);

    try {
      const restoredTask = await createTaskRepository(db).restoreTask(task);

      setTasks((currentTasks) =>
        [...currentTasks, restoredTask].sort((left, right) =>
          right.createdAt.localeCompare(left.createdAt),
        ),
      );
    } catch (error) {
      console.error("Failed to restore task:", error);
      setLastDeletedTask(task);
      setActionError("Could not restore task");
    }
  };

  function getLocalDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  function toTaskSchedule(option: ScheduleOption): TaskSchedule {
    if (option === "today" || option === "tomorrow") {
      const date = new Date();

      if (option === "tomorrow") {
        date.setDate(date.getDate() + 1);
      }

      return {
        type: "date",
        date: getLocalDate(date),
      };
    }

    return { type: option };
  }

  return (
    <SafeAreaView className="flex-1 bg-zinc-100">
      <View className="flex-1 px-4 pt-4">
        <View className="mb-4 flex-row items-center justify-between">
          <Text className="text-3xl font-bold tracking-tight text-zinc-950">
            My Tasks
          </Text>

          <View className="rounded-full bg-zinc-200 px-2.5 py-1">
            <Text className="text-xs font-semibold text-zinc-600">
              {remainingTasks} open
            </Text>
          </View>
        </View>

        <View className="mb-3 flex-row gap-2">
          <TextInput
            className="h-11 flex-1 rounded-xl border border-zinc-300 bg-white px-3.5 text-base text-zinc-950"
            value={title}
            onChangeText={setTitle}
            placeholder="Add a small next step"
            placeholderTextColor="#71717a"
            selectionColor="#18181b"
            onSubmitEditing={() => void addTask()}
            returnKeyType="done"
            editable={!isInputDisabled}
          />

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add task"
            className={`h-11 w-11 items-center justify-center rounded-xl bg-zinc-950 ${isAddDisabled ? "opacity-40" : "active:bg-zinc-700"}`}
            onPress={() => void addTask()}
            disabled={isAddDisabled}
          >
            <Text className="text-2xl font-light leading-7 text-white">+</Text>
          </Pressable>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          className="mb-4 h-8 flex-none"
          contentContainerClassName="items-center gap-1.5 pr-2"
        >
          {scheduleOptions.map((option) => {
            const isSelected = scheduleOption === option.value;

            return (
              <Pressable
                key={option.value}
                accessibilityRole="button"
                accessibilityState={{
                  selected: isSelected,
                  disabled: isInputDisabled,
                }}
                disabled={isInputDisabled}
                onPress={() => setScheduleOption(option.value)}
                className={`${
                  isSelected
                    ? "rounded-full bg-zinc-950 px-3 py-1.5"
                    : "rounded-full border border-zinc-300 bg-white px-3 py-1.5 active:bg-zinc-50"
                } ${isInputDisabled ? "opacity-40" : ""}`}
              >
                <Text
                  className={
                    isSelected
                      ? "text-xs font-semibold text-white"
                      : "text-xs font-medium text-zinc-600"
                  }
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {isLoading && (
          <Text className="py-3 text-sm text-zinc-500">Loading tasks...</Text>
        )}

        {loadError && (
          <View className="items-start rounded-xl border border-zinc-300 bg-white p-3">
            <Text className="mb-2 text-sm text-zinc-700">{loadError}</Text>

            <Pressable
              accessibilityRole="button"
              onPress={() => void retryLoadingTasks()}
              className="rounded-lg bg-zinc-900 px-3 py-2 active:bg-zinc-700"
            >
              <Text className="text-xs font-semibold text-white">
                Try again
              </Text>
            </Pressable>
          </View>
        )}

        {actionError && (
          <View
            accessibilityRole="alert"
            className="mb-3 flex-row items-center justify-between rounded-xl border border-red-200 bg-red-50 px-3 py-2"
          >
            <Text className="flex-1 text-sm text-red-800">{actionError}</Text>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Dismiss error"
              onPress={() => setActionError(null)}
              className="ml-2 p-1.5"
            >
              <Text className="font-semibold text-red-800">×</Text>
            </Pressable>
          </View>
        )}

        {!isLoading && !loadError && (
          <SectionList
            className="flex-1"
            contentContainerClassName="grow pb-6"
            sections={sections}
            keyExtractor={(task) => task.id}
            keyboardShouldPersistTaps="handled"
            stickySectionHeadersEnabled={false}
            extraData={collapsedGroups}
            renderSectionHeader={({ section }) => {
              const isCollapsed = collapsedGroups.has(section.id);

              return (
                <TaskSectionHeader
                  groupId={section.id}
                  title={section.title}
                  count={section.count}
                  isCollapsed={isCollapsed}
                  onToggle={toggleGroup}
                />
              );
            }}
            renderItem={({ item, section }) => {
              return (
                <TaskCard
                  task={item}
                  isUpdating={updatingTaskIds.has(item.id)}
                  isEditing={editingTaskId === item.id}
                  isEditDisabled={
                    editingTaskId !== null && editingTaskId !== item.id
                  }
                  showSchedule={
                    section.id === "earlier" || section.id === "upcoming"
                  }
                  onStartEditing={startEditingTask}
                  onSaveTitle={saveTaskTitle}
                  onCancelEditing={cancelEditingTask}
                  onToggle={(task) => void toggleTask(task)}
                  onDelete={(task) => void deleteTask(task)}
                />
              );
            }}
            ListEmptyComponent={
              tasks.length === 0 ? (
                <View className="flex-1 items-center justify-center px-8 pb-24">
                  <Text className="mb-2 text-lg font-semibold text-zinc-900">
                    Clear space for focus
                  </Text>
                  <Text className="text-center text-sm text-zinc-500">
                    Add one small task to get started.
                  </Text>
                </View>
              ) : null
            }
          />
        )}

        {lastDeletedTask && (
          <View className="mb-2 flex-row items-center justify-between rounded-xl bg-zinc-900 px-3 py-2">
            <Text className="text-sm font-medium text-white">Task deleted</Text>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Undo delete"
              onPress={() => void undoDelete()}
              className="rounded-lg px-2.5 py-1.5 active:bg-zinc-700"
            >
              <Text className="font-semibold text-white">Undo</Text>
            </Pressable>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}
