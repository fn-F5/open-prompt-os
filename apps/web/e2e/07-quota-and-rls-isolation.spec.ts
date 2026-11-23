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

  test("enforces guest daily reverse_engineer quota and isolates private libraries across spaces via RLS", async ({
    browser,
    page,
    request,
  }) => {
    // 1. Guest runs Video Reverse Engineer once (1/day limit) -> second run returns QUOTA_EXCEEDED
    await page.goto("/reverse-engineer");
    await page.getByRole("tab", { name: "Video", exact: true }).click();
    await page.getByRole("tab", { name: "YouTube Link" }).click();
    await page
      .getByLabel("Public YouTube / Shorts URL")
      .fill("https://www.youtube.com/watch?v=jNQXAC9IVRw");

    await page.getByRole("button", { name: /Reverse Engineer Video/i }).click();
    await expect(page.getByText(/Estimated timestamps/i)).toBeVisible({ timeout: 10_000 });

    // Second run without resetting quota must be blocked by real Postgres usage_counters
    await page.getByRole("button", { name: /Reverse Engineer Video/i }).click();
    await expect(page.getByRole("dialog")).toContainText(/Daily Limit Reached/i, {
      timeout: 10_000,
    });

    // 2. RLS Tenant Isolation: Space A saves a secret prompt; Space B cannot see it
    await resetQuota(request);
    const secretMarker = `RLS_SECRET_${Date.now()}`;

    const ctxA = await browser.newContext();
    const pageA = await ctxA.newPage();
    await pageA.goto("/");
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
