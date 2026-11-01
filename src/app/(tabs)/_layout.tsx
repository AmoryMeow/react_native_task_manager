import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemeColors } from "@/shared/theme/use-theme-colors";

import { TabBarIcon } from "@/shared/ui/icons/tab-bar-icon";

export default function TabsLayout() {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      initialRouteName="index"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.foreground,
        tabBarInactiveTintColor: colors.faint,
        tabBarHideOnKeyboard: true,
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: "600",
        },
        tabBarStyle: {
          height: 46 + insets.bottom,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Tasks",
          tabBarAccessibilityLabel: "Tasks tab",
          tabBarIcon: ({ color }) => (
            <TabBarIcon color={color} name="checklist" size={22} />
          ),
        }}
      />
      <Tabs.Screen
        name="tools"
        options={{
          title: "Tools",
          tabBarAccessibilityLabel: "Tools tab",
          tabBarIcon: ({ color }) => (
            <TabBarIcon color={color} name="square.grid.2x2" size={22} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarAccessibilityLabel: "Settings tab",
          tabBarIcon: ({ color }) => (
            <TabBarIcon color={color} name="gearshape" size={22} />
          ),
        }}
      />
    </Tabs>
  );
}
