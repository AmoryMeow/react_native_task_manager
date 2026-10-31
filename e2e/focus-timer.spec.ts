import { expect, test, type Page } from "@playwright/test";

async function openTaskList(page: Page) {
  await page.goto("/");
  await expect(page.getByText("My Tasks", { exact: true })).toBeVisible();
  await expect(page.getByText("Loading tasks...")).toBeHidden();
}

async function createTask(page: Page, title: string) {
  await page.getByPlaceholder("Add a small next step").fill(title);
  await page.getByRole("button", { name: "Add task" }).click();
  await expect(page.getByLabel(`Edit ${title}`)).toBeVisible();
}

async function startFocus(page: Page, title: string) {
  await page
    .getByRole("button", { name: `Open task details for ${title}` })
    .click();
  await page.getByRole("button", { name: "Start focus" }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await expect(timer(page)).toBeVisible();
}

function timer(page: Page) {
  return page.getByLabel(/^Focus time/);
}

async function readSeconds(page: Page) {
  const text = (await timer(page).textContent()) ?? "";
  const [hours, minutes, seconds] = text.split(":").map(Number);
  return hours * 3600 + minutes * 60 + seconds;
}

function taskIdFromUrl(page: Page) {
  return new URL(page.url()).pathname.split("/").at(-1)!;
}

test("counts focus time, freezes while paused, and resumes", async ({
  page,
}) => {
  await openTaskList(page);
  await createTask(page, "Timer task");
  await startFocus(page, "Timer task");

  await expect(timer(page)).toHaveText(/^00:00:0\d$/);
  await expect
    .poll(() => readSeconds(page), { timeout: 5_000 })
    .toBeGreaterThanOrEqual(2);

  await page.getByRole("button", { name: "Pause focus" }).click();
  await expect(
    page.getByRole("button", { name: "Resume focus" }),
  ).toBeVisible();
  await expect(page.getByText("Paused", { exact: true })).toBeVisible();
  const pausedAt = await readSeconds(page);
  await page.waitForTimeout(2_100);
  expect(await readSeconds(page)).toBe(pausedAt);

  await page.getByRole("button", { name: "Resume focus" }).click();
  await expect(page.getByRole("button", { name: "Pause focus" })).toBeVisible();
  await expect
    .poll(() => readSeconds(page), { timeout: 5_000 })
    .toBeGreaterThan(pausedAt);
});

test("a reload continues the same session instead of resetting it", async ({
  page,
}) => {
  await openTaskList(page);
  await createTask(page, "Reload timer task");
  await startFocus(page, "Reload timer task");
  await expect
    .poll(() => readSeconds(page), { timeout: 5_000 })
    .toBeGreaterThanOrEqual(2);
  const beforeReload = await readSeconds(page);

  await page.reload();

  await expect(timer(page)).toBeVisible();
  expect(await readSeconds(page)).toBeGreaterThanOrEqual(beforeReload);
});

test("Exit focus ends the session; the next visit starts a new one", async ({
  page,
}) => {
  await openTaskList(page);
  await createTask(page, "Exit timer task");
  await startFocus(page, "Exit timer task");
  await expect
    .poll(() => readSeconds(page), { timeout: 5_000 })
    .toBeGreaterThanOrEqual(2);

  await page.getByRole("button", { name: "Exit focus" }).click();
  await expect(page).toHaveURL(/\/$/);

  await startFocus(page, "Exit timer task");
  expect(await readSeconds(page)).toBeLessThan(2);
});

test("completing the task ends focus and returns to Tasks", async ({
  page,
}) => {
  await openTaskList(page);
  await createTask(page, "Complete timer task");
  await createTask(page, "Next timer task");
  await startFocus(page, "Complete timer task");

  await page.getByRole("button", { name: "Complete task" }).click();
  await expect(page).toHaveURL(/\/$/);

  await startFocus(page, "Next timer task");
  await expect(page.getByText("Another focus session is open")).toBeHidden();
});

test("an open session for another task is never silently replaced", async ({
  page,
}) => {
  await openTaskList(page);
  await createTask(page, "First focus task");
  await createTask(page, "Second focus task");

  await startFocus(page, "First focus task");
  const firstTaskId = taskIdFromUrl(page);
  await page.getByRole("button", { name: "Exit focus" }).click();

  await startFocus(page, "Second focus task");
  const secondTaskId = taskIdFromUrl(page);
  await page.goto(`/focus/${firstTaskId}`);

  await expect(
    page.getByRole("heading", { name: "Another focus session is open" }),
  ).toBeVisible();
  await expect(
    page.getByText("“Second focus task” is still in focus."),
  ).toBeVisible();

  await page.getByRole("button", { name: "Return to that session" }).click();
  await expect(page).toHaveURL(new RegExp(`/focus/${secondTaskId}`));
  await expect(
    page.getByRole("heading", { name: "Second focus task" }),
  ).toBeVisible();

  await page.goto(`/focus/${firstTaskId}`);
  await page.getByRole("button", { name: "End it and focus here" }).click();
  await expect(
    page.getByRole("heading", { name: "First focus task" }),
  ).toBeVisible();
  await expect(timer(page)).toHaveText(/^00:00:0\d$/);
});

test("browser Back ends the session like Exit focus", async ({ page }) => {
  await openTaskList(page);
  await createTask(page, "Back timer task");
  await createTask(page, "Other back task");
  await startFocus(page, "Back timer task");

  await page.goBack();
  await expect(page.getByText("My Tasks", { exact: true })).toBeVisible();

  await startFocus(page, "Other back task");
  await expect(page.getByText("Another focus session is open")).toBeHidden();
});
