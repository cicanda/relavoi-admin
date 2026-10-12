import { chromium } from '@playwright/test';
const BASE = 'http://localhost:3001';
const pages = [
  ['/dashboard', 'Overview'],
  ['/dashboard/sessions', 'Sessions'],
  ['/dashboard/calls', 'Calls'],
  ['/dashboard/numbers', 'Numbers'],
  ['/dashboard/analytics', 'Analytics'],
  ['/dashboard/billing', 'Billing'],
  ['/dashboard/api-keys', 'API Keys'],
  ['/dashboard/webhooks', 'Webhooks'],
  ['/dashboard/sdk-docs', 'SDK Docs'],
  ['/dashboard/settings', 'Settings'],
];
const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();
const errs = [], fails = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 140)); });
page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message.slice(0, 140)));
page.on('response', (r) => { const u = r.url(); if (u.includes('/v1/') && r.status() >= 400) fails.push(`${r.status()} ${r.request().method()} ${u.replace(/https?:\/\/[^/]+/, '').slice(0, 80)}`); });
function drain(label) {
  const e = [...new Set(errs)], f = [...new Set(fails)];
  console.log(`\n### ${label}`);
  if (f.length) console.log('  4xx/5xx: ' + f.join(' | ')); else console.log('  4xx/5xx: none');
  if (e.length) console.log('  console: ' + e.join(' || ')); else console.log('  console: clean');
  errs.length = 0; fails.length = 0;
}
// login
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await page.fill('input[type="email"]', 'dev@chowdeck.com');
await page.fill('input[type="password"]', 'password123');
await page.click('button[type="submit"]');
await page.waitForURL('**/dashboard**', { timeout: 20000 }).catch(() => {});
await page.waitForTimeout(2500);
console.log('LOGIN ->', page.url());
drain('Login+Overview');
// Overview key content
try {
  const body = await page.locator('body').innerText();
  console.log('  Overview text snippet:', body.replace(/\s+/g, ' ').slice(0, 320));
} catch {}
for (const [path, label] of pages.slice(1)) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' }).catch((e) => errs.push('nav: ' + e.message));
  await page.waitForTimeout(2200);
  drain(label);
  try {
    const body = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    console.log('  text:', body.slice(0, 260));
  } catch {}
}
// Session detail for the session with real calls (7c24ee2f)
await page.goto(`${BASE}/dashboard/sessions/7c24ee2f-f98e-4c15-bda3-f67ffb5e9e6b`, { waitUntil: 'networkidle' }).catch(() => {});
await page.waitForTimeout(2500);
drain('Session Detail (7c24ee2f, 7 calls)');
try {
  const body = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  console.log('  text:', body.slice(0, 320));
} catch {}
await browser.close();
console.log('\nDONE');
