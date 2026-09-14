import { expect, test } from "@playwright/test";

test("landing communicates Zeus without fake proof", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Your AI team/i })).toBeVisible();
  await expect(page.getByText("Five specialists. One workspace.")).toBeVisible();
  for (const name of ["Jorge", "Kai", "Lora", "Simon", "Sara"])
    await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/customer logos|trusted by|10,000/i)).toHaveCount(0);
});

test("landing remains usable on the iPad viewport", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Start with Zeus" })).toBeVisible();
  await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
});
