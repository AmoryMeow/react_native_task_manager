import type { View } from "react-native";
import type {
  AnimatedRef,
  MeasuredDimensions,
  SharedValue,
} from "react-native-reanimated";

import { toLocalDateString } from "@/entities/task/lib/format-task-schedule";
import type { TaskGroupId } from "@/entities/task/lib/group-tasks";
import type { TaskSchedule } from "@/entities/task/model/types";

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

export type DropTargetGroupId = (typeof DROP_TARGET_GROUP_IDS)[number];

const DROP_TARGET_LABELS: Record<DropTargetGroupId, string> = {
  today: "Today",
  soon: "Soon",
  someday: "Someday",
  inbox: "Inbox",
};

const MOVE_ACTION_PREFIX = "move-to-";

export interface TaskMoveAction {
  name: string;
  label: string;
}

/**
 * Screen-reader alternative to dragging: the same drop targets a drag can
 * reach from `sourceGroupId`. Earlier and Scheduled need a specific date, so
 * they stay in Task Details, exactly as with drag-and-drop.
 */
export function getTaskMoveActions(
  sourceGroupId: TaskGroupId,
): TaskMoveAction[] {
  return DROP_TARGET_GROUP_IDS.filter(
    (groupId) => groupId !== sourceGroupId,
  ).map((groupId) => ({
    name: `${MOVE_ACTION_PREFIX}${groupId}`,
    label: getTaskMoveLabel(groupId),
  }));
}

export function getTaskMoveLabel(groupId: DropTargetGroupId): string {
  return `Move to ${DROP_TARGET_LABELS[groupId]}`;
}

export function getTaskMovedAnnouncement(groupId: DropTargetGroupId): string {
  return `Moved to ${DROP_TARGET_LABELS[groupId]}`;
}

export function getTaskMoveActionTarget(
  actionName: string,
): DropTargetGroupId | null {
  if (!actionName.startsWith(MOVE_ACTION_PREFIX)) return null;

  const groupId = actionName.slice(MOVE_ACTION_PREFIX.length) as TaskGroupId;

  return isDropTargetGroup(groupId) ? groupId : null;
}

export function getDestinationSchedule(
  groupId: TaskGroupId,
  now = new Date(),
): TaskSchedule | null {
  switch (groupId) {
    case "today":
      return { type: "date", date: toLocalDateString(now) };
    case "soon":
    case "someday":
    case "inbox":
      return { type: groupId };
    default:
      return null;
  }
}

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
