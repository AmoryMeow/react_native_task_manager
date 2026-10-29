import { expect, test, type Page } from "@playwright/test";

async function openTaskList(page: Page) {
  await page.goto("/");
  await expect(page.getByText("My Tasks", { exact: true })).toBeVisible();
  await expect(page.getByText("Loading tasks...")).toBeHidden();
}

async function createTodayTask(page: Page, title: string) {
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await page.getByPlaceholder("Add a small next step").fill(title);
  await page.getByRole("button", { name: "Add task" }).click();
  await expect(page.getByLabel(`Edit ${title}`)).toBeVisible();
}

async function openTools(page: Page) {
  await page.getByRole("tab", { name: "Tools tab" }).click();
  await expect(
    page.getByRole("link", { name: "Open Task Roulette" }),
  ).toBeVisible();
}

test("starts Focus Mode from a Roulette result and clears a completed result", async ({
  page,
}) => {
  await openTaskList(page);
  await createTodayTask(page, "Roulette first task");
  await createTodayTask(page, "Roulette second task");
  await openTools(page);
  await page.getByRole("link", { name: "Open Task Roulette" }).click();

  await expect(
    page.getByText("Ready to pick your next task?", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^Start focus on / }),
  ).toHaveCount(0);

  await page.getByRole("button", { name: "Spin Task Roulette" }).click();
  await expect(
    page.getByRole("button", { name: /^Start focus on / }),
  ).toHaveCount(0);

  const startFocus = page.getByRole("button", {
    name: /^Start focus on /,
  });
  await expect(startFocus).toBeVisible({ timeout: 5_000 });
  const accessibleName = await startFocus.getAttribute("aria-label");
  const selectedTitle = accessibleName?.replace("Start focus on ", "");

  expect(selectedTitle).toBeTruthy();
  await startFocus.click();

  await expect(page).toHaveURL(/\/focus\/[^?]+\?from=roulette$/);
  await expect(
    page.getByRole("heading", { name: selectedTitle! }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Complete task" }).click();
  await expect(page).toHaveURL(/\/tools\/roulette$/);
  await expect(
    page.getByText("Ready to pick your next task?", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^Start focus on / }),
  ).toHaveCount(0);
});

test("returns to Roulette when Focus Mode is opened through Task Details", async ({
  page,
}) => {
  await openTaskList(page);
  await createTodayTask(page, "Roulette details first");
  await createTodayTask(page, "Roulette details second");
  await openTools(page);
  await page.getByRole("link", { name: "Open Task Roulette" }).click();
  await page.getByRole("button", { name: "Spin Task Roulette" }).click();

  const startFocus = page.getByRole("button", {
    name: /^Start focus on /,
  });
  await expect(startFocus).toBeVisible({ timeout: 5_000 });
  const selectedTitle = (await startFocus.getAttribute("aria-label"))?.replace(
    "Start focus on ",
    "",
  );

  expect(selectedTitle).toBeTruthy();
  await page
    .getByRole("button", { name: `Open ${selectedTitle}` })
    .click();
  await expect(page).toHaveURL(/\/task\/[^?]+\?from=roulette$/);

  await page.getByRole("button", { name: "Start focus" }).click();
  await expect(page).toHaveURL(/\/focus\/[^?]+\?from=roulette$/);
  await expect(
    page.getByRole("heading", { name: selectedTitle! }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Exit focus" }).click();
  await expect(page).toHaveURL(/\/tools\/roulette$/);
  await expect(
    page.getByRole("button", { name: `Start focus on ${selectedTitle}` }),
  ).toBeVisible();
});

test("offers Focus Mode when Duel has only one task", async ({ page }) => {
  const title = "Only Duel task";

  await openTaskList(page);
  await createTodayTask(page, title);
  await openTools(page);
  await page.getByRole("link", { name: "Open Task Duel" }).click();

  await expect(
    page.getByText("Only one task available. No need to choose this time."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: `Start focus on ${title}` }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: `Open ${title}` }),
  ).toBeVisible();

  await page
    .getByRole("button", { name: `Start focus on ${title}` })
    .click();
  await expect(page).toHaveURL(/\/focus\/[^?]+\?from=duel$/);
  await expect(page.getByRole("heading", { name: title })).toBeVisible();

  await page.getByRole("button", { name: "Exit focus" }).click();
  await expect(page).toHaveURL(/\/tools\/duel$/);
  await expect(
    page.getByRole("button", { name: `Start focus on ${title}` }),
  ).toBeVisible();
});

