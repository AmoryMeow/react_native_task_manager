import { Stack, ThemeProvider } from "expo-router";
import { SQLiteProvider } from "expo-sqlite";
import { useMemo } from "react";
import { StatusBar } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { migrateDb } from "../shared/db/migrations";
import { initializeAppearance } from "../shared/theme/appearance";
import { createNavigationTheme } from "../shared/theme/navigation-theme";
import { palette } from "../shared/theme/palette";
import { useEffectiveColorScheme } from "../shared/theme/use-theme-colors";

import "../global.css";

initializeAppearance();

export const unstable_settings = {
  anchor: "(tabs)",
};

export default function RootLayout() {
  const scheme = useEffectiveColorScheme();
  const colors = palette[scheme];
  const navigationTheme = useMemo(
    () => createNavigationTheme(scheme),
    [scheme],
  );

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={navigationTheme}>
        <StatusBar
          barStyle={scheme === "dark" ? "light-content" : "dark-content"}
        />
        <SQLiteProvider databaseName="tasks.db" onInit={migrateDb} useSuspense>
          <Stack>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen
              name="task/[id]"
              options={{
                presentation: "formSheet",
                sheetAllowedDetents: [0.5, 0.9],
                sheetInitialDetentIndex: 0,
                sheetGrabberVisible: true,
                headerShown: false,
              }}
            />
            <Stack.Screen
              name="focus/[id]"
              options={{
                presentation: "card",
                title: "",
                headerShadowVisible: false,
                headerStyle: { backgroundColor: colors.subtle },
                headerTintColor: colors.foreground,
              }}
            />
          </Stack>
        </SQLiteProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
