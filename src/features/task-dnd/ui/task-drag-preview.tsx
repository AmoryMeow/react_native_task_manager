import { Text, View } from "react-native";

import { formatTaskSchedule } from "@/entities/task/lib/format-task-schedule";
import type { Task } from "@/entities/task/model/types";

import { TaskDragHandleDots } from "./task-drag-handle";

interface TaskDragPreviewProps {
  showSchedule: boolean;
  task: Task;
}

export function TaskDragPreview({ showSchedule, task }: TaskDragPreviewProps) {
  const isDone = task.status === "done";

  return (
    <View className="mb-2 h-14 flex-row items-center overflow-hidden rounded-xl border border-zinc-300 bg-white">
      <View className="h-full w-11 items-center justify-center">
        <View
          className={
            isDone
              ? "h-5 w-5 items-center justify-center rounded-md bg-zinc-950"
              : "h-5 w-5 rounded-md border-2 border-zinc-400"
          }
        >
          {isDone ? (
            <Text className="text-xs font-bold text-white">✓</Text>
          ) : null}
        </View>
      </View>

      <View className="h-full flex-1 justify-center pr-2">
        <Text
          className={`h-6 text-sm leading-5 ${
            isDone ? "text-zinc-400 line-through" : "font-medium text-zinc-900"
          }`}
          numberOfLines={1}
          style={showSchedule ? undefined : { transform: [{ translateY: -1 }] }}
        >
          {task.title}
        </Text>

        {showSchedule ? (
          <Text
            className="mt-0.5 text-xs leading-4 text-zinc-500"
            numberOfLines={1}
          >
            {formatTaskSchedule(task.schedule)}
          </Text>
        ) : null}
      </View>

      <View className="h-full w-9 items-center justify-center border-l border-zinc-100">
        <Text className="text-lg text-zinc-400">×</Text>
      </View>

      <View className="h-full w-8 items-center justify-center">
        <TaskDragHandleDots />
      </View>
    </View>
  );
}
