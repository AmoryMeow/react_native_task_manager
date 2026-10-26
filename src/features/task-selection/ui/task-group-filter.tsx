import { useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  DEFAULT_TASK_SELECTION_GROUPS,
  type TaskSelectionGroupId,
} from "@/features/task-selection/lib/get-eligible-tasks";
import { ChevronIcon } from "@/shared/ui/icons/chevron-icon";

const taskGroupOptions: readonly {
  id: TaskSelectionGroupId;
  label: string;
}[] = [
  { id: "earlier", label: "Earlier" },
  { id: "today", label: "Today" },
  { id: "upcoming", label: "Upcoming" },
  { id: "soon", label: "Soon" },
  { id: "someday", label: "Someday" },
  { id: "inbox", label: "Inbox" },
];
const allTaskGroups = taskGroupOptions.map((group) => group.id);

function formatGroupSelection(groups: readonly TaskSelectionGroupId[]): string {
  if (groups.length === 0) return "No groups selected";
  if (groups.length === taskGroupOptions.length) return "All groups";

  const selectedLabels = taskGroupOptions
    .filter((group) => groups.includes(group.id))
    .map((group) => group.label);

  if (selectedLabels.length <= 2) return selectedLabels.join(" + ");

  return `${selectedLabels[0]} + ${selectedLabels.length - 1} more`;
}

interface TaskGroupFilterProps {
  description: string;
  selectedGroups: readonly TaskSelectionGroupId[];
  onChange: (groups: readonly TaskSelectionGroupId[]) => void;
}

export function TaskGroupFilter({
  description,
  selectedGroups,
  onChange,
}: TaskGroupFilterProps) {
  const [isOpen, setIsOpen] = useState(false);

  const toggleGroup = (groupId: TaskSelectionGroupId) => {
    const nextSelectedGroupIds = new Set(selectedGroups);

    if (nextSelectedGroupIds.has(groupId)) {
      nextSelectedGroupIds.delete(groupId);
    } else {
      nextSelectedGroupIds.add(groupId);
    }

    onChange(
      taskGroupOptions
        .filter((group) => nextSelectedGroupIds.has(group.id))
        .map((group) => group.id),
    );
  };

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Choose task groups. ${formatGroupSelection(selectedGroups)}`}
        accessibilityHint="Opens task group filters"
        className="mb-4 min-h-12 flex-row items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-2 active:bg-zinc-50"
        onPress={() => setIsOpen(true)}
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

      <Modal
        allowSwipeDismissal
        animationType="slide"
        presentationStyle="pageSheet"
        visible={isOpen}
        onRequestClose={() => setIsOpen(false)}
      >
        <SafeAreaView className="flex-1 bg-zinc-100">
          <View className="border-b border-zinc-200 px-5 pb-4 pt-2">
            <Text className="text-xl font-bold tracking-tight text-zinc-950">
              Choose groups
            </Text>
            <Text className="mt-1 text-sm leading-5 text-zinc-500">
              {description}
            </Text>
          </View>

          <View className="flex-row gap-2 px-4 py-3">
            <Pressable
              accessibilityRole="button"
              className="min-h-11 flex-1 justify-center rounded-xl border border-zinc-300 bg-white px-3 active:bg-zinc-50"
              onPress={() => onChange(allTaskGroups)}
            >
              <Text className="text-center text-sm font-semibold text-zinc-900">
                Select all
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              className="min-h-11 flex-1 justify-center rounded-xl border border-zinc-300 bg-white px-3 active:bg-zinc-50"
              onPress={() => onChange(DEFAULT_TASK_SELECTION_GROUPS)}
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
              {taskGroupOptions.map((group, index) => {
                const isSelected = selectedGroups.includes(group.id);

                return (
                  <Pressable
                    key={group.id}
                    accessibilityRole="checkbox"
                    accessibilityLabel={`Include ${group.label} tasks`}
                    accessibilityState={{ checked: isSelected }}
                    className={`min-h-14 flex-row items-center justify-between gap-4 px-4 py-2 active:bg-zinc-50 ${
                      index < taskGroupOptions.length - 1
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
              onPress={() => setIsOpen(false)}
            >
              <Text className="text-center text-base font-semibold text-white">
                Done
              </Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </Modal>
    </>
  );
}
