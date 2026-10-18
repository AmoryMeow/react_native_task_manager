import { useCallback, useMemo } from "react";
import {
  type LayoutChangeEvent,
  SectionList,
  type SectionListData,
  View,
} from "react-native";
import {
  scrollTo,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
} from "react-native-reanimated";

import {
  AUTO_SCROLL_SPEED,
  type TaskDragSharedValues,
  type TaskGroupRefs,
} from "./task-drag";

export function useTaskDragController<
  TItem,
  TSection extends SectionListData<TItem>,
>() {
  const dragRootRef = useAnimatedRef<View>();
  const listRef = useAnimatedRef<SectionList<TItem, TSection>>();
  const earlierTargetRef = useAnimatedRef<View>();
  const todayTargetRef = useAnimatedRef<View>();
  const upcomingTargetRef = useAnimatedRef<View>();
  const soonTargetRef = useAnimatedRef<View>();
  const somedayTargetRef = useAnimatedRef<View>();
  const inboxTargetRef = useAnimatedRef<View>();
  const completedTargetRef = useAnimatedRef<View>();

  const floatingX = useSharedValue(0);
  const floatingY = useSharedValue(0);
  const floatingWidth = useSharedValue(0);
  const floatingHeight = useSharedValue(0);
  const autoScrollDirection = useSharedValue(0);
  const scrollOffsetY = useSharedValue(0);
  const contentHeight = useSharedValue(0);
  const viewportHeight = useSharedValue(0);

  const targetRefs = useMemo<TaskGroupRefs>(
    () => ({
      earlier: earlierTargetRef,
      today: todayTargetRef,
      upcoming: upcomingTargetRef,
      soon: soonTargetRef,
      someday: somedayTargetRef,
      inbox: inboxTargetRef,
      completed: completedTargetRef,
    }),
    [
      completedTargetRef,
      earlierTargetRef,
      inboxTargetRef,
      somedayTargetRef,
      soonTargetRef,
      todayTargetRef,
      upcomingTargetRef,
    ],
  );

  const dragValues = useMemo<TaskDragSharedValues>(
    () => ({
      autoScrollDirection,
      floatingHeight,
      floatingWidth,
      floatingX,
      floatingY,
    }),
    [autoScrollDirection, floatingHeight, floatingWidth, floatingX, floatingY],
  );

  const floatingStyle = useAnimatedStyle(() => ({
    height: floatingHeight.value,
    transform: [
      { translateX: floatingX.value },
      { translateY: floatingY.value },
    ],
    width: floatingWidth.value,
  }));

  /* Reanimated runs this handler on the UI thread and expects shared-value
   * writes; React's render-time immutability rule does not apply. */
  /* eslint-disable react-hooks/immutability */
  const scrollHandler = useAnimatedScrollHandler((event) => {
    scrollOffsetY.value = event.contentOffset.y;
  });

  useFrameCallback(({ timeSincePreviousFrame }) => {
    if (autoScrollDirection.value === 0) return;

    const maxOffset = Math.max(0, contentHeight.value - viewportHeight.value);
    const elapsed = Math.min(timeSincePreviousFrame ?? 16, 32);
    const nextOffset = Math.max(
      0,
      Math.min(
        scrollOffsetY.value +
          autoScrollDirection.value * AUTO_SCROLL_SPEED * elapsed,
        maxOffset,
      ),
    );

    if (nextOffset === scrollOffsetY.value) return;

    scrollOffsetY.value = nextOffset;
    scrollTo(listRef, 0, nextOffset, false);
  });
  /* eslint-enable react-hooks/immutability */

  const onContentSizeChange = useCallback(
    (_width: number, height: number) => contentHeight.set(height),
    [contentHeight],
  );

  const onLayout = useCallback(
    (event: LayoutChangeEvent) =>
      viewportHeight.set(event.nativeEvent.layout.height),
    [viewportHeight],
  );

  return {
    dragRootRef,
    dragValues,
    floatingStyle,
    listRef,
    onContentSizeChange,
    onLayout,
    scrollHandler,
    targetRefs,
  };
}
