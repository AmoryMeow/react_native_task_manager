export type ColorSchemeName = "light" | "dark";

export type ThemeColorName =
  | "canvas"
  | "surface"
  | "subtle"
  | "pressed"
  | "fill"
  | "line"
  | "line-strong"
  | "line-focus"
  | "foreground"
  | "secondary"
  | "muted"
  | "faint"
  | "primary"
  | "primary-foreground"
  | "primary-pressed"
  | "accent"
  | "danger"
  | "danger-surface"
  | "danger-line"
  | "warning"
  | "warning-surface"
  | "orb-halo"
  | "orb-core"
  | "orb-center";

export type ThemeColors = Record<ThemeColorName, string>;

export const palette: Record<ColorSchemeName, ThemeColors>;

export function toCssVariables(colors: ThemeColors): Record<string, string>;

export function toTailwindColors(colors: ThemeColors): Record<string, string>;
