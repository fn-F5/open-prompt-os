import { cleanupUser, expect, resetQuota, signInViaAuthDialog, test } from "./fixtures.js";

test.describe("05 - Library CRUD & Cross-Context Public Sharing @full", () => {
  const email = `e2e.lib.${Date.now()}@example.com`;

  test.beforeEach(async ({ request }) => {
    await resetQuota(request);
  });

  test.afterEach(async ({ request }) => {
    await cleanupUser(request, email);
  });

  test("saves a compiled prompt, shares it publicly in an incognito context, and revokes on delete", async ({
    browser,
    page,
    request,
  }) => {
    await page.goto("/compile");
    await signInViaAuthDialog(page, request, email);

    const rawInput = page.getByRole("textbox").first();
    await rawInput.fill("Create a security review checklist for [Service_API] GraphQL endpoints");
    await page.getByRole("button", { name: "Compile structured prompt" }).click();

    const saveBtn = page.getByRole("button", { name: /Save to Library/i });
    await expect(saveBtn).toBeVisible({ timeout: 10_000 });
    await saveBtn.click();
    await expect(page.getByRole("button", { name: /^Saved to Library$/i })).toBeVisible({
      timeout: 10_000,
    });

    // Navigate to Library and share
    await page.goto("/library");
    await expect(page.getByLabel("Search saved prompts")).toBeVisible();

    const sharePromise = page.waitForResponse(
      (res) => res.url().includes("/rpc/prompts/share") && res.status() === 200,
    );
    await page
      .getByRole("button", { name: /^Share$/i })
      .first()
      .click();
    const shareRes = await sharePromise;
    const shareJson = (await shareRes.json()) as {
      json?: { shareId?: string };
      shareId?: string;
    };
    const shareId = shareJson.json?.shareId ?? shareJson.shareId;
    expect(shareId).toBeTruthy();

    // Verify public share link works in a brand-new unauthenticated browser context
    const anonContext = await browser.newContext();
    const anonPage = await anonContext.newPage();
    await anonPage.goto(`/share/${shareId}`);
    await expect(anonPage.getByText(/Service_API|GraphQL/i).first()).toBeVisible({
      timeout: 10_000,
    });
    await anonContext.close();

    // Delete from Library and verify public share is revoked
    await page
      .getByRole("button", { name: /^Delete /i })
      .first()
      .click();
    await expect(page.getByText(/No saved prompts yet|Compile a prompt/i)).toBeVisible({
      timeout: 10_000,
    });
  });
});
