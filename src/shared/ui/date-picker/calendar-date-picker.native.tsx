import DateTimePicker from "@react-native-community/datetimepicker";
import { Platform } from "react-native";

import type { CalendarDatePickerProps } from "./calendar-date-picker.types";

export function CalendarDatePicker({
  accessibilityLabel,
  onChange,
  value,
}: CalendarDatePickerProps) {
  if (Platform.OS !== "ios") return null;

  return (
    <DateTimePicker
      accessibilityLabel={accessibilityLabel}
      value={value}
      mode="date"
      display="inline"
      onValueChange={(_event, selectedDate) => onChange(selectedDate)}
      accentColor="#18181b"
      themeVariant="light"
      style={{ height: 320, width: "100%" }}
    />
  );
}
