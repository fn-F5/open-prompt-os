import { FIXTURE_IMAGE_PATH, expect, resetQuota, test } from "./fixtures.js";

test.describe("04 - Image Reverse Engineer Regression @smoke", () => {
  test.beforeEach(async ({ request }) => {
    await resetQuota(request);
  });

  test("uploads a reference image, toggles target modality, renders 6-axis breakdown, and loads Composer", async ({
    page,
  }) => {
    await page.goto("/reverse-engineer");

    // Target modality lives inside Image mode's left pane
    const targetTabs = page.getByRole("tablist", { name: "Target modality" });
    await expect(targetTabs).toBeVisible();
    await targetTabs.getByRole("tab", { name: "Image Prompt" }).click();

    await page.getByLabel("Upload reference image").setInputFiles(FIXTURE_IMAGE_PATH);
    await expect(page.getByAltText("sample.png")).toBeVisible();

    const rpcPromise = page.waitForResponse(
      (res) => res.url().includes("/rpc/prompts/reverseEngineer") && res.status() === 200,
    );
    await page.getByRole("button", { name: /Reverse Engineer Image/i }).click();
    await rpcPromise;

    await expect(page.getByText(/6-Axis Visual Breakdown/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Reconstructed Prompt/i)).toBeVisible();

    await page.getByRole("button", { name: /Accept into Composer/i }).click();
    await expect(page).toHaveURL(/\/$/);
  });
});
