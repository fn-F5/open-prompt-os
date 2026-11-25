import { cleanupUser, expect, resetQuota, signInViaAuthDialog, test } from "./fixtures.js";

test.describe("02 - Real Better Auth OTP Sign-In & Guest Migration @smoke", () => {
  const email = `e2e.auth.${Date.now()}@example.com`;

  test.beforeEach(async ({ request }) => {
    await resetQuota(request);
  });

  test.afterEach(async ({ request }) => {
    await cleanupUser(request, email);
  });

  test("opens sign-in dialog on unauthenticated compile, completes email OTP sign-in, compiles, and persists session across reload", async ({
    page,
    request,
  }) => {
    await page.goto("/compile");

    const rawInput = page.getByRole("textbox").first();
    const compileBtn = page.getByRole("button", { name: "Compile structured prompt" });
    await rawInput.fill(
      "Write a production incident postmortem template for [Team_Name] engineers",
    );
    await compileBtn.click();

    // Unauthenticated compile opens AuthDialog automatically
    await expect(page.getByRole("dialog")).toContainText(/Sign in to continue/i);

    // Complete real Better Auth OTP sign-in
    await signInViaAuthDialog(page, request, email, { openButton: false });

    // Compile now succeeds as an authenticated user
    const streamResponsePromise = page.waitForResponse(
      (res) => res.url().includes("/api/prompts/compose/stream") && res.status() === 200,
    );
    await compileBtn.click();
    await streamResponsePromise;

    const saveBtn = page.getByRole("button", { name: /Save to Library/i });
    await expect(saveBtn).toBeVisible({ timeout: 10_000 });

    // Verify authenticated session persists across full browser reload
    await page.reload();
    await page.goto("/library");
    await expect(page.getByLabel("Search saved prompts")).toBeVisible({ timeout: 10_000 });
  });
});
