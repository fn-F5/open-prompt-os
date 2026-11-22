import { expect, resetQuota, test } from "./fixtures.js";

test.describe("06 - Improve & Prompt Autopsy @full", () => {
  test.beforeEach(async ({ request }) => {
    await resetQuota(request);
  });

  test("runs Prompt Autopsy with failed output, renders diagnostics, and accepts optimized prompt into Composer", async ({
    page,
  }) => {
    await page.goto("/improve");

    // Switch to Prompt Autopsy tab if present
    const autopsyTab = page.getByRole("tab", { name: /Autopsy/i });
    if (await autopsyTab.isVisible()) {
      await autopsyTab.click();
    }

    await page
      .getByPlaceholder("Paste the prompt you want to optimize or diagnose...")
      .fill("Write migration steps for [Service_Name] API endpoints");

    const failedBox = page.getByPlaceholder(
      "Paste the bad response, hallucination, or broken format that the model produced...",
    );
    if (await failedBox.isVisible()) {
      await failedBox.fill("Call POST /v9/magic-sync to auto-migrate all tables.");
    }

    const refinePromise = page.waitForResponse(
      (res) => res.url().includes("/rpc/prompts/refine") && res.status() === 200,
    );
    await page.getByRole("button", { name: /Optimize Prompt|Run Autopsy/i }).click();
    await refinePromise;

    await expect(page.getByLabel("Diagnostic findings and optimized prompt")).toContainText(
      /Diagnostic|Findings|Optimized/i,
      { timeout: 10_000 },
    );

    const acceptBtn = page.getByRole("button", { name: /Accept into Composer/i });
    await expect(acceptBtn).toBeVisible();
    await acceptBtn.click();
    await expect(page).toHaveURL(/\/$/);
  });
});
