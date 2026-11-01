import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  getAppearancePreference,
  setAppearancePreference,
  type AppearancePreference,
} from "@/shared/theme/appearance";

const appearanceOptions: { value: AppearancePreference; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export default function SettingsScreen() {
  const [preference, setPreference] = useState<AppearancePreference | null>(
    null,
  );
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    void getAppearancePreference().then((stored) => {
      if (active) setPreference(stored);
    });

    return () => {
      active = false;
    };
  }, []);

  function selectAppearance(next: AppearancePreference) {
    setPreference(next);
    setSaveError(null);

    setAppearancePreference(next).catch((error) => {
      console.error("Failed to save appearance preference", error);
      setSaveError(
        "Appearance changed, but it wasn't saved for next time. Please try again.",
      );
    });
  }

  return (
    <SafeAreaView edges={["top", "left", "right"]} className="flex-1 bg-canvas">
      <View className="flex-1 px-4 pt-4">
        <Text className="text-3xl font-bold tracking-tight text-foreground">
          Settings
        </Text>

        <View className="mt-5 gap-3 rounded-2xl border border-line bg-surface p-4">
          <View className="gap-1">
            <Text className="text-base font-semibold text-foreground">
              Appearance
            </Text>
            <Text className="text-sm leading-5 text-muted">
              System follows your device setting.
            </Text>
          </View>

          <View
            accessibilityRole="radiogroup"
            accessibilityLabel="Appearance"
            className="flex-row gap-1 rounded-xl bg-fill p-1"
          >
            {appearanceOptions.map((option) => {
              const isSelected = preference === option.value;

              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="radio"
                  accessibilityLabel={option.label}
                  aria-checked={isSelected}
                  onPress={() => selectAppearance(option.value)}
                  className={`min-h-10 flex-1 items-center justify-center rounded-lg ${
                    isSelected ? "bg-surface" : "active:bg-pressed"
                  }`}
                >
                  <Text
                    className={`text-sm ${
                      isSelected
                        ? "font-semibold text-foreground"
                        : "font-medium text-muted"
                    }`}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {saveError ? (
            <Text
              accessibilityLiveRegion="polite"
              className="text-xs leading-5 text-danger"
            >
              {saveError}
            </Text>
          ) : null}
        </View>
      </View>
    </SafeAreaView>
  );
}
