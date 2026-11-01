import { DarkTheme, DefaultTheme } from "expo-router";

import { palette, type ColorSchemeName } from "./palette";

export function createNavigationTheme(scheme: ColorSchemeName) {
  const base = scheme === "dark" ? DarkTheme : DefaultTheme;
  const colors = palette[scheme];

  return {
    ...base,
    colors: {
      ...base.colors,
      primary: colors.foreground,
      background: colors.canvas,
      card: colors.surface,
      text: colors.foreground,
      border: colors.line,
      notification: colors.danger,
    },
  };
}
