import { chromium } from '@playwright/test';
const BASE = 'http://localhost:3001';
const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await page.fill('input[type="email"]', 'dev@chowdeck.com');
await page.fill('input[type="password"]', 'password123');
await page.click('button[type="submit"]');
await page.waitForURL('**/dashboard**', { timeout: 20000 }).catch(() => {});
await page.waitForTimeout(2500);

async function dump(path, label, ms = 2500) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(ms);
  // strip the sidebar nav to focus on main content
  const txt = await page.evaluate(() => {
    const main = document.querySelector('main') || document.body;
    return (main.innerText || '').replace(/\s+/g, ' ');
  });
  console.log(`\n### ${label}\n${txt.slice(0, 700)}`);
}
await dump('/dashboard', 'Overview');
await dump('/dashboard/calls', 'Calls (expect 7 records)');
await dump('/dashboard/numbers', 'Numbers (expect 1 number)');
await dump('/dashboard/analytics', 'Analytics');
await dump('/dashboard/billing', 'Billing');
await dump('/dashboard/sessions/7c24ee2f-f98e-4c15-bda3-f67ffb5e9e6b', 'Session Detail 7c24ee2f (7 calls)', 3000);
await browser.close();
console.log('\nDONE');
