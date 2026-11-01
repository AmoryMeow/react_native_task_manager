const palette = {
  light: {
    canvas: "#f4f4f5",
    surface: "#ffffff",
    subtle: "#fafafa",
    pressed: "#f4f4f5",
    fill: "#e4e4e7",
    line: "#e4e4e7",
    "line-strong": "#d4d4d8",
    "line-focus": "#a1a1aa",
    foreground: "#18181b",
    secondary: "#52525b",
    muted: "#6e6e77",
    faint: "#a1a1aa",
    primary: "#09090b",
    "primary-foreground": "#ffffff",
    "primary-pressed": "#3f3f46",
    accent: "#2563eb",
    danger: "#b91c1c",
    "danger-surface": "#fef2f2",
    "danger-line": "#fecaca",
    warning: "#92400e",
    "warning-surface": "#fffbeb",
    "orb-halo": "#94a3b8",
    "orb-core": "#64748b",
    "orb-center": "#f8fafc",
  },
  dark: {
    canvas: "#09090b",
    surface: "#18181b",
    subtle: "#111113",
    pressed: "#27272a",
    fill: "#27272a",
    line: "#27272a",
    "line-strong": "#3f3f46",
    "line-focus": "#71717a",
    foreground: "#fafafa",
    secondary: "#d4d4d8",
    muted: "#a1a1aa",
    faint: "#71717a",
    primary: "#fafafa",
    "primary-foreground": "#09090b",
    "primary-pressed": "#d4d4d8",
    accent: "#60a5fa",
    danger: "#f87171",
    "danger-surface": "#2a1215",
    "danger-line": "#7f1d1d",
    warning: "#fcd34d",
    "warning-surface": "#2b2109",
    "orb-halo": "#64748b",
    "orb-core": "#94a3b8",
    "orb-center": "#f8fafc",
  },
};

function toRgbChannels(hex) {
  const value = hex.replace("#", "");

  return [0, 2, 4]
    .map((index) => parseInt(value.slice(index, index + 2), 16))
    .join(" ");
}

function toCssVariables(colors) {
  return Object.fromEntries(
    Object.entries(colors).map(([name, hex]) => [
      `--color-${name}`,
      toRgbChannels(hex),
    ]),
  );
}

function toTailwindColors(colors) {
  return Object.fromEntries(
    Object.keys(colors).map((name) => [
      name,
      `rgb(var(--color-${name}) / <alpha-value>)`,
    ]),
  );
}

module.exports = { palette, toCssVariables, toTailwindColors };
