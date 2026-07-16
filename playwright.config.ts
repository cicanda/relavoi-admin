import { defineConfig, devices } from "@playwright/test";

/**
 * E2E config for the Relavoi operator console.
 *
 * Assumes:
 *   - Backend is up at http://localhost:8080/v1
 *   - Postgres + Redis are seeded (npm run seed in relavoi-backend)
 *
 * The admin dev server is started by Playwright via the `webServer` block.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false, // login flow shares localStorage across tests in serial mode
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,

  reporter: [["list"], ["html", { open: "never" }]],

  use: {
    baseURL: "http://localhost:3003",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    viewport: { width: 1440, height: 900 },
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: {
    command: "npm run dev",
    url: "http://localhost:3003/login",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