test("starts Focus Mode with the task chosen in Duel", async ({ page }) => {
  const chosenTitle = "Chosen Duel task";

  await openTaskList(page);
  await createTodayTask(page, chosenTitle);
  await createTodayTask(page, "Other Duel task");
  await openTools(page);
  await page.getByRole("link", { name: "Open Task Duel" }).click();

  await page
    .getByRole("button", { name: `Choose ${chosenTitle}` })
    .click();
  await page
    .getByRole("button", { name: `Start focus on ${chosenTitle}` })
    .click();

  await expect(page).toHaveURL(/\/focus\/[^?]+\?from=duel$/);
  await expect(
    page.getByRole("heading", { name: chosenTitle }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Exit focus" }).click();
  await expect(page).toHaveURL(/\/tools\/duel$/);
  await expect(
    page.getByRole("button", { name: `Start focus on ${chosenTitle}` }),
  ).toBeVisible();
});

test("returns to Duel after completing a task opened through Task Details", async ({
  page,
}) => {
  const chosenTitle = "Duel details chosen";
  const remainingTitle = "Duel details remaining";

  await openTaskList(page);
  await createTodayTask(page, chosenTitle);
  await createTodayTask(page, remainingTitle);
  await openTools(page);
  await page.getByRole("link", { name: "Open Task Duel" }).click();
  await page
    .getByRole("button", { name: `Choose ${chosenTitle}` })
    .click();
  await page
    .getByRole("button", { name: `Open ${chosenTitle}` })
    .click();
  await expect(page).toHaveURL(/\/task\/[^?]+\?from=duel$/);

  await page.getByRole("button", { name: "Start focus" }).click();
  await expect(page).toHaveURL(/\/focus\/[^?]+\?from=duel$/);
  await page.getByRole("button", { name: "Complete task" }).click();

  await expect(page).toHaveURL(/\/tools\/duel$/);
  await expect(
    page.getByText("Only one task available. No need to choose this time."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: `Start focus on ${remainingTitle}` }),
  ).toBeVisible();
});

test("searches and starts Focus Mode from the Tools task picker", async ({
  page,
}) => {
  const title = "Tools Focus Task";

  await openTaskList(page);
  await createTodayTask(page, title);
  await openTools(page);
  await page.getByRole("link", { name: "Open Focus Mode" }).click();

  await expect(page).toHaveURL(/\/tools\/focus$/);
  await expect(
    page.getByRole("button", { name: `Start focus on ${title}` }),
  ).toBeVisible();

  const search = page.getByRole("textbox", { name: "Search focus tasks" });
  await search.fill("missing");
  await expect(
    page.getByText("No matching tasks", { exact: true }),
  ).toBeVisible();

  await search.fill("tools FOCUS");
  await page
    .getByRole("button", { name: `Start focus on ${title}` })
    .click();

  await expect(page).toHaveURL(/\/focus\/[^?]+\?from=tools$/);
  await expect(page.getByRole("heading", { name: title })).toBeVisible();

  await page.getByRole("button", { name: "Exit focus" }).click();
  await expect(page).toHaveURL(/\/tools\/focus$/);
  await expect(
    page.getByRole("button", { name: `Start focus on ${title}` }),
  ).toBeVisible();

  await page
    .getByRole("button", { name: `Start focus on ${title}` })
    .click();
  await page.getByRole("button", { name: "Complete task" }).click();

  await expect(page).toHaveURL(/\/tools\/focus$/);
  await expect(
    page.getByText("No tasks available", { exact: true }),
  ).toBeVisible();
});
