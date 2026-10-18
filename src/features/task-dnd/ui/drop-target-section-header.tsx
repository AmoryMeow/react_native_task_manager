import { View } from "react-native";
import Animated, { type AnimatedRef } from "react-native-reanimated";

import type { TaskGroupId } from "@/entities/task/lib/group-tasks";
import { TaskSectionHeader } from "@/entities/task/ui/task-section-header";

interface DropTargetSectionHeaderProps {
  count: number;
  groupId: TaskGroupId;
  isCollapsed: boolean;
  isDragging: boolean;
  onToggle: (groupId: TaskGroupId) => void;
  targetRef: AnimatedRef<View>;
  title: string;
}

export function DropTargetSectionHeader({
  count,
  groupId,
  isCollapsed,
  isDragging,
  onToggle,
  targetRef,
  title,
}: DropTargetSectionHeaderProps) {
  return (
    <Animated.View collapsable={false} ref={targetRef}>
      <TaskSectionHeader
        count={count}
        disabled={isDragging}
        groupId={groupId}
        isCollapsed={isCollapsed}
        onToggle={onToggle}
        title={title}
      />
    </Animated.View>
  );
}
