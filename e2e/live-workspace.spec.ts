import { expect, test } from "@playwright/test";

test.skip(process.env.ZEUS_E2E_LIVE !== "1", "Requires isolated Neon Auth and database.");

test("workspace views, selected plans and a persisted conversation survive reload", async ({
  page,
}) => {
  await page.goto("/auth/sign-up");
  await page.getByLabel("Name").fill("Zeus E2E");
  await page.getByLabel("Email").fill(`zeus-${crypto.randomUUID()}@example.test`);
  await page.getByLabel("Password").fill(`Zeus-${crypto.randomUUID()}-secure`);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/\/app/u);
  await page.getByPlaceholder("Launch Zeus").fill("E2E Workspace");
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page.getByRole("heading", { name: "E2E Workspace", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Plans", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Execution strategies" })).toBeVisible();
  for (const title of ["First plan", "Second plan"]) {
    await page.getByPlaceholder("Plan title").fill(title);
    await page.getByRole("button", { name: "Create plan", exact: true }).click();
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  }
  await page.getByRole("link", { name: /First plan/u }).click();
  await expect(page.getByRole("heading", { name: "First plan", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "First plan", exact: true })).toBeVisible();
  await page.getByRole("link", { name: /^Jorge/u }).first().click();
  await page
    .getByRole("textbox", { name: "Message", exact: true })
    .fill("Reply with exactly E2E_ACK and do not call a tool.");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("Reply with exactly E2E_ACK and do not call a tool.", { exact: true })).toBeVisible();
  await expect(page.getByText(/E2E_ACK/u).last()).toBeVisible({ timeout: 30_000 });
  await page.reload();
  await expect(page.getByText("Reply with exactly E2E_ACK and do not call a tool.", { exact: true })).toBeVisible();
  await expect(page.getByText(/E2E_ACK/u).last()).toBeVisible();
});
