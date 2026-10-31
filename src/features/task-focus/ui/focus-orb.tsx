import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useId, useState } from "react";
import { AppState, StyleSheet, useWindowDimensions, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import Svg, { Circle, Defs, RadialGradient, Stop } from "react-native-svg";

const HALF_BREATH_MS = 3000;
const CORE_LAG_MS = 300;
const RESTING = 0.5;

// Short screens (e.g. iPhone SE) get a 70% composition so the task title
// still fits comfortably above the actions.
const COMPACT_SCREEN_HEIGHT = 700;
const COMPACT_FACTOR = 0.7;

const SLATE_400 = "148, 163, 184";
const SLATE_500 = "100, 116, 139";
const SLATE_50 = "248, 250, 252";

const easing = Easing.inOut(Easing.sin);

function breathe(value: SharedValue<number>, delayMs = 0) {
  // withRepeat(reverse) oscillates between its start value and the target, so
  // settle at 0 first to get the full range (and resume smoothly after pause).
  const loop = withSequence(
    withTiming(0, { duration: HALF_BREATH_MS * value.get(), easing }),
    withRepeat(withTiming(1, { duration: HALF_BREATH_MS, easing }), -1, true),
  );

  value.set(delayMs > 0 ? withDelay(delayMs, loop) : loop);
}

interface FocusOrbProps {
  active: boolean;
}

export function FocusOrb({ active }: FocusOrbProps) {
  const prefersReducedMotion = useReducedMotion();
  const [isScreenFocused, setIsScreenFocused] = useState(false);
  const [isAppActive, setIsAppActive] = useState(
    AppState.currentState !== "background",
  );
  const glow = useSharedValue(RESTING);
  const core = useSharedValue(RESTING);
  const idPrefix = `focus-orb-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const { height: windowHeight } = useWindowDimensions();
  const factor = windowHeight < COMPACT_SCREEN_HEIGHT ? COMPACT_FACTOR : 1;
  const size = (value: number) => Math.round(value * factor);

  useFocusEffect(
    useCallback(() => {
      setIsScreenFocused(true);
      return () => setIsScreenFocused(false);
    }, []),
  );

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      setIsAppActive(nextState === "active");
    });

    return () => subscription.remove();
  }, []);

  const shouldAnimate =
    active && !prefersReducedMotion && isScreenFocused && isAppActive;

  useEffect(() => {
    if (!shouldAnimate) {
      cancelAnimation(glow);
      cancelAnimation(core);

      if (prefersReducedMotion || !active) {
        glow.set(RESTING);
        core.set(RESTING);
      }
      return;
    }

    breathe(glow);
    breathe(core, CORE_LAG_MS);

    return () => {
      cancelAnimation(glow);
      cancelAnimation(core);
    };
  }, [active, core, glow, prefersReducedMotion, shouldAnimate]);

  const haloStyle = useAnimatedStyle(() => ({
    opacity: interpolate(glow.value, [0, 1], [0.35, 1]),
    transform: [{ scale: interpolate(glow.value, [0, 1], [1, 1.2]) }],
  }));
  const middleStyle = useAnimatedStyle(() => ({
    opacity: interpolate(core.value, [0, 1], [0.55, 1]),
    transform: [{ scale: interpolate(core.value, [0, 1], [1, 1.14]) }],
  }));
  const coreStyle = useAnimatedStyle(() => ({
    opacity: interpolate(core.value, [0, 1], [0.6, 1]),
    transform: [{ scale: interpolate(core.value, [0, 1], [1, 1.14]) }],
  }));

  return (
    <View
      aria-hidden
      pointerEvents="none"
      style={[styles.container, { width: size(220), height: size(220) }]}
    >
      <Animated.View style={[styles.layer, haloStyle]}>
        <SoftDisc
          id={`${idPrefix}-halo`}
          size={size(198)}
          color={SLATE_400}
          stops={[
            [0, 0.2],
            [0.86, 0.16],
            [1, 0],
          ]}
        />
      </Animated.View>
      <Animated.View style={[styles.layer, middleStyle]}>
        <SoftDisc
          id={`${idPrefix}-middle`}
          size={size(132)}
          color={SLATE_400}
          stops={[
            [0, 0.32],
            [0.93, 0.3],
            [1, 0],
          ]}
        />
      </Animated.View>
      <Animated.View style={[styles.layer, coreStyle]}>
        <SoftDisc
          id={`${idPrefix}-core`}
          size={size(68)}
          color={SLATE_500}
          stops={[
            [0, 0.52],
            [0.93, 0.5],
            [1, 0],
          ]}
        />
      </Animated.View>
      <View style={styles.layer}>
        <SoftDisc
          id={`${idPrefix}-dot`}
          size={Math.max(14, size(18))}
          color={SLATE_50}
          stops={[
            [0, 1],
            [0.7, 1],
            [1, 0],
          ]}
        />
      </View>
    </View>
  );
}

interface SoftDiscProps {
  id: string;
  size: number;
  /** "r, g, b" */
  color: string;
  /** [offset 0..1 from center to edge, opacity] */
  stops: readonly (readonly [number, number])[];
}

function SoftDisc({ id, size, color, stops }: SoftDiscProps) {
  return (
    <Svg width={size} height={size}>
      <Defs>
        <RadialGradient id={id} cx="50%" cy="50%" r="50%">
          {stops.map(([offset, opacity]) => (
            <Stop
              key={offset}
              offset={offset}
              stopColor={`rgb(${color})`}
              stopOpacity={opacity}
            />
          ))}
        </RadialGradient>
      </Defs>
      <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#${id})`} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
  },
  layer: {
    position: "absolute",
  },
});
