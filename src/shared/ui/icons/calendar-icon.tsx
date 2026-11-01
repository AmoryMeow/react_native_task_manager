import Svg, { Path } from "react-native-svg";
import { useThemeColors } from "@/shared/theme/use-theme-colors";

interface CalendarIconProps {
  color?: string;
  size?: number;
}

export function CalendarIcon({
  color,
  size = 17,
}: CalendarIconProps) {
  const colors = useThemeColors();

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M7 3v3m10-3v3M4 9h16M6 5h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"
        stroke={color ?? colors.secondary}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
