import { cleanupUser, expect, resetQuota, signInViaAuthDialog, test } from "./fixtures.js";

test.describe("02 - Real Better Auth OTP Sign-In & Guest Migration @smoke", () => {
  const email = `e2e.auth.${Date.now()}@example.com`;

  test.beforeEach(async ({ request }) => {
    await resetQuota(request);
  });

  test.afterEach(async ({ request }) => {
    await cleanupUser(request, email);
  });

  test("signs in via captured email OTP, migrates guest prompt, and persists session across reload", async ({
    page,
    request,
  }) => {
    await page.goto("/");

    const rawInput = page.getByRole("textbox").first();
    await rawInput.fill(
      "Write a production incident postmortem template for [Team_Name] engineers",
    );
    await page.getByRole("button", { name: "Compile structured prompt" }).click();

    // Wait for compiled output then click Save to Library (triggers AuthGate)
    const saveBtn = page.getByRole("button", { name: /Save to Library/i });
    await expect(saveBtn).toBeVisible({ timeout: 10_000 });
    await saveBtn.click();

    // AuthDialog opens automatically — complete real Better Auth OTP sign-in
    await signInViaAuthDialog(page, request, email, { openButton: false });

    // Verify authenticated session persists across full browser reload
    await page.reload();
    await page.goto("/library");
    await expect(page.getByLabel("Search saved prompts")).toBeVisible({ timeout: 10_000 });
  });
});
