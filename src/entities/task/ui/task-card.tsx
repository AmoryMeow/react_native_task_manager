import { useEffect, useRef, useState, type ReactNode } from "react";
import { Platform, Pressable, Text, TextInput, View } from "react-native";

import { formatTaskSchedule } from "@/entities/task/lib/format-task-schedule";
import { createDebouncedAction } from "@/shared/lib/debounced-action";
import { createSingleFlight } from "@/shared/lib/single-flight";
import type { Task } from "../model/types";

export interface TaskCardProps {
  task: Task;
  dragHandle?: ReactNode;
  isUpdating: boolean;
  isEditing: boolean;
  isEditDisabled: boolean;
  showSchedule: boolean;
  onStartEditing: (task: Task) => void;
  onSaveTitle: (task: Task, title: string) => Promise<boolean>;
  onCancelEditing: (task: Task) => void;
  onToggle: (task: Task) => void;
  onDelete: (task: Task) => void;
  onOpenDetails: () => void;
}

export function TaskCard({
  task,
  dragHandle,
  isUpdating,
  isEditing,
  isEditDisabled,
  showSchedule,
  onStartEditing,
  onSaveTitle,
  onCancelEditing,
  onToggle,
  onDelete,
  onOpenDetails,
}: TaskCardProps) {
  const isDone = task.status === "done";
  const [draftTitle, setDraftTitle] = useState(task.title);
  const [titleSave] = useState(() => createSingleFlight<boolean>());
  const [blurSave] = useState(() => createDebouncedAction(0));
  const titleInputRef = useRef<TextInput>(null);
  const draftTitleRef = useRef(task.title);
  const cancelRequestedRef = useRef(false);
  const isOpeningDetailsRef = useRef(false);

  useEffect(() => {
    if (isEditing) titleInputRef.current?.focus();
  }, [isEditing]);

  const updateDraftTitle = (value: string) => {
    draftTitleRef.current = value;
    setDraftTitle(value);
  };

  const saveTitle = () => {
    // An explicit save supersedes a deferred blur save, so they never both run.
    blurSave.cancel();

    if (cancelRequestedRef.current) {
      cancelRequestedRef.current = false;
      return Promise.resolve(false);
    }

    return titleSave.run(() => onSaveTitle(task, draftTitleRef.current));
  };

  const startEditing = () => {
    cancelRequestedRef.current = false;
    titleSave.reset();
    updateDraftTitle(task.title);
    onStartEditing(task);
  };

  const cancelEditing = () => {
    cancelRequestedRef.current = true;
    updateDraftTitle(task.title);
    onCancelEditing(task);
  };

  const toggleTask = async () => {
    if (isEditing) {
      const wasSaved = await saveTitle();

      onToggle(
        wasSaved ? { ...task, title: draftTitleRef.current.trim() } : task,
      );
      return;
    }

    onToggle(task);
  };

  const openDetails = async () => {
    if (!isEditing) {
      onOpenDetails();
      return;
    }

    if (isOpeningDetailsRef.current) return;
    isOpeningDetailsRef.current = true;

    try {
      titleInputRef.current?.blur();

      // Persist the latest draft before Task Details reads the task. On
      // failure, stay here in edit mode with the draft and the error visible.
      if (await saveTitle()) {
        onOpenDetails();
      }
    } finally {
      isOpeningDetailsRef.current = false;
    }
  };

  const deleteTask = () => {
    if (isEditing) {
      cancelRequestedRef.current = true;
      onCancelEditing(task);
    }

    onDelete(task);
  };

  return (
    <View
      className={`mb-2 min-h-14 flex-row items-center overflow-hidden rounded-xl border border-zinc-200 bg-white ${
        isUpdating ? "opacity-50" : ""
      }`}
    >
      <Pressable
        accessibilityRole="checkbox"
        accessibilityLabel={`Complete ${task.title}`}
        // aria-checked (unlike accessibilityState.checked) also reaches web.
        aria-checked={isDone}
        accessibilityState={{ disabled: isUpdating }}
        disabled={isUpdating}
        className="h-full w-11 items-center justify-center active:bg-zinc-50"
        onPress={() => void toggleTask()}
      >
        <View
          className={
            isDone
              ? "h-5 w-5 items-center justify-center rounded-md bg-zinc-950"
              : "h-5 w-5 rounded-md border-2 border-zinc-400"
          }
        >
          {isDone && <Text className="text-xs font-bold text-white">✓</Text>}
        </View>
      </Pressable>

      <View className="h-full flex-1 justify-center pr-2">
        <TextInput
          ref={titleInputRef}
          accessibilityLabel={isEditing ? "Task title" : `Edit ${task.title}`}
          className={`min-h-6 p-0 text-sm leading-5 ${
            isEditing
              ? "font-medium text-zinc-950"
              : isDone
                ? "text-zinc-400 line-through"
                : "font-medium text-zinc-900"
          }`}
          editable={isEditing && !isUpdating}
          onBlur={() => {
            if (isEditing) blurSave.schedule(() => void saveTitle());
          }}
          onChangeText={updateDraftTitle}
          onFocus={() => {
            if (
              Platform.OS === "web" &&
              !isEditing &&
              !isEditDisabled &&
              !isUpdating
            ) {
              startEditing();
            }

            titleSave.releaseSettled();
          }}
          onPressIn={() => {
            if (!isEditing && !isEditDisabled && !isUpdating) startEditing();
          }}
          onSubmitEditing={() => void saveTitle()}
          returnKeyType="done"
          selectionColor="#18181b"
          submitBehavior="blurAndSubmit"
          style={showSchedule ? undefined : { transform: [{ translateY: -1 }] }}
          textAlignVertical="center"
          value={isEditing ? draftTitle : task.title}
        />

        {showSchedule && (
          <Text
            numberOfLines={1}
            className="mt-0.5 text-xs leading-4 text-zinc-500"
          >
            {formatTaskSchedule(task.schedule)}
          </Text>
        )}
      </View>

      <Pressable
        onPressIn={() => {
          // A finished (e.g. failed) save may be retried; one still in flight
          // is joined instead of duplicated.
          if (isEditing) titleSave.releaseSettled();
        }}
        onPress={() => void openDetails()}
        accessibilityRole="button"
        accessibilityLabel={`Open task details for ${task.title}`}
        hitSlop={8}
        className="h-11 w-11 items-center justify-center"
      >
        <Text className="text-xl text-zinc-500">⋯</Text>
      </Pressable>

      {isEditing && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cancel editing task title"
          disabled={isUpdating}
          className="h-full justify-center px-1.5 active:bg-zinc-100"
          onPressIn={() => {
            cancelRequestedRef.current = true;
          }}
          onPress={cancelEditing}
        >
          <Text className="text-xs font-medium leading-5 text-zinc-500">
            Cancel
          </Text>
        </Pressable>
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Delete ${task.title}`}
        disabled={isUpdating}
        onPressIn={() => {
          if (isEditing) cancelRequestedRef.current = true;
        }}
        onPress={deleteTask}
        className="h-full w-11 items-center justify-center border-l border-zinc-100 active:bg-zinc-100"
      >
        <Text className="text-lg text-zinc-400">×</Text>
      </Pressable>

      {dragHandle}
    </View>
  );
}
