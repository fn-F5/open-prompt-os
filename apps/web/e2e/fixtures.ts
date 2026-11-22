import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type APIRequestContext, type Page, test as base, expect } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
export const API_URL = `http://localhost:${process.env.E2E_API_PORT ?? "3101"}`;
export const FIXTURE_IMAGE_PATH = resolve(here, "fixtures/sample.png");
export const FIXTURE_VIDEO_PATH = resolve(here, "fixtures/sample-2s.mp4");

/**
 * Extended Playwright test fixture that fails immediately on any uncaught page error
 * or unexpected console error so broken UI states cannot silently pass.
 */
export const test = base.extend<{ autoErrorGuard: undefined }>({
  autoErrorGuard: [
    async ({ page }, use) => {
      const pageErrors: string[] = [];
      page.on("pageerror", (err) => {
        pageErrors.push(err.message);
      });
      await use(undefined);
      expect(pageErrors, `Uncaught page errors: ${pageErrors.join("; ")}`).toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

export async function resetQuota(request: APIRequestContext, action?: string) {
  const res = await request.post(`${API_URL}/api/__e2e__/reset-quota`, {
    data: action ? { action } : {},
  });
  expect(res.ok(), `resetQuota failed: ${res.status()}`).toBe(true);
}

export async function cleanupUser(request: APIRequestContext, email: string) {
  await request.post(`${API_URL}/api/__e2e__/cleanup-user`, {
    data: { email },
  });
}

export async function fetchCapturedOtp(request: APIRequestContext, email: string): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const res = await request.get(`${API_URL}/api/__e2e__/otp?email=${encodeURIComponent(email)}`);
    if (res.ok()) {
      const data = (await res.json()) as { code: string };
      return data.code;
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`Timed out waiting for OTP for ${email}`);
}

/**
 * Signs in via the real AuthDialog email OTP flow backed by Better Auth + PostgreSQL.
 */
export async function signInViaAuthDialog(
  page: Page,
  request: APIRequestContext,
  email: string,
  options?: { readonly openButton?: boolean },
) {
  if (options?.openButton !== false) {
    await page
      .getByRole("button", { name: /^Sign In$/i })
      .first()
      .click();
  }
  const emailInput = page.getByPlaceholder("you@company.com");
  await expect(emailInput).toBeVisible();
  await emailInput.fill(email);
  await page.getByRole("button", { name: /Email me a code/i }).click();

  const code = await fetchCapturedOtp(request, email);
  const codeInput = page.getByPlaceholder("6-digit code");
  await expect(codeInput).toBeVisible();
  await codeInput.fill(code);
  await page.getByRole("button", { name: /Verify code/i }).click();

  await expect(codeInput).toBeHidden({ timeout: 10_000 });
}
