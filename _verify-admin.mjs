import { chromium } from '@playwright/test';
const BASE = 'http://localhost:3003';
const TENANT = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const pages = [
  ['/console/overview', 'Overview'],
  ['/console/tenants', 'Tenants'],
  [`/console/tenants/${TENANT}`, 'Tenant Detail'],
  ['/console/numbers', 'Number Pool'],
  ['/console/sessions', 'Sessions'],
  ['/console/cpaas', 'CPaaS'],
  ['/console/fleet', 'Fleet'],
  ['/console/dlq', 'DLQ'],
  ['/console/pricing', 'Pricing'],
  ['/console/audit', 'Audit'],
  ['/console/operators', 'Operators'],
  ['/console/system', 'System'],
];
const b = await chromium.launch();
const p = await (await b.newContext()).newPage();
const errs = [], fails = [];
p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 130)); });
p.on('pageerror', e => errs.push('PAGEERR ' + e.message.slice(0, 130)));
p.on('response', r => { const u = r.url(); if (u.includes('/v1/admin/') && r.status() >= 400) fails.push(`${r.status()} ${r.request().method()} ${u.replace(/https?:\/\/[^/]+/, '').slice(0, 60)}`); });
await p.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await p.fill('input[type="email"]', 'admin@relavoi.com');
await p.fill('input[type="password"]', 'admin123');
await p.click('button[type="submit"]');
await p.waitForURL('**/console**', { timeout: 20000 }).catch(() => {});
await p.waitForTimeout(2500);
console.log('LOGIN ->', p.url());
for (const [path, label] of pages) {
  errs.length = 0; fails.length = 0;
  await p.goto(`${BASE}${path}`, { waitUntil: 'networkidle' }).catch(e => errs.push('nav ' + e.message));
  await p.waitForTimeout(2200);
  const f = [...new Set(fails)], e = [...new Set(errs)].filter(x => !/same key|unique .key./.test(x));
  let txt = '';
  try { txt = (await p.evaluate(() => (document.querySelector('main') || document.body).innerText)).replace(/\s+/g, ' '); } catch {}
  console.log(`\n### ${label}  [4xx:${f.length ? f.join(',') : 'none'}] [console:${e.length ? e.join('||') : 'clean'}]`);
  console.log('  ' + txt.slice(0, 300));
}
await b.close();
console.log('\nDONE');
