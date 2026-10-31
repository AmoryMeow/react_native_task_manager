import { expect, test, type Page } from "@playwright/test";

async function openTaskList(page: Page) {
  await page.goto("/");
  await expect(page.getByText("My Tasks", { exact: true })).toBeVisible();
  await expect(page.getByText("Loading tasks...")).toBeHidden();
}

async function createTask(page: Page, title: string, today = false) {
  if (today) {
    await page.getByRole("button", { name: "Today", exact: true }).click();
  }
  await page.getByPlaceholder("Add a small next step").fill(title);
  await page.getByRole("button", { name: "Add task" }).click();
  await expect(page.getByLabel(`Edit ${title}`)).toBeVisible();
}

async function startFocusFromDetails(page: Page, title: string) {
  await page
    .getByRole("button", { name: `Open task details for ${title}` })
    .click();
  await page.getByRole("button", { name: "Start focus" }).click();
  await expectFocusOn(page, title);
}

async function expectFocusOn(page: Page, title: string) {
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await expect(page.getByLabel(/^Focus time/)).toBeVisible();
}

async function openTools(page: Page) {
  await page.getByRole("tab", { name: "Tools tab" }).click();
  await expect(
    page.getByRole("link", { name: "Open Task Roulette" }),
  ).toBeVisible();
}

function toSeconds(text: string | null) {
  const [hours, minutes, seconds] = (text ?? "").split(":").map(Number);
  return hours * 3600 + minutes * 60 + seconds;
}

async function focusSeconds(page: Page) {
  return toSeconds(await page.getByLabel(/^Focus time/).textContent());
}

async function cardSeconds(page: Page) {
  return toSeconds(
    await page.getByLabel(/^Recovered focus time/).textContent(),
  );
}

function recoveryCard(page: Page) {
  return page.getByLabel("Unfinished focus session");
}

async function goBackToTasks(page: Page) {
  await page.getByLabel("Tasks, back", { exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText("My Tasks", { exact: true })).toBeVisible();
  await expect(recoveryCard(page)).toBeVisible();
}

test("going back from an active session keeps it running and resumes the same session", async ({
  page,
}) => {
  await openTaskList(page);
  await createTask(page, "Back active task");
  await startFocusFromDetails(page, "Back active task");
  const focusUrl = page.url();
  await expect.poll(() => focusSeconds(page)).toBeGreaterThanOrEqual(2);
  const beforeLeaving = await focusSeconds(page);

  await goBackToTasks(page);

  const card = recoveryCard(page);
  await expect(card.getByText("Back active task")).toBeVisible();
  await expect(card.getByText("Active", { exact: true })).toBeVisible();
  await expect.poll(() => cardSeconds(page)).toBeGreaterThan(beforeLeaving);
  await expect(
    page.getByRole("checkbox", { name: "Complete Back active task" }),
  ).not.toBeChecked();

  await card
    .getByRole("button", { name: "Resume focus on Back active task" })
    .click();

  await expect(page).toHaveURL(focusUrl);
  await expectFocusOn(page, "Back active task");
  await expect(page.getByRole("button", { name: "Pause focus" })).toBeVisible();
  expect(await focusSeconds(page)).toBeGreaterThan(beforeLeaving);
});

test("going back from a paused session keeps it paused", async ({ page }) => {
  await openTaskList(page);
  await createTask(page, "Back paused task");
  await startFocusFromDetails(page, "Back paused task");
  await page.getByRole("button", { name: "Pause focus" }).click();
  await expect(
    page.getByRole("button", { name: "Resume focus" }),
  ).toBeVisible();
  const pausedAt = await focusSeconds(page);

  await goBackToTasks(page);

  const card = recoveryCard(page);
  await expect(card.getByText("Paused", { exact: true })).toBeVisible();
  await page.waitForTimeout(1_500);
  expect(await cardSeconds(page)).toBe(pausedAt);

  await card.getByRole("button", { name: /^Resume focus on/ }).click();

  await expectFocusOn(page, "Back paused task");
  await expect(
    page.getByRole("button", { name: "Resume focus" }),
  ).toBeVisible();
  expect(await focusSeconds(page)).toBe(pausedAt);
});

test("resuming twice opens a single Focus screen for one session", async ({
  page,
}) => {
  await openTaskList(page);
  await createTask(page, "Single focus task");
  await startFocusFromDetails(page, "Single focus task");
  await goBackToTasks(page);

  await recoveryCard(page)
    .getByRole("button", { name: /^Resume focus on/ })
    .dblclick();
  await expectFocusOn(page, "Single focus task");

  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText("My Tasks", { exact: true })).toBeVisible();
  await expect(recoveryCard(page)).toHaveCount(1);

  await page.reload();
  await expect(recoveryCard(page)).toHaveCount(1);
  await expect(recoveryCard(page).getByText("Single focus task")).toBeVisible();
});

