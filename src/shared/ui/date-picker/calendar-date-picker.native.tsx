import DateTimePicker from "@react-native-community/datetimepicker";
import { Platform } from "react-native";

import { palette } from "@/shared/theme/palette";
import { useEffectiveColorScheme } from "@/shared/theme/use-theme-colors";

import type { CalendarDatePickerProps } from "./calendar-date-picker.types";

export function CalendarDatePicker({
  accessibilityLabel,
  onChange,
  value,
}: CalendarDatePickerProps) {
  const scheme = useEffectiveColorScheme();
  const colors = palette[scheme];

  if (Platform.OS !== "ios") return null;

  return (
    <DateTimePicker
      accessibilityLabel={accessibilityLabel}
      value={value}
      mode="date"
      display="inline"
      onValueChange={(_event, selectedDate) => onChange(selectedDate)}
      accentColor={colors.foreground}
      themeVariant={scheme}
      style={{ height: 320, width: "100%" }}
    />
  );
}
