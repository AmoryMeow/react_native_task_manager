import { Stack } from "expo-router";
import { useThemeColors } from "@/shared/theme/use-theme-colors";

export const unstable_settings = {
  anchor: "index",
};

export default function ToolsLayout() {
  const colors = useThemeColors();
  return (
    <Stack
      screenOptions={{
        contentStyle: { backgroundColor: colors.canvas },
        headerShadowVisible: false,
        headerTintColor: colors.foreground,
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen
        name="roulette"
        options={{
          headerBackTitle: "Tools",
          title: "Task Roulette",
        }}
      />
      <Stack.Screen
        name="duel"
        options={{
          headerBackTitle: "Tools",
          title: "Task Duel",
        }}
      />
      <Stack.Screen
        name="focus"
        options={{
          headerBackTitle: "Tools",
          title: "Focus Mode",
        }}
      />
    </Stack>
  );
}
