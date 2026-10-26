import { Link } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const plannedTools = [
  {
    description: "Work on one task with fewer distractions.",
    title: "Focus Mode",
  },
];

export default function ToolsScreen() {
  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      className="flex-1 bg-zinc-100"
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerClassName="gap-3 px-4 pb-8 pt-4"
      >
        <View className="mb-2 gap-1">
          <Text className="text-3xl font-bold tracking-tight text-zinc-950">
            Tools
          </Text>
          <Text className="text-sm leading-5 text-zinc-500">
            Simple ways to choose a task and stay focused.
          </Text>
        </View>

        <Link href="/tools/roulette" asChild>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open Task Roulette"
            className="min-h-24 rounded-2xl border border-zinc-200 bg-white p-4 active:bg-zinc-50"
          >
            <View className="mb-2 flex-row items-center justify-between gap-3">
              <Text className="text-base font-semibold text-zinc-900">
                Task Roulette
              </Text>
              <Text className="text-xl text-zinc-400">›</Text>
            </View>
            <Text className="text-sm leading-5 text-zinc-500">
              Pick a task when you&apos;re not sure where to start.
            </Text>
          </Pressable>
        </Link>

        <Link href="/tools/duel" asChild>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open Task Duel"
            className="min-h-24 rounded-2xl border border-zinc-200 bg-white p-4 active:bg-zinc-50"
          >
            <View className="mb-2 flex-row items-center justify-between gap-3">
              <Text className="text-base font-semibold text-zinc-900">
                Task Duel
              </Text>
              <Text className="text-xl text-zinc-400">›</Text>
            </View>
            <Text className="text-sm leading-5 text-zinc-500">
              Compare two tasks and choose the one you would rather do.
            </Text>
          </Pressable>
        </Link>

        {plannedTools.map((tool) => (
          <View
            key={tool.title}
            className="rounded-2xl border border-zinc-200 bg-white p-4"
          >
            <View className="mb-2 flex-row items-center justify-between gap-3">
              <Text className="text-base font-semibold text-zinc-900">
                {tool.title}
              </Text>
              <View className="rounded-full bg-zinc-100 px-2.5 py-1">
                <Text className="text-xs font-medium text-zinc-500">
                  Planned
                </Text>
              </View>
            </View>
            <Text className="text-sm leading-5 text-zinc-500">
              {tool.description}
            </Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
