export function formatFocusDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
}

export function describeFocusDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const parts: [number, string][] = [
    [Math.floor(totalSeconds / 3600), "hour"],
    [Math.floor((totalSeconds % 3600) / 60), "minute"],
    [totalSeconds % 60, "second"],
  ];
  const spoken = parts
    .filter(([value], index) => value > 0 || index === 2)
    .map(([value, unit]) => `${value} ${unit}${value === 1 ? "" : "s"}`);

  return spoken.join(", ");
}
