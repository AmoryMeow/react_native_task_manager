import { SymbolView, type SFSymbol } from "expo-symbols";
import type { ColorValue } from "react-native";

type TabBarIconName = Extract<
  SFSymbol,
  "checklist" | "gearshape" | "square.grid.2x2"
>;

interface TabBarIconProps {
  color: ColorValue;
  name: TabBarIconName;
  size: number;
}

export function TabBarIcon({ color, name, size }: TabBarIconProps) {
  return (
    <SymbolView
      name={name}
      tintColor={color}
      size={size}
      type="hierarchical"
    />
  );
}
