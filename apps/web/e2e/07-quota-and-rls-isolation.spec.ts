import { cleanupUser, expect, resetQuota, signInViaAuthDialog, test } from "./fixtures.js";

test.describe("07 - Quota Enforcement & PostgreSQL RLS Tenant Isolation @full", () => {
  const emailA = `e2e.rls.a.${Date.now()}@example.com`;
  const emailB = `e2e.rls.b.${Date.now()}@example.com`;

  test.beforeEach(async ({ request }) => {
    await resetQuota(request);
  });

  test.afterEach(async ({ request }) => {
    await cleanupUser(request, emailA);
    await cleanupUser(request, emailB);
  });

  test("gates unauthenticated reverse_engineer behind sign-in and isolates private libraries across spaces via RLS", async ({
    browser,
    page,
    request,
  }) => {
    // 1. Unauthenticated Reverse Engineer prompts the user to sign in via AuthDialog
    await page.goto("/");
    await page.getByRole("tab", { name: "Video", exact: true }).click();
    await page.getByRole("tab", { name: "YouTube Link" }).click();
    await page
      .getByLabel("Public YouTube / Shorts URL")
      .fill("https://www.youtube.com/watch?v=jNQXAC9IVRw");

    await page.getByRole("button", { name: /Reverse Engineer Video/i }).click();
    await expect(page.getByRole("dialog")).toContainText(/Sign in to continue/i, {
      timeout: 10_000,
    });

    // 2. RLS Tenant Isolation: Space A saves a secret prompt; Space B cannot see it
    await resetQuota(request);
    const secretMarker = `RLS_SECRET_${Date.now()}`;

    const ctxA = await browser.newContext();
    const pageA = await ctxA.newPage();
    await pageA.goto("/compile");
    await signInViaAuthDialog(pageA, request, emailA);
    await pageA.getByRole("textbox").first().fill(`Draft confidential policy for ${secretMarker}`);
    await pageA.getByRole("button", { name: "Compile structured prompt" }).click();
    await expect(pageA.getByRole("button", { name: /Save to Library/i })).toBeVisible({
      timeout: 10_000,
    });
    await pageA.getByRole("button", { name: /Save to Library/i }).click();
    await expect(pageA.getByRole("button", { name: /^Saved to Library$/i })).toBeVisible({
      timeout: 10_000,
    });
    await ctxA.close();

    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();
    await pageB.goto("/");
    await signInViaAuthDialog(pageB, request, emailB);
    await pageB.goto("/library");
    await expect(pageB.getByLabel("Search saved prompts")).toBeVisible();
    await expect(pageB.getByText(secretMarker)).toHaveCount(0);

    await pageB.goto("/history");
    await expect(pageB.getByText(secretMarker)).toHaveCount(0);
    await ctxB.close();
  });
});
