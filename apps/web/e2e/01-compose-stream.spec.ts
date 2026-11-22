import { expect, resetQuota, test } from "./fixtures.js";

test.describe("01 - Guest Compose SSE & Quality Guard @smoke", () => {
  test.beforeEach(async ({ request }) => {
    await resetQuota(request);
  });

  test("rejects low-signal greeting via quality guard and streams a valid compiled prompt", async ({
    page,
  }) => {
    await page.goto("/");

    const rawInput = page.getByRole("textbox").first();
    await expect(rawInput).toBeVisible();

    // 1. Pre-LLM quality guard rejects greetings before hitting the orchestrator
    await rawInput.fill("hi");
    const compileBtn = page.getByRole("button", { name: "Compile structured prompt" });
    await compileBtn.click();
    await expect(page.getByRole("alert")).toContainText(/describe|task|Hey there/i);

    // 2. Valid prompt streams over SSE from real API -> renders compiled output
    const streamResponsePromise = page.waitForResponse(
      (res) => res.url().includes("/api/prompts/compose/stream") && res.status() === 200,
    );
    await rawInput.fill(
      "Design a zero-downtime PostgreSQL migration runbook with rollback checkpoints for [Service_Name]",
    );
    await compileBtn.click();

    const streamRes = await streamResponsePromise;
    expect(streamRes.headers()["content-type"]).toContain("text/event-stream");

    await expect(page.getByText(/Service_Name/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: /Copy/i }).first()).toBeVisible();
  });
});
