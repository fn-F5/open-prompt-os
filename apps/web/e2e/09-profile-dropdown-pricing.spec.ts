import { cleanupUser, expect, resetQuota, signInViaAuthDialog, test } from "./fixtures.js";

test.describe("09 - Logged-In User Profile Dropdown & Pricing Navigation @full", () => {
  const email = `e2e.pricing.menu.${Date.now()}@example.com`;

  test.beforeEach(async ({ request }) => {
    await resetQuota(request);
  });

  test.afterEach(async ({ request }) => {
    await cleanupUser(request, email);
  });

  test("navigates to Pricing cards and Profile from the authenticated user profile dropdown", async ({
    page,
    request,
  }) => {
    await page.goto("/");
    await signInViaAuthDialog(page, request, email);

    // Open user profile dropdown in AppNavbar and navigate to Plans & Pricing
    const profileTrigger = page.locator("header button[aria-haspopup='menu']");
    await expect(profileTrigger).toBeVisible({ timeout: 10_000 });
    await profileTrigger.click();

    const pricingMenuItem = page.getByRole("menuitem", { name: /Plans & Pricing/i });
    await expect(pricingMenuItem).toBeVisible();
    await pricingMenuItem.click();

    await expect(page).toHaveURL(/\/pricing$/);
    await expect(
      page.getByRole("heading", { name: /Plans for individuals and teams/i }),
    ).toBeVisible({ timeout: 10_000 });

    // Re-open dropdown and navigate to Profile
    await profileTrigger.click();
    const profileMenuItem = page.getByRole("menuitem", { name: /^Profile$/i });
    await expect(profileMenuItem).toBeVisible();
    await profileMenuItem.click();

    await expect(page).toHaveURL(/\/settings\/profile$/);
    await expect(page.getByText(/Workspace Plan & Quota/i)).toBeVisible({ timeout: 10_000 });
  });
});
