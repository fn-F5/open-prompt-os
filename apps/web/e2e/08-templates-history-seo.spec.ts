import { API_URL, cleanupUser, expect, resetQuota, signInViaAuthDialog, test } from "./fixtures.js";

test.describe("08 - Templates, History & SEO Endpoints @full", () => {
  const email = `e2e.hist.${Date.now()}@example.com`;

  test.beforeEach(async ({ request }) => {
    await resetQuota(request);
  });

  test.afterEach(async ({ request }) => {
    await cleanupUser(request, email);
  });

  test("records video RE in History and serves sitemap.xml", async ({ page, request }) => {
    // 1. Docs hub loads cleanly
    await page.goto("/docs");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({
      timeout: 10_000,
    });

    // 2. Signed-in Video Reverse Engineer run appears in /history under Reverse Engineer filter
    await page.goto("/");
    await signInViaAuthDialog(page, request, email);
    await page.goto("/reverse-engineer");
    await page.getByRole("tab", { name: "Video", exact: true }).click();
    await page.getByRole("tab", { name: "YouTube Link" }).click();
    await page
      .getByLabel("Public YouTube / Shorts URL")
      .fill("https://www.youtube.com/watch?v=jNQXAC9IVRw");
    await page.getByRole("button", { name: /Reverse Engineer Video/i }).click();
    await expect(page.getByText(/Estimated timestamps/i)).toBeVisible({ timeout: 10_000 });

    await page.goto("/history");
    await page.getByRole("tab", { name: "Reverse Engineer" }).click();
    await expect(page.getByText(/espresso machine|Shot 1 \(00:00/i).first()).toBeVisible({
      timeout: 10_000,
    });

    // 3. SEO sitemap.xml returns 200 XML
    const sitemapRes = await request.get(`${API_URL}/api/seo/sitemap.xml`);
    expect(sitemapRes.status()).toBe(200);
    expect(await sitemapRes.text()).toContain("<urlset");
  });
});
