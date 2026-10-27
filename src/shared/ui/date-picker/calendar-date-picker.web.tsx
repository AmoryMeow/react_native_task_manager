import type { ChangeEvent, CSSProperties } from "react";

import type { CalendarDatePickerProps } from "./calendar-date-picker.types";

const inputStyle: CSSProperties = {
  backgroundColor: "#ffffff",
  border: "1px solid #d4d4d8",
  borderRadius: 8,
  boxSizing: "border-box",
  color: "#27272a",
  colorScheme: "light",
  fontFamily: "inherit",
  fontSize: 16,
  height: 44,
  padding: "0 12px",
  width: "100%",
};

function toInputDateValue(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function parseInputDateValue(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(0);

  date.setFullYear(year, month - 1, day);
  date.setHours(0, 0, 0, 0);

  if (
    date.getFullYear() !== year ||
    date.getMonth() + 1 !== month ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

export function CalendarDatePicker({
  accessibilityLabel,
  disabled,
  onChange,
  value,
}: CalendarDatePickerProps) {
  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const date = parseInputDateValue(event.currentTarget.value);

    if (date) onChange(date);
  }

  return (
    <input
      aria-label={accessibilityLabel}
      disabled={disabled}
      onChange={handleChange}
      style={{ ...inputStyle, cursor: disabled ? "default" : "pointer" }}
      type="date"
      value={toInputDateValue(value)}
    />
  );
}
