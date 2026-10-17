import Svg, { Path } from "react-native-svg";

interface ChevronIconProps {
  direction: "up" | "down";
  color?: string;
  size?: number;
}

export function ChevronIcon({
  direction,
  color = "#52525b",
  size = 13,
}: ChevronIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d={direction === "up" ? "m18 15-6-6-6 6" : "m6 9 6 6 6-6"}
        stroke={color}
        strokeWidth={2.25}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
