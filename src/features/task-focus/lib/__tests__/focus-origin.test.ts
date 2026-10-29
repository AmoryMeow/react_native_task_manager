import { parseFocusOrigin } from "../focus-origin";

describe("parseFocusOrigin", () => {
  it.each(["roulette", "duel", "tools"] as const)(
    "accepts the %s origin",
    (origin) => {
      expect(parseFocusOrigin(origin)).toBe(origin);
    },
  );

  it.each([
    undefined,
    "",
    "tasks",
    "/tools/roulette",
    "https://example.com",
    ["roulette"],
  ])("rejects an unsupported origin: %p", (origin) => {
    expect(parseFocusOrigin(origin)).toBeUndefined();
  });
});
