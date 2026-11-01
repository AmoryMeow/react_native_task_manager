import { Modal, Pressable, Text, View } from "react-native";

import { formatTaskSchedule } from "../lib/format-task-schedule";

import { Task } from "../model/types";

interface TaskDetailsSheetProps {
  task: Task | null;
  onClose: () => void;
}
export function TaskDetailsSheet({ task, onClose }: TaskDetailsSheetProps) {
  return (
    <Modal
      visible={task !== null}
      animationType="slide"
      presentationStyle="formSheet"
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-surface px-5 pt-6">
        <View className="mb-6 flex-row items-center justify-between">
          <Text className="text-lg font-semibold">Task details</Text>

          <Pressable onPress={onClose}>
            <Text className="text-accent">Done</Text>
          </Pressable>
        </View>

        {task && (
          <>
            <Text className="mb-3 text-xl font-semibold">{task.title}</Text>

            <Text className="text-muted">
              {task.description || "No description"}
            </Text>

            <View className="mt-6 gap-5">
              <View className="flex-row items-center justify-between">
                <Text className="font-medium text-foreground">Schedule</Text>
                <Text className="text-muted">
                  {formatTaskSchedule(task.schedule)}
                </Text>
              </View>

              <View className="h-px bg-fill" />

              <View className="flex-row items-center justify-between">
                <Text className="font-medium text-foreground">Deadline</Text>
                <Text className="text-muted">
                  {task.dueAt
                    ? new Date(task.dueAt).toLocaleDateString()
                    : "Not set"}
                </Text>
              </View>

              <View className="h-px bg-fill" />

              <View className="flex-row items-center justify-between">
                <Text className="font-medium text-foreground">Status</Text>
                <Text className="text-muted">
                  {task.status === "done" ? "Completed" : "To do"}
                </Text>
              </View>
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}
