import {
  FIXTURE_VIDEO_PATH,
  cleanupUser,
  expect,
  resetQuota,
  signInViaAuthDialog,
  test,
} from "./fixtures.js";

test.describe("03 - Video Reverse Engineer (UI Stability, YouTube & MP4 Upload) @smoke", () => {
  const email = `e2e.re.video.${Date.now()}@example.com`;

  test.beforeEach(async ({ request }) => {
    await resetQuota(request);
  });

  test.afterEach(async ({ request }) => {
    await cleanupUser(request, email);
  });

  test("keeps header switcher stable across Image/Video, validates links, analyzes video, and hands off to Composer", async ({
    page,
    request,
  }) => {
    await page.goto("/");
    await signInViaAuthDialog(page, request, email);

    // 1. Verify [Image | Video] header switcher does NOT shift horizontally on toggle
    const sourceTablist = page.getByRole("tablist", { name: "Source media type" });
    await expect(sourceTablist).toBeVisible();
    const imageModeBox = await sourceTablist.boundingBox();
    expect(imageModeBox).not.toBeNull();

    await sourceTablist.getByRole("tab", { name: "Video" }).click();
    const videoModeBox = await sourceTablist.boundingBox();
    expect(videoModeBox).not.toBeNull();
    expect(Math.abs((imageModeBox?.x ?? 0) - (videoModeBox?.x ?? 0))).toBeLessThanOrEqual(2);

    // 2. Social link guidance (TikTok -> download MP4 message)
    await page.getByRole("tab", { name: "YouTube Link" }).click();
    const urlInput = page.getByLabel("Public YouTube / Shorts URL");
    await urlInput.fill("https://www.tiktok.com/@creator/video/123456");
    await page.getByRole("button", { name: /Reverse Engineer Video/i }).click();
    await expect(page.getByRole("alert")).toContainText(/Download the clip as an MP4/i);

    // 3. Valid YouTube URL -> real SSE stream -> Continuity Bible + Shots + Detailed Master Prompt
    const ssePromise = page.waitForResponse(
      (res) =>
        res.url().includes("/api/prompts/reverse-engineer-video/stream") && res.status() === 200,
    );
    await urlInput.fill("https://www.youtube.com/watch?v=jNQXAC9IVRw");
    await page.getByRole("button", { name: /Reverse Engineer Video/i }).click();
    const sseRes = await ssePromise;
    expect(sseRes.headers()["content-type"]).toContain("text/event-stream");

    await expect(page.getByText(/Estimated timestamps/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Continuity Bible/i)).toBeVisible();
    await expect(page.getByText(/Shot-by-Shot Storyboard/i)).toBeVisible();
    await expect(page.getByText(/Shot 1 \(00:00/i)).toBeVisible();
    await expect(page.getByText(/Shot 2 \(00:/i)).toBeVisible();

    // Ensure no template boilerplate leaked into Master Video Prompt
    const masterText = await page
      .locator("section[aria-label='Video storyboard and reconstructed prompt'] pre")
      .innerText();
    expect(masterText).not.toContain("Role:");
    expect(masterText).not.toContain("[Primary_Subject]");

    // 4. Local MP4 multipart upload (reset guest quota first)
    await resetQuota(request, "reverse_engineer");
    await page.getByRole("tab", { name: "Upload Video" }).click();
    await page.getByLabel("Upload reference video").setInputFiles(FIXTURE_VIDEO_PATH);
    await expect(page.getByText("sample-2s.mp4")).toBeVisible();

    const uploadPromise = page.waitForResponse(
      (res) =>
        res.url().includes("/api/prompts/reverse-engineer-video/stream") && res.status() === 200,
    );
    await page.getByRole("button", { name: /Reverse Engineer Video/i }).click();
    await uploadPromise;
    await expect(page.getByText(/uploaded studio video clip/i)).toBeVisible({ timeout: 10_000 });

    // 5. Accept into Composer loads video mode with master prompt
    await page.getByRole("button", { name: /Accept into Composer/i }).click();
    await expect(page).toHaveURL(/\/compile$/);
    await expect(page.getByRole("textbox").first()).toHaveValue(/Shot 1 \(00:00/);
  });
});
