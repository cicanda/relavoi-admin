import { test, expect } from "@playwright/test";

const ADMIN_EMAIL = "admin@relavoi.com";
const ADMIN_PASSWORD = "admin123";

// Seeded dev tenant from relavoi-backend/src/seeds/dev-seed.ts.
const TENANT_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const TENANT_NAME = "Chowdeck";

test.describe("Relavoi operator console — E2E", () => {
  test.beforeEach(async ({ context }) => {
    // Wipe persisted auth so each test starts unauthenticated.
    await context.clearCookies();
    await context.clearPermissions();
  });

  // ─── auth flow ─────────────────────────────────────────────────────────
  test("login → overview redirect", async ({ page }) => {
    await page.goto("/login");
    await expect(page).toHaveURL(/\/login$/);

    // Brand mark + heading visible (and the heading "Relavoi" is present)
    await expect(page.getByRole("heading", { name: /Relavoi/i })).toBeVisible();
    await expect(page.getByText(/Operator Console/i)).toBeVisible();

    await page.locator('input[name="email"]').fill(ADMIN_EMAIL);
    await page.locator('input[name="password"]').fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();

    // Redirected into the console.
    await page.waitForURL("**/console/overview", { timeout: 10_000 });

    // Sidebar rendered with the operator name + ROOT badge
    await expect(page.getByText(/Olu Kalubridge|admin@relavoi/i).first()).toBeVisible();
    await expect(page.getByText(/ROOT/).first()).toBeVisible();
  });

  test("rejects wrong password with an inline error", async ({ page }) => {
    await page.goto("/login");
    await page.locator('input[name="email"]').fill(ADMIN_EMAIL);
    await page.locator('input[name="password"]').fill("definitely-wrong-password");
    await page.getByRole("button", { name: /sign in/i }).click();

    // The error banner is rendered with role="alert" — explicit, reliable.
    const errorBanner = page.getByRole("alert");
    await expect(errorBanner).toBeVisible({ timeout: 5_000 });
    // Still on /login (no redirect)
    await expect(page).toHaveURL(/\/login$/);
  });

  // ─── styling check: sidebar has a different bg from page ───────────────
  test("sidebar is visually distinct from the page background", async ({ page }) => {
    await loginAsRoot(page);

    // Sidebar and main content should have different background colors
    // after the styling fix (sidebar ink-800 vs page ink-900).
    const sidebar = page.locator("aside").first();
    const main = page.locator("main").first();

    await expect(sidebar).toBeVisible();
    await expect(main).toBeVisible();

    const sidebarBg = await sidebar.evaluate((el) => getComputedStyle(el).backgroundColor);
    const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);

    // Sidebar should not be the same color as the body — that was the bug.
    expect(sidebarBg).not.toBe(bodyBg);
    // Should resolve to a real rgb() value (not "transparent" or empty)
    expect(sidebarBg).toMatch(/^rgb/);
  });

  // ─── navigation ───────────────────────────────────────────────────────
  test("can navigate to all primary console pages", async ({ page }) => {
    await loginAsRoot(page);

    const pages = [
      { label: "Tenants", url: /\/console\/tenants$/ },
      { label: "Number Pool", url: /\/console\/numbers$/ },
      { label: "Sessions", url: /\/console\/sessions$/ },
      { label: "CPaaS", url: /\/console\/cpaas$/ },
      { label: "Fleet", url: /\/console\/fleet$/ },
      { label: "DLQ & Retries", url: /\/console\/dlq$/ },
      { label: "Pricing & Plans", url: /\/console\/pricing$/ },
      { label: "Audit Log", url: /\/console\/audit$/ },
      { label: "Operators", url: /\/console\/operators$/ },
      { label: "System", url: /\/console\/system$/ },
    ];

    for (const target of pages) {
      await page.getByRole("link", { name: new RegExp(`^${target.label}$`) }).click();
      await page.waitForURL(target.url, { timeout: 8_000 });
      // page rendered (sidebar still visible — confirms layout didn't crash)
      await expect(page.locator("aside").first()).toBeVisible();
    }
  });

  // ─── tenants list → detail ─────────────────────────────────────────────
  test("tenant detail page renders Chowdeck", async ({ page }) => {
    await loginAsRoot(page);
    await page.goto("/console/tenants");

    // The seeded Chowdeck tenant appears in the list.
    await expect(page.getByText(TENANT_NAME).first()).toBeVisible({ timeout: 8_000 });

    // Navigate to detail by visiting the URL directly (clicking the row can be
    // fragile to UI changes; the URL contract is the API).
    await page.goto(`/console/tenants/${TENANT_ID}`);
    await expect(page.getByRole("heading", { name: TENANT_NAME })).toBeVisible({ timeout: 8_000 });

    // The compliance card lists 3 consent rows (ToS, NDPR DPA, NCC Type Approval).
    await expect(page.getByText(/Terms of Service/i)).toBeVisible();
    await expect(page.getByText(/NDPR DPA/i)).toBeVisible();
    await expect(page.getByText(/NCC Type Approval/i)).toBeVisible();
  });

  // ─── number-pool admin action — quarantine + release (smoke) ───────────
  test("quarantine then release a proxy number via the API directly", async ({ request }) => {
    // Mint an operator JWT through the backend, then exercise the two endpoints.
    const loginRes = await request.post("http://localhost:8080/v1/admin/auth/login", {
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });
    expect(loginRes.ok()).toBe(true);
    const { accessToken } = (await loginRes.json()) as { accessToken: string };
    const headers = { Authorization: `Bearer ${accessToken}` };

    const number = "+2348000000010"; // last seeded dev number

    // Quarantine
    const q = await request.post("http://localhost:8080/v1/admin/pool/quarantine", {
      data: { number, reason: "E2E smoke test" },
      headers,
    });
    expect(q.ok()).toBe(true);
    const qBody = (await q.json()) as { success: boolean; previousStatus: string };
    expect(qBody.success).toBe(true);
    expect(["AVAILABLE", "IN_USE", "COOLDOWN"]).toContain(qBody.previousStatus);

    // Release
    const r = await request.post("http://localhost:8080/v1/admin/pool/release", {
      data: { number },
      headers,
    });
    expect(r.ok()).toBe(true);
    const rBody = (await r.json()) as { success: boolean; number: string };
    expect(rBody.success).toBe(true);
    expect(rBody.number).toBe(number);
  });
});

async function loginAsRoot(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill(ADMIN_EMAIL);
  await page.locator('input[name="password"]').fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL("**/console/overview", { timeout: 10_000 });
}
