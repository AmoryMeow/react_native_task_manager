import { useCallback, useMemo } from "react";
import {
  StyleSheet,
  View,
  type AccessibilityActionEvent,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  measure,
  useAnimatedRef,
  useSharedValue,
  type AnimatedRef,
} from "react-native-reanimated";
import { runOnJS } from "react-native-worklets";

import type { TaskGroupId } from "@/entities/task/lib/group-tasks";
import { TaskCard, type TaskCardProps } from "@/entities/task/ui/task-card";
import {
  AUTO_SCROLL_EDGE_SIZE,
  getDropTargetIndex,
  getTaskGroupIndex,
  getTaskMoveActionTarget,
  getTaskMoveActions,
  type TaskDragSharedValues,
  type TaskGroupRefs,
} from "@/features/task-dnd/model/task-drag";

import { TaskDragHandleDots } from "./task-drag-handle";

interface DraggableTaskCardProps extends TaskCardProps {
  dragValues: TaskDragSharedValues;
  groupId: TaskGroupId;
  hasCompleted: boolean;
  hasUpcoming: boolean;
  isDragging: boolean;
  isDragDisabled: boolean;
  onDragCancel: () => void;
  onDragEnd: (
    taskId: string,
    sourceGroupId: TaskGroupId,
    targetIndex: number,
  ) => void;
  onDragStart: (taskId: string, sourceGroupId: TaskGroupId) => void;
  rootRef: AnimatedRef<View>;
  targetRefs: TaskGroupRefs;
  onOpenDetails: () => void;
}

export function DraggableTaskCard({
  dragValues,
  groupId,
  hasCompleted,
  hasUpcoming,
  isDragging,
  isDragDisabled,
  onDragCancel,
  onDragEnd,
  onDragStart,
  rootRef,
  targetRefs,
  ...taskCardProps
}: DraggableTaskCardProps) {
  "use no memo";

  const cardRef = useAnimatedRef<View>();
  const dragReady = useSharedValue(false);
  const grabOffsetX = useSharedValue(0);
  const grabOffsetY = useSharedValue(0);
  const rootPageX = useSharedValue(0);
  const rootPageY = useSharedValue(0);
  const rootHeight = useSharedValue(0);
  const sourceIndex = getTaskGroupIndex(groupId);

  const {
    autoScrollDirection,
    floatingHeight,
    floatingWidth,
    floatingX,
    floatingY,
  } = dragValues;
  const { today, upcoming, soon, someday, inbox, completed } = targetRefs;
  const taskId = taskCardProps.task.id;

  const findTarget = useCallback(
    (x: number, y: number) => {
      "worklet";

      return getDropTargetIndex(
        x,
        y,
        sourceIndex,
        measure(today),
        hasUpcoming ? measure(upcoming) : null,
        measure(soon),
        measure(someday),
        measure(inbox),
        hasCompleted ? measure(completed) : null,
        measure(rootRef),
      );
    },
    [
      completed,
      hasCompleted,
      hasUpcoming,
      inbox,
      rootRef,
      someday,
      soon,
      sourceIndex,
      today,
      upcoming,
    ],
  );

  /* Reanimated worklets intentionally read animated refs and update shared
   * values on the UI thread; React's render-time mutation rules do not apply. */
  /* eslint-disable react-hooks/immutability, react-hooks/refs */
  const dragGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(!isDragDisabled)
        .activateAfterLongPress(180)
        .failOffsetX([-8, 8])
        .failOffsetY([-8, 8])
        .maxPointers(1)
        .onStart((event) => {
          const card = measure(cardRef);
          const root = measure(rootRef);

          if (card === null || root === null) {
            dragReady.value = false;
            return;
          }

          dragReady.value = true;
          grabOffsetX.value = event.absoluteX - card.pageX;
          grabOffsetY.value = event.absoluteY - card.pageY;
          rootPageX.value = root.pageX;
          rootPageY.value = root.pageY;
          rootHeight.value = root.height;

          floatingX.value = card.pageX - root.pageX;
          floatingY.value = card.pageY - root.pageY;
          floatingWidth.value = card.width;
          floatingHeight.value = card.height;
          autoScrollDirection.value = 0;

          runOnJS(onDragStart)(taskId, groupId);
        })
        .onUpdate((event) => {
          if (!dragReady.value) return;

          floatingX.value =
            event.absoluteX - grabOffsetX.value - rootPageX.value;
          floatingY.value =
            event.absoluteY - grabOffsetY.value - rootPageY.value;

          const yInsideRoot = event.absoluteY - rootPageY.value;

          if (yInsideRoot < AUTO_SCROLL_EDGE_SIZE) {
            autoScrollDirection.value = -1;
          } else if (yInsideRoot > rootHeight.value - AUTO_SCROLL_EDGE_SIZE) {
            autoScrollDirection.value = 1;
          } else {
            autoScrollDirection.value = 0;
          }
        })
        .onEnd((event) => {
          if (!dragReady.value) return;

          const targetIndex = findTarget(event.absoluteX, event.absoluteY);

          dragReady.value = false;
          autoScrollDirection.value = 0;
          runOnJS(onDragEnd)(taskId, groupId, targetIndex);
        })
        .onFinalize((_event, succeeded) => {
          if (succeeded || !dragReady.value) return;

          dragReady.value = false;
          autoScrollDirection.value = 0;
          runOnJS(onDragCancel)();
        }),
    [
      autoScrollDirection,
      cardRef,
      dragReady,
      findTarget,
      floatingHeight,
      floatingWidth,
      floatingX,
      floatingY,
      grabOffsetX,
      grabOffsetY,
      groupId,
      isDragDisabled,
      onDragCancel,
      onDragEnd,
      onDragStart,
      rootHeight,
      rootPageX,
      rootPageY,
      rootRef,
      taskId,
    ],
  );
  /* eslint-enable react-hooks/immutability, react-hooks/refs */

  // Non-gesture alternative for screen readers: the same targets and the same
  // onDragEnd path as dropping the card on a group header.
  const moveActions = isDragDisabled ? [] : getTaskMoveActions(groupId);
  const handleMoveAction = (event: AccessibilityActionEvent) => {
    const target = getTaskMoveActionTarget(event.nativeEvent.actionName);

    if (!target || isDragDisabled) return;

    onDragEnd(taskId, groupId, getTaskGroupIndex(target));
  };

  return (
    <Animated.View
      collapsable={false}
      ref={cardRef}
      style={isDragging ? styles.draggingCard : undefined}
    >
      <TaskCard
        {...taskCardProps}
        dragHandle={
          <GestureDetector gesture={dragGesture}>
            <Animated.View
              accessible
              accessibilityActions={moveActions}
              accessibilityHint="Use the actions to move it to another group, or long press and drag."
              accessibilityLabel={`Move ${taskCardProps.task.title}`}
              accessibilityState={{ disabled: isDragDisabled }}
              onAccessibilityAction={handleMoveAction}
              style={[styles.handle, isDragDisabled && styles.disabledHandle]}
            >
              <TaskDragHandleDots />
            </Animated.View>
          </GestureDetector>
        }
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  draggingCard: {
    opacity: 0,
  },
  handle: {
    alignItems: "center",
    height: "100%",
    justifyContent: "center",
    // 44pt touch target; the card is 56pt tall.
    width: 44,
  },
  disabledHandle: {
    opacity: 0.35,
  },
});
