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
  await expect(page.getByLabel(/^Focus time/)).toBeVisible();
}

function recoveryCard(page: Page) {
  return page.getByLabel("Unfinished focus session");
}

function toSeconds(text: string | null) {
  const [hours, minutes, seconds] = (text ?? "").split(":").map(Number);
  return hours * 3600 + minutes * 60 + seconds;
}

async function cardSeconds(page: Page) {
  return toSeconds(
    await page.getByLabel(/^Recovered focus time/).textContent(),
  );
}

test("no recovery card without an unfinished session", async ({ page }) => {
  await openTaskList(page);
  await createTask(page, "Plain task");

  await expect(recoveryCard(page)).toBeHidden();
});

test("recovers an active session after reopening and resumes it", async ({
  page,
}) => {
  await openTaskList(page);
  await createTask(page, "Recover active task");
  await startFocus(page, "Recover active task");
  const focusUrl = page.url();
  await expect
    .poll(async () =>
      toSeconds(await page.getByLabel(/^Focus time/).textContent()),
    )
    .toBeGreaterThanOrEqual(2);

  await openTaskList(page);

  const card = recoveryCard(page);
  await expect(card).toBeVisible();
  await expect(card.getByText("Recover active task")).toBeVisible();
  await expect(card.getByText("Active", { exact: true })).toBeVisible();
  await expect(card.getByText(/^Started /)).toBeVisible();
  await expect.poll(() => cardSeconds(page)).toBeGreaterThanOrEqual(2);
  const beforeResume = await cardSeconds(page);

  await card
    .getByRole("button", { name: "Resume focus on Recover active task" })
    .click();

  await expect(page).toHaveURL(focusUrl);
  await expect(page.getByText("Another focus session is open")).toBeHidden();
  expect(
    toSeconds(await page.getByLabel(/^Focus time/).textContent()),
  ).toBeGreaterThanOrEqual(beforeResume);

  await page.getByRole("button", { name: "Exit focus" }).click();
  await expect(page.getByText("My Tasks", { exact: true })).toBeVisible();
  await expect(recoveryCard(page)).toBeHidden();
});

test("a paused session is recovered paused and stays paused", async ({
  page,
}) => {
  await openTaskList(page);
  await createTask(page, "Recover paused task");
  await startFocus(page, "Recover paused task");
  await page.getByRole("button", { name: "Pause focus" }).click();
  await expect(
    page.getByRole("button", { name: "Resume focus" }),
  ).toBeVisible();

  await openTaskList(page);

  const card = recoveryCard(page);
  await expect(card.getByText("Paused", { exact: true })).toBeVisible();
  const frozen = await cardSeconds(page);
  await page.waitForTimeout(1_500);
  expect(await cardSeconds(page)).toBe(frozen);

  await card.getByRole("button", { name: /^Resume focus on/ }).click();

  await expect(
    page.getByRole("button", { name: "Resume focus" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Pause focus" })).toHaveCount(
    0,
  );
});

test("End session keeps the task unfinished and unscheduled", async ({
  page,
}) => {
  await openTaskList(page);
  await createTask(page, "End recovered task");
  await startFocus(page, "End recovered task");

  await openTaskList(page);
  await recoveryCard(page)
    .getByRole("button", { name: "End session" })
    .dblclick();

  await expect(recoveryCard(page)).toBeHidden();
  await expect(
    page.getByRole("checkbox", { name: "Complete End recovered task" }),
  ).not.toBeChecked();
  await expect(page.getByText("Inbox", { exact: true }).first()).toBeVisible();

  await page.reload();
  await expect(page.getByText("My Tasks", { exact: true })).toBeVisible();
  await expect(recoveryCard(page)).toBeHidden();

  await startFocus(page, "End recovered task");
  expect(
    toSeconds(await page.getByLabel(/^Focus time/).textContent()),
  ).toBeLessThan(2);
});

test("a session for a deleted task can still be ended", async ({ page }) => {
  await openTaskList(page);
  await createTask(page, "Deleted focus task");
  await startFocus(page, "Deleted focus task");

  await openTaskList(page);
  await page.getByRole("button", { name: "Delete Deleted focus task" }).click();

  const card = recoveryCard(page);
  await expect(card.getByText("Unavailable task")).toBeVisible();
  await expect(card.getByText(/no longer available/)).toBeVisible();
  await expect(card.getByRole("button", { name: /^Resume focus/ })).toHaveCount(
    0,
  );

  await card.getByRole("button", { name: "End session" }).click();
  await expect(recoveryCard(page)).toBeHidden();
});

test("a session left running for hours asks for a review before ending", async ({
  page,
}) => {
  await page.clock.install();
  await openTaskList(page);
  await createTask(page, "Forgotten focus task");
  await startFocus(page, "Forgotten focus task");

  await openTaskList(page);
  await expect(recoveryCard(page)).toBeVisible();
  await page.clock.fastForward("05:00:00");

  const card = recoveryCard(page);
  await expect(card.getByText(/running for over 4 hours/)).toBeVisible();
  await card.getByRole("button", { name: "Review and end session" }).click();

  await expect(card.getByLabel("Focus hours")).toHaveValue("5");
  await card.getByLabel("Focus minutes").fill("75");
  await card.getByRole("button", { name: "End with adjusted time" }).click();
  await expect(
    card.getByText("Minutes must be between 0 and 59."),
  ).toBeVisible();

  await card.getByLabel("Focus hours").fill("9");
  await card.getByLabel("Focus minutes").fill("0");
  await card.getByRole("button", { name: "End with adjusted time" }).click();
  await expect(
    card.getByText("Focus time can't be longer than the recorded time."),
  ).toBeVisible();

  await card.getByLabel("Focus hours").fill("1");
  await card.getByLabel("Focus minutes").fill("30");
  await card.getByRole("button", { name: "End with adjusted time" }).click();

  await expect(recoveryCard(page)).toBeHidden();
});
