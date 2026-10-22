import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function SettingsScreen() {
  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      className="flex-1 bg-zinc-100 px-4 pt-4"
    >
      <Text className="text-3xl font-bold tracking-tight text-zinc-950">
        Settings
      </Text>

      <View className="mt-5 rounded-2xl border border-zinc-200 bg-white p-4">
        <Text className="text-sm leading-5 text-zinc-500">
          Settings will be added here as the app develops.
        </Text>
      </View>
    </SafeAreaView>
  );
}
