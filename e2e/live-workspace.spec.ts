import { expect, test } from "@playwright/test";

const live = process.env.ZEUS_E2E_LIVE === "1";
test.skip(!live, "Runs only against an isolated configured Preview/Neon environment.");

test("new user can persist a workspace, conversation, message and waiting run across reload", async ({
  page,
}) => {
  const unique = `zeus-e2e-${Date.now()}@example.com`;
  await page.goto("/auth/sign-up");
  await page.getByLabel("Name").fill("Zeus E2E");
  await page.getByLabel("Email").fill(unique);
  await page.getByLabel("Password").fill(`Zeus-${Date.now()}-secure`);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/\/app/u);
  await page.getByPlaceholder("Launch Zeus").fill("E2E Workspace");
  await page.getByRole("button", { name: "Create workspace" }).click();
  await page.getByRole("button", { name: /Kai/u }).click();
  await page
    .getByPlaceholder("Give Zeus real work…")
    .fill("Persist this task without faking an AI response.");
  await page
    .locator("form")
    .filter({ has: page.getByPlaceholder("Give Zeus real work…") })
    .getByRole("button")
    .click();
  await expect(page.getByText("AI provider not configured yet.")).toBeVisible();
  await expect(page.getByText("Waiting for AI provider")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Persist this task without faking an AI response.")).toBeVisible();
});
