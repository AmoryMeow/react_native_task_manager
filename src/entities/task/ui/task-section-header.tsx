import { Pressable, Text, View } from "react-native";

import type { TaskGroupId } from "../lib/group-tasks";
import { ChevronIcon } from "@/shared/ui/icons/chevron-icon";

interface TaskSectionHeaderProps {
  groupId: TaskGroupId;
  title: string;
  count: number;
  isCollapsed: boolean;
  disabled?: boolean;
  onToggle: (groupId: TaskGroupId) => void;
}

export function TaskSectionHeader({
  groupId,
  title,
  count,
  isCollapsed,
  disabled = false,
  onToggle,
}: TaskSectionHeaderProps) {
  return (
    <Pressable
      onPress={() => onToggle(groupId)}
      accessibilityRole="button"
      accessibilityLabel={`${isCollapsed ? "Expand" : "Collapse"} ${title}`}
      accessibilityState={{ disabled, expanded: !isCollapsed }}
      disabled={disabled}
      className="mb-2 mt-4 self-start flex-row items-center py-1"
    >
      <Text className="text-base font-semibold text-zinc-900">{title}</Text>

      <View className="ml-2 flex-row items-center gap-1">
        <Text className="h-5 text-xs leading-5 text-zinc-500">{count}</Text>

        <View className="h-5 w-5 items-center justify-center rounded-full bg-zinc-200">
          <ChevronIcon direction={isCollapsed ? "down" : "up"} />
        </View>
      </View>
    </Pressable>
  );
}
