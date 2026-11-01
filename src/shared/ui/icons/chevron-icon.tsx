import Svg, { Path } from "react-native-svg";
import { useThemeColors } from "@/shared/theme/use-theme-colors";

interface ChevronIconProps {
  direction: "up" | "down";
  color?: string;
  size?: number;
}

export function ChevronIcon({
  direction,
  color,
  size = 13,
}: ChevronIconProps) {
  const colors = useThemeColors();

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d={direction === "up" ? "m18 15-6-6-6 6" : "m6 9 6 6 6-6"}
        stroke={color ?? colors.secondary}
        strokeWidth={2.25}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
