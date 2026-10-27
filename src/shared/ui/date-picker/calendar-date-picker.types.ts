export interface CalendarDatePickerProps {
  accessibilityLabel: string;
  disabled?: boolean;
  onChange: (date: Date) => void;
  value: Date;
}
