import { Pressable, Text, View } from "react-native";

import { formatTaskSchedule } from "../lib/format-task-schedule";
import type { Task } from "../model/types";

interface TaskCardProps {
  task: Task;
  isUpdating: boolean;
  showSchedule: boolean;
  onToggle: (task: Task) => void;
  onDelete: (task: Task) => void;
}

export function TaskCard({
  task,
  isUpdating,
  showSchedule,
  onToggle,
  onDelete,
}: TaskCardProps) {
  const isDone = task.status === "done";

  return (
    <View
      className={`mb-2 min-h-12 flex-row items-center overflow-hidden rounded-xl border border-zinc-200 bg-white ${
        isUpdating ? "opacity-50" : ""
      }`}
    >
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{
          checked: isDone,
          disabled: isUpdating,
        }}
        disabled={isUpdating}
        className="min-h-12 flex-1 flex-row items-center px-3 py-2.5 active:bg-zinc-50"
        onPress={() => onToggle(task)}
      >
        <View
          className={
            isDone
              ? "mr-3 h-5 w-5 items-center justify-center rounded-md bg-zinc-950"
              : "mr-3 h-5 w-5 rounded-md border-2 border-zinc-400"
          }
        >
          {isDone && <Text className="text-xs font-bold text-white">✓</Text>}
        </View>

        <View className="flex-1">
          <Text
            className={
              isDone
                ? "text-sm text-zinc-400 line-through"
                : "text-sm font-medium text-zinc-900"
            }
          >
            {task.title}
          </Text>

          {showSchedule && (
            <Text className="mt-0.5 text-xs text-zinc-500">
              {formatTaskSchedule(task.schedule)}
            </Text>
          )}
        </View>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Delete ${task.title}`}
        disabled={isUpdating}
        onPress={() => onDelete(task)}
        className="min-h-12 w-11 items-center justify-center border-l border-zinc-100 active:bg-zinc-100"
      >
        <Text className="text-xl text-zinc-400">×</Text>
      </Pressable>
    </View>
  );
}
