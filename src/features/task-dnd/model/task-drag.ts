import type { View } from "react-native";
import type {
  AnimatedRef,
  MeasuredDimensions,
  SharedValue,
} from "react-native-reanimated";

import type { TaskGroupId } from "@/entities/task/lib/group-tasks";

export const TASK_GROUP_IDS: TaskGroupId[] = [
  "earlier",
  "today",
  "upcoming",
  "soon",
  "someday",
  "inbox",
  "completed",
];

export const DROP_TARGET_GROUP_IDS = [
  "today",
  "soon",
  "someday",
  "inbox",
] as const satisfies readonly TaskGroupId[];

export const AUTO_SCROLL_EDGE_SIZE = 72;
export const AUTO_SCROLL_SPEED = 0.45;

export type TaskGroupRefs = Record<TaskGroupId, AnimatedRef<View>>;

export interface TaskDragSharedValues {
  autoScrollDirection: SharedValue<number>;
  floatingHeight: SharedValue<number>;
  floatingWidth: SharedValue<number>;
  floatingX: SharedValue<number>;
  floatingY: SharedValue<number>;
}

export function getTaskGroupIndex(groupId: TaskGroupId): number {
  return TASK_GROUP_IDS.indexOf(groupId);
}

export function isDropTargetGroup(
  groupId: TaskGroupId,
): groupId is (typeof DROP_TARGET_GROUP_IDS)[number] {
  return DROP_TARGET_GROUP_IDS.includes(
    groupId as (typeof DROP_TARGET_GROUP_IDS)[number],
  );
}

function containsGroupPoint(
  start: MeasuredDimensions | null,
  end: MeasuredDimensions | null,
  root: MeasuredDimensions | null,
  x: number,
  y: number,
): boolean {
  "worklet";

  if (start === null || root === null) return false;

  const bottom = end?.pageY ?? root.pageY + root.height;

  return (
    x >= root.pageX &&
    x <= root.pageX + root.width &&
    y >= start.pageY &&
    y < bottom
  );
}

export function getDropTargetIndex(
  x: number,
  y: number,
  sourceIndex: number,
  today: MeasuredDimensions | null,
  upcoming: MeasuredDimensions | null,
  soon: MeasuredDimensions | null,
  someday: MeasuredDimensions | null,
  inbox: MeasuredDimensions | null,
  completed: MeasuredDimensions | null,
  root: MeasuredDimensions | null,
): number {
  "worklet";

  if (
    sourceIndex !== 1 &&
    containsGroupPoint(today, upcoming ?? soon, root, x, y)
  ) {
    return 1;
  }
  if (sourceIndex !== 3 && containsGroupPoint(soon, someday, root, x, y)) {
    return 3;
  }
  if (sourceIndex !== 4 && containsGroupPoint(someday, inbox, root, x, y)) {
    return 4;
  }
  if (sourceIndex !== 5 && containsGroupPoint(inbox, completed, root, x, y)) {
    return 5;
  }

  return -1;
}
