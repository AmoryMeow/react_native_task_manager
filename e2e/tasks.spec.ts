import { expect, test, type Page } from "@playwright/test";

async function openTaskList(page: Page) {
  await page.goto("/");
  await expect(page.getByText("My Tasks", { exact: true })).toBeVisible();
  await expect(page.getByText("Loading tasks...")).toBeHidden();

  await expect
    .poll(() => page.evaluate(() => globalThis.crossOriginIsolated))
    .toBe(true);
  expect(
    await page.evaluate(() => typeof globalThis.SharedArrayBuffer),
  ).toBe("function");
}

async function createTask(page: Page, title: string) {
  await page.getByPlaceholder("Add a small next step").fill(title);
  await page.getByRole("button", { name: "Add task" }).click();
  await expect(page.getByLabel(`Edit ${title}`)).toBeVisible();
}

async function openOnlyTask(page: Page) {
  await page.getByRole("button", { name: "Open task details" }).click();
  await expect(page.getByText("Task details", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Task title", { exact: true })).toBeVisible();
}

test("creates a task and persists it after reload", async ({ page }) => {
  const title = "E2E persistent task";

  await openTaskList(page);
  await createTask(page, title);
  await page.reload();

  await expect(page.getByText("My Tasks", { exact: true })).toBeVisible();
  await expect(page.getByLabel(`Edit ${title}`)).toBeVisible();
});

test("shows Task not found for a direct URL to a missing task", async ({
  page,
}) => {
  await openTaskList(page);
  await page.goto("/task/missing-task-id");

  await expect(page.getByText("Task details", { exact: true })).toBeVisible();
  await expect(page.getByText("Task not found")).toBeVisible();
  await expect(page.getByText("Couldn't load this task")).toBeHidden();

  await page.reload();
  await expect(page.getByText("Task not found")).toBeVisible();

  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByText("My Tasks", { exact: true })).toBeVisible();
});

test("saves an inline title edit before opening Task Details", async ({
  page,
}) => {
  const originalTitle = "E2E inline original";
  const editedTitle = "E2E inline edited";

  await openTaskList(page);
  await createTask(page, originalTitle);

  await page.getByLabel(`Edit ${originalTitle}`).click();
  await page.getByLabel("Task title", { exact: true }).fill(editedTitle);
  await page.getByRole("button", { name: "Open task details" }).click();

  await expect(page.getByText("Task details", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Task title", { exact: true })).toHaveValue(
    editedTitle,
  );

  await page.reload();
  await expect(page.getByLabel("Task title", { exact: true })).toHaveValue(
    editedTitle,
  );
});

test("stays on Tasks with the draft when the inline save fails before opening Task Details", async ({
  page,
}) => {
  const originalTitle = "E2E inline invalid";
  const retriedTitle = "E2E inline retried";

  await openTaskList(page);
  await createTask(page, originalTitle);

  await page.getByLabel(`Edit ${originalTitle}`).click();
  const titleInput = page.getByLabel("Task title", { exact: true });
  await titleInput.fill("   ");
  await page.getByRole("button", { name: "Open task details" }).click();

  await expect(page.getByText("Task title cannot be empty")).toBeVisible();
  await expect(page.getByText("My Tasks", { exact: true })).toBeVisible();
  await expect(page.getByText("Task details", { exact: true })).toBeHidden();
  await expect(titleInput).toHaveValue("   ");

  await titleInput.fill(retriedTitle);
  await page.getByRole("button", { name: "Open task details" }).click();

  await expect(page.getByText("Task details", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Task title", { exact: true })).toHaveValue(
    retriedTitle,
  );
});

test("persists title and description edits", async ({ page }) => {
  const originalTitle = "E2E editable task";
  const editedTitle = "E2E edited task";
  const description = "Description saved by the browser E2E test.";

  await openTaskList(page);
  await createTask(page, originalTitle);
  await openOnlyTask(page);

  await page.getByLabel("Task title", { exact: true }).fill(editedTitle);
  await page.getByLabel("Task description").fill(description);
  await page.getByRole("button", { name: "Done" }).click();

  await expect(page.getByText("My Tasks", { exact: true })).toBeVisible();
  await expect(page.getByLabel(`Edit ${editedTitle}`)).toBeVisible();

  await openOnlyTask(page);
  await expect(page.getByLabel("Task title", { exact: true })).toHaveValue(
    editedTitle,
  );
  await expect(page.getByLabel("Task description")).toHaveValue(description);

  await page.reload();
  await expect(page.getByText("Task details", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Task title", { exact: true })).toHaveValue(
    editedTitle,
  );
  await expect(page.getByLabel("Task description")).toHaveValue(description);
});

test("autosaves title and description while editing remains in Task Details", async ({
  page,
}) => {
  const originalTitle = "E2E autosave task";
  const editedTitle = "E2E autosaved title";
  const description = "Saved after the debounce delay.";

  await openTaskList(page);
  await createTask(page, originalTitle);
  await openOnlyTask(page);

  await page.getByLabel("Task title", { exact: true }).fill(editedTitle);
  await page.waitForTimeout(800);
  await page.reload();
  await expect(page.getByLabel("Task title", { exact: true })).toHaveValue(
    editedTitle,
  );

  await page.getByLabel("Task description").fill(description);
  await page.waitForTimeout(800);
  await page.reload();
  await expect(page.getByLabel("Task description")).toHaveValue(description);
});

test("opens Focus Mode, preserves edits, and completes the task", async ({
  page,
}) => {
  const originalTitle = "E2E focus task";
  const editedTitle = "E2E focused task";
  const description = "One thing at a time.";

  await openTaskList(page);
  await createTask(page, originalTitle);
  await openOnlyTask(page);

  await page.getByLabel("Task title", { exact: true }).fill(editedTitle);
  await page.getByLabel("Task description").fill(description);
  await page.getByRole("button", { name: "Start focus" }).click();

  await expect(page).toHaveURL(/\/focus\//);
  await expect(
    page.getByRole("heading", { name: editedTitle }),
  ).toBeVisible();
  await expect(page.getByText(description, { exact: true })).toBeVisible();

  await page.reload();
  await expect(
    page.getByRole("heading", { name: editedTitle }),
  ).toBeVisible();
  await expect(page.getByText(description, { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Exit focus" }).click();
  await expect(page.getByText("My Tasks", { exact: true })).toBeVisible();
  await expect(page.getByLabel(`Edit ${editedTitle}`)).toBeVisible();

  await openOnlyTask(page);
  await page.getByRole("button", { name: "Start focus" }).click();
  await page.getByRole("button", { name: "Complete task" }).click();

  await expect(page.getByText("My Tasks", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Expand Completed" }).click();
  await expect(page.getByRole("checkbox", { name: "✓" })).toBeVisible();
});

test("uses Tasks as the fallback for a direct Focus route with an invalid origin", async ({
  page,
}) => {
  const title = "E2E direct focus task";

  await openTaskList(page);
  await createTask(page, title);
  await openOnlyTask(page);

  const taskId = new URL(page.url()).pathname.split("/").at(-1);
  expect(taskId).toBeTruthy();

  await page.goto(`/focus/${taskId}?from=https%3A%2F%2Fexample.com`);
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await page.getByRole("button", { name: "Exit focus" }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText("My Tasks", { exact: true })).toBeVisible();
});

test("persists exact local schedule and deadline dates", async ({ page }) => {
  const title = "E2E dated task";
  const scheduleDate = "2030-06-15";
  const deadlineDate = "2030-06-20";

  await openTaskList(page);
  await createTask(page, title);
  await openOnlyTask(page);

  await page.getByRole("button", { name: /^Schedule,/ }).click();
  await page
    .getByRole("button", { name: "Choose a schedule date" })
    .click();
  await page.getByLabel("Schedule date", { exact: true }).fill(scheduleDate);
  await page.getByRole("button", { name: "Apply selected date" }).click();
  await expect(
    page.getByRole("button", { name: "Schedule, Jun 15, 2030" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Add deadline" }).click();
  await page.getByLabel("Deadline date", { exact: true }).fill(deadlineDate);
  await page.getByRole("button", { name: "Apply selected date" }).click();
  await expect(
    page.getByRole("button", { name: "Deadline, Jun 20, 2030" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByText("My Tasks", { exact: true })).toBeVisible();
  await openOnlyTask(page);

  await page.getByRole("button", { name: /^Schedule,/ }).click();
  await page
    .getByRole("button", { name: "Choose a schedule date" })
    .click();
  await expect(
    page.getByLabel("Schedule date", { exact: true }),
  ).toHaveValue(scheduleDate);
  await page.getByRole("button", { name: "Cancel date selection" }).click();

  await page.getByRole("button", { name: /^Deadline,/ }).click();
  await expect(
    page.getByLabel("Deadline date", { exact: true }),
  ).toHaveValue(deadlineDate);
  await page.getByRole("button", { name: "Cancel date selection" }).click();

  await page.reload();
  await expect(
    page.getByRole("button", { name: "Schedule, Jun 15, 2030" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Deadline, Jun 20, 2030" }),
  ).toBeVisible();
});
