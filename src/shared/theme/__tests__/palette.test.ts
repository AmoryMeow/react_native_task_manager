import {
  palette,
  toCssVariables,
  toTailwindColors,
  type ColorSchemeName,
  type ThemeColorName,
} from "../palette";

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((index) => {
    const channel = parseInt(hex.slice(index, index + 2), 16) / 255;
    return channel <= 0.03928
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(foreground: string, background: string) {
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort(
    (left, right) => right - left,
  );

  return (lighter + 0.05) / (darker + 0.05);
}

const schemes: ColorSchemeName[] = ["light", "dark"];

describe("palette", () => {
  test("both themes define the same tokens", () => {
    expect(Object.keys(palette.dark).sort()).toEqual(
      Object.keys(palette.light).sort(),
    );
  });

  test("tokens become CSS variables and Tailwind colors", () => {
    expect(toCssVariables(palette.light)["--color-surface"]).toBe(
      "255 255 255",
    );
    expect(toCssVariables(palette.dark)["--color-canvas"]).toBe("9 9 11");
    expect(toTailwindColors(palette.light)["line-strong"]).toBe(
      "rgb(var(--color-line-strong) / <alpha-value>)",
    );
  });

  const textPairs: [ThemeColorName, ThemeColorName, number][] = [
    ["foreground", "canvas", 7],
    ["foreground", "surface", 7],
    ["foreground", "subtle", 7],
    ["secondary", "surface", 4.5],
    ["muted", "canvas", 4.5],
    ["muted", "surface", 4.5],
    ["primary-foreground", "primary", 7],
    ["accent", "surface", 4.5],
    ["danger", "danger-surface", 4.5],
    ["danger", "surface", 4.5],
    ["warning", "warning-surface", 4.5],
  ];

  test.each(
    schemes.flatMap((scheme) =>
      textPairs.map(
        ([text, background, minimum]) =>
          [scheme, text, background, minimum] as const,
      ),
    ),
  )(
    "%s: %s on %s meets a %d:1 contrast ratio",
    (scheme, text, background, minimum) => {
      expect(
        contrast(palette[scheme][text], palette[scheme][background]),
      ).toBeGreaterThanOrEqual(minimum);
    },
  );
});
