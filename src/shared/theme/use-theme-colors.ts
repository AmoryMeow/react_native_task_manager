import { useColorScheme } from "nativewind";

import { palette, type ColorSchemeName, type ThemeColors } from "./palette";

export function useEffectiveColorScheme(): ColorSchemeName {
  const { colorScheme } = useColorScheme();

  return colorScheme === "dark" ? "dark" : "light";
}

export function useThemeColors(): ThemeColors {
  return palette[useEffectiveColorScheme()];
}
