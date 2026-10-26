import { Stack } from "expo-router";

export const unstable_settings = {
  anchor: "index",
};

export default function ToolsLayout() {
  return (
    <Stack
      screenOptions={{
        contentStyle: { backgroundColor: "#f4f4f5" },
        headerShadowVisible: false,
        headerTintColor: "#18181b",
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
    </Stack>
  );
}
