import { cleanupUser, expect, resetQuota, signInViaAuthDialog, test } from "./fixtures.js";

test.describe("10 - Video 30s Trim Enforcement & Graceful Error Recovery @full", () => {
  const email = `e2e.trim.${Date.now()}@example.com`;

  test.beforeEach(async ({ request }) => {
    await resetQuota(request);
  });

  test.afterEach(async ({ request }) => {
    await cleanupUser(request, email);
  });

  test("enforces sliding 30s trim window clamping, rejects inverted ranges, sends exact trim offsets, and recovers cleanly from SSE errors", async ({
    page,
    request,
  }) => {
    await page.goto("/");
    await signInViaAuthDialog(page, request, email);
    await page.getByRole("tab", { name: "Video", exact: true }).click();
    await page.getByRole("tab", { name: "YouTube Link" }).click();

    const urlInput = page.getByLabel("Public YouTube / Shorts URL");
    const startInput = page.getByLabel("Start (sec)");
    const endInput = page.getByLabel("End (sec)");
    const submitBtn = page.getByRole("button", { name: /Reverse Engineer Video/i });

    // 1. UI allows sliding start offsets and clamps End to Start + 30s (e.g. 45 -> max 75)
    await startInput.fill("45");
    await expect(startInput).toHaveValue("45");
    await endInput.fill("99");
    await expect(endInput).toHaveValue("75");

    // Shorter clip window beyond 30s (e.g. 40 -> 46) works cleanly without premature clamping
    await startInput.fill("40");
    await expect(startInput).toHaveValue("40");
    await endInput.fill("46");
    await expect(endInput).toHaveValue("46");

    // 2. Inverted range (Start >= End) is blocked with a clear validation alert
    await urlInput.fill("https://www.youtube.com/watch?v=jNQXAC9IVRw");
    await startInput.fill("20");
    await endInput.fill("10");
    await submitBtn.click();
    await expect(page.getByRole("alert")).toContainText(
      /End time must be greater than start time/i,
    );

    // 3. Valid trimmed window (5s -> 18s) sends exact offsets to the real SSE endpoint
    await startInput.fill("5");
    await endInput.fill("18");

    let capturedBody: { startOffsetSec?: number; endOffsetSec?: number } | null = null;
    const reqPromise = page.waitForRequest(
      (req) =>
        req.url().includes("/api/prompts/reverse-engineer-video/stream") && req.method() === "POST",
    );
    const resPromise = page.waitForResponse(
      (res) =>
        res.url().includes("/api/prompts/reverse-engineer-video/stream") && res.status() === 200,
    );

    await submitBtn.click();
    const req = await reqPromise;
    capturedBody = req.postDataJSON() as { startOffsetSec?: number; endOffsetSec?: number };
    await resPromise;

    expect(capturedBody?.startOffsetSec).toBe(5);
    expect(capturedBody?.endOffsetSec).toBe(18);
    await expect(page.getByText(/Shot-by-Shot Storyboard/i)).toBeVisible({ timeout: 10_000 });

    // 4. Graceful SSE error recovery: simulated server SSE error shows friendly alert without crashing
    //    and a subsequent retry succeeds cleanly
    await page.route("**/api/prompts/reverse-engineer-video/stream", async (route) => {
      await route.fulfill({
        status: 200,
        headers: { "content-type": "text/event-stream; charset=utf-8" },
        body: 'event: error\ndata: {"code":"PROVIDER_UNAVAILABLE","message":"The AI provider is temporarily busy. Please try again in a moment."}\n\n',
      });
    });

    await submitBtn.click();
    await expect(page.getByRole("alert")).toContainText(/temporarily busy/i, { timeout: 10_000 });

    // Unroute and verify clean recovery on retry
    await page.unroute("**/api/prompts/reverse-engineer-video/stream");
    const retryPromise = page.waitForResponse(
      (res) =>
        res.url().includes("/api/prompts/reverse-engineer-video/stream") && res.status() === 200,
    );
    await submitBtn.click();
    await retryPromise;
    await expect(page.getByText(/Continuity Bible/i)).toBeVisible({ timeout: 10_000 });
  });
});
