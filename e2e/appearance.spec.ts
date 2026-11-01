import { expect, test, type Page } from "@playwright/test";

async function openSettings(page: Page) {
  await page.goto("/");
  await expect(page.getByText("My Tasks", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Settings tab" }).click();
  await expect(
    page.getByRole("radiogroup", { name: "Appearance" }),
  ).toBeVisible();
}

function effectiveScheme(page: Page) {
  return page.evaluate(() =>
    document.documentElement.classList.contains("dark") ? "dark" : "light",
  );
}

function canvasColor(page: Page) {
  return page.evaluate(() =>
    getComputedStyle(document.documentElement)
      .getPropertyValue("--color-canvas")
      .trim(),
  );
}

const LIGHT_CANVAS = "244 244 245";
const DARK_CANVAS = "9 9 11";

test("System is the default and follows the browser appearance live", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await openSettings(page);

  await expect(page.getByRole("radio", { name: "System" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect.poll(() => effectiveScheme(page)).toBe("dark");
  expect(await canvasColor(page)).toBe(DARK_CANVAS);

  await page.emulateMedia({ colorScheme: "light" });
  await expect.poll(() => effectiveScheme(page)).toBe("light");
  expect(await canvasColor(page)).toBe(LIGHT_CANVAS);
});

test("Dark overrides a light system, applies immediately and survives a reload", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await openSettings(page);

  await page.getByRole("radio", { name: "Dark" }).click();
  await expect.poll(() => effectiveScheme(page)).toBe("dark");

  await page.reload();
  await expect(page.getByRole("radio", { name: "Dark" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect.poll(() => effectiveScheme(page)).toBe("dark");

  await page.emulateMedia({ colorScheme: "dark" });
  await page.emulateMedia({ colorScheme: "light" });
  expect(await effectiveScheme(page)).toBe("dark");
});

test("Light overrides a dark system", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await openSettings(page);
  await expect.poll(() => effectiveScheme(page)).toBe("dark");

  await page.getByRole("radio", { name: "Light" }).click();
  await expect.poll(() => effectiveScheme(page)).toBe("light");

  await page.reload();
  await expect(page.getByRole("radio", { name: "Light" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  expect(await effectiveScheme(page)).toBe("light");
});

test("returning to System follows the browser again", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await openSettings(page);
  await page.getByRole("radio", { name: "Dark" }).click();
  await expect.poll(() => effectiveScheme(page)).toBe("dark");

  await page.getByRole("radio", { name: "System" }).click();
  await expect.poll(() => effectiveScheme(page)).toBe("light");

  await page.emulateMedia({ colorScheme: "dark" });
  await expect.poll(() => effectiveScheme(page)).toBe("dark");
});

test("an invalid stored value falls back to System", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.addInitScript(() => {
    window.localStorage.setItem("appearance-preference", "midnight");
  });
  await openSettings(page);

  await expect(page.getByRole("radio", { name: "System" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect.poll(() => effectiveScheme(page)).toBe("dark");
});
