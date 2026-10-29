const focusOrigins = ["roulette", "duel", "tools"] as const;

export type FocusOrigin = (typeof focusOrigins)[number];

export function parseFocusOrigin(value: unknown): FocusOrigin | undefined {
  return typeof value === "string" &&
    focusOrigins.includes(value as FocusOrigin)
    ? (value as FocusOrigin)
    : undefined;
}
