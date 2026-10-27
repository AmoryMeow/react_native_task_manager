import {
  SymbolView,
  type AndroidSymbol,
  type SFSymbol,
} from "expo-symbols";
import type { ColorValue } from "react-native";

type TabBarIconName = Extract<
  SFSymbol,
  "checklist" | "gearshape" | "square.grid.2x2"
>;

const tabBarIconNames = {
  checklist: {
    ios: "checklist",
    android: "checklist",
    web: "checklist",
  },
  "square.grid.2x2": {
    ios: "square.grid.2x2",
    android: "grid_view",
    web: "grid_view",
  },
  gearshape: {
    ios: "gearshape",
    android: "settings",
    web: "settings",
  },
} satisfies Record<
  TabBarIconName,
  { ios: SFSymbol; android: AndroidSymbol; web: AndroidSymbol }
>;

interface TabBarIconProps {
  color: ColorValue;
  name: TabBarIconName;
  size: number;
}

export function TabBarIcon({ color, name, size }: TabBarIconProps) {
  return (
    <SymbolView
      name={tabBarIconNames[name]}
      tintColor={color}
      size={size}
      type="hierarchical"
    />
  );
}
