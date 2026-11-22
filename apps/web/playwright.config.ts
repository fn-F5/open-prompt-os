import { defineConfig, devices } from "@playwright/test";

const isCI = Boolean(process.env.CI);
const apiPort = process.env.E2E_API_PORT ?? "3101";
const webPort = process.env.E2E_WEB_PORT ?? "5179";
const apiUrl = `http://localhost:${apiPort}`;
const webUrl = `http://localhost:${webPort}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "../../reports/playwright-report" }],
  ],
  outputDir: "../../reports/playwright-results",
  use: {
    baseURL: webUrl,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      testMatch: /0\d-.*\.spec\.ts$/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "layout-audit",
      testMatch: /resolution-audit\.spec\.ts$/,
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: `NODE_ENV=test E2E_TEST_MODE=1 PORT=${apiPort} BETTER_AUTH_URL=${apiUrl} WEB_ORIGINS=${webUrl} PASSKEY_ORIGIN=${webUrl} pnpm --filter @open-prompt-os/api start`,
      url: `${apiUrl}/healthz`,
      reuseExistingServer: !isCI,
      timeout: 60_000,
    },
    {
      command: `VITE_API_URL=${apiUrl} VITE_TURNSTILE_SITE_KEY="" pnpm dev --port ${webPort} --strictPort`,
      url: webUrl,
      reuseExistingServer: !isCI,
      timeout: 60_000,
    },
  ],
});