test("End focus after going back still ends the session", async ({ page }) => {
  await openTaskList(page);
  await createTask(page, "End after back task");
  await startFocusFromDetails(page, "End after back task");
  await goBackToTasks(page);

  await recoveryCard(page)
    .getByRole("button", { name: /^Resume focus on/ })
    .click();
  await page.getByRole("button", { name: "Exit focus" }).click();

  await expect(page.getByText("My Tasks", { exact: true })).toBeVisible();
  await expect(recoveryCard(page)).toBeHidden();
});

test("Complete task after going back completes the task and the session", async ({
  page,
}) => {
  await openTaskList(page);
  await createTask(page, "Complete after back task");
  await startFocusFromDetails(page, "Complete after back task");
  await goBackToTasks(page);

  await recoveryCard(page)
    .getByRole("button", { name: /^Resume focus on/ })
    .click();
  await page.getByRole("button", { name: "Complete task" }).click();

  await expect(page.getByText("My Tasks", { exact: true })).toBeVisible();
  await expect(recoveryCard(page)).toBeHidden();
  await page.getByRole("button", { name: "Expand Completed" }).click();
  await expect(
    page.getByRole("checkbox", {
      name: "Complete Complete after back task",
    }),
  ).toBeChecked();
});

async function goBackToOrigin(page: Page, backTitle: string, url: RegExp) {
  await page.getByLabel(`${backTitle}, back`, { exact: true }).click();
  await expect(page).toHaveURL(url);
  await page.getByRole("tab", { name: "Tasks tab" }).click();
  await expect(page.getByText("My Tasks", { exact: true })).toBeVisible();
}

test("back from Focus Mode opened in Task Roulette keeps the session", async ({
  page,
}) => {
  await openTaskList(page);
  await createTask(page, "Roulette back task", true);
  await openTools(page);
  await page.getByRole("link", { name: "Open Task Roulette" }).click();
  await page.getByRole("button", { name: "Spin Task Roulette" }).click();
  await page
    .getByRole("button", { name: "Start focus on Roulette back task" })
    .click({ timeout: 5_000 });
  await expect(page).toHaveURL(/from=roulette/);
  await expectFocusOn(page, "Roulette back task");

  await goBackToOrigin(page, "Task Roulette", /\/tools\/roulette$/);
  await expect(
    recoveryCard(page).getByText("Roulette back task"),
  ).toBeVisible();
});

test("back from Focus Mode opened in Task Duel keeps the session", async ({
  page,
}) => {
  await openTaskList(page);
  await createTask(page, "Duel back task", true);
  await openTools(page);
  await page.getByRole("link", { name: "Open Task Duel" }).click();
  await page
    .getByRole("button", { name: "Start focus on Duel back task" })
    .click();
  await expect(page).toHaveURL(/from=duel/);
  await expectFocusOn(page, "Duel back task");

  await goBackToOrigin(page, "Task Duel", /\/tools\/duel$/);
  await expect(recoveryCard(page).getByText("Duel back task")).toBeVisible();
});

test("back from Focus Mode opened in the Focus task picker keeps the session", async ({
  page,
}) => {
  await openTaskList(page);
  await createTask(page, "Picker back task", true);
  await openTools(page);
  await page.getByRole("link", { name: "Open Focus Mode" }).click();
  await page
    .getByRole("button", { name: "Start focus on Picker back task" })
    .click();
  await expect(page).toHaveURL(/from=tools/);
  await expectFocusOn(page, "Picker back task");

  await goBackToOrigin(page, "Focus Mode", /\/tools\/focus$/);
  await expect(recoveryCard(page).getByText("Picker back task")).toBeVisible();
});

test("a directly opened Focus screen still has a back button", async ({
  page,
}) => {
  await openTaskList(page);
  await createTask(page, "Direct back task");
  await startFocusFromDetails(page, "Direct back task");

  await page.reload();
  await expectFocusOn(page, "Direct back task");

  await goBackToTasks(page);
  await expect(recoveryCard(page).getByText("Direct back task")).toBeVisible();
});
