const plugin = require("tailwindcss/plugin");

const {
  palette,
  toCssVariables,
  toTailwindColors,
} = require("./src/shared/theme/palette");

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  darkMode: "class",
  theme: {
    extend: {
      colors: toTailwindColors(palette.light),
    },
  },
  plugins: [
    plugin(({ addBase }) => {
      addBase({
        ":root": toCssVariables(palette.light),
        ".dark:root": toCssVariables(palette.dark),
      });
    }),
  ],
};
