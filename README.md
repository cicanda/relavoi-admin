# Relavoi Operator Console

Internal admin / NOC for the Relavoi platform. Operators manage tenants, the global proxy-number pool, CPaaS health, the DLQ, pricing tiers, and audit history.

## Stack

- Next.js 16 (App Router, Turbopack)
- React 19, TypeScript strict
- Tailwind v4 with a dark theme (page bg `ink-900`, chrome `ink-800`, cards `ink-800` with `ink-700` borders, signal-green accent)
- Zustand + persist for operator auth (legacy localStorage key `nmaas_admin_token`, kept for cross-rename continuity)
- TanStack React Query for data
- Recharts for charts; lucide-react for icons
- IBM Plex Sans + Plex Mono via `next/font/google`
- Playwright for E2E (6 tests covering login, navigation, tenant detail, quarantine/release)

## Setup

```bash
cp .env.local.example .env.local
npm install
npm run dev          # listens on http://localhost:3003
# open http://localhost:3003/login
```

Needs the [relavoi-backend](https://github.com/cicanda/relavoi-backend) at the URL in `NEXT_PUBLIC_ADMIN_API_URL` (default `http://localhost:3000/v1/admin`).

## Dev credentials

Run `npm run seed` in `relavoi-backend` first. Then log in with:

| Email | Password | Role |
|---|---|---|
| `admin@relavoi.com` | `admin123` | ROOT |

## Pages

| Route | Description |
|---|---|
| `/login` | Operator sign-in |
| `/console/overview` | 5 stat cards, active sessions table, top tenants list, system health strip |
| `/console/tenants` | Searchable/filterable tenants table; cursor pagination |
| `/console/tenants/[id]` | Detail — config (role-gated edits), usage, onboarding context, compliance (consent audit), recent sessions |
| `/console/numbers` | Global pool — stats, utilization gauge, numbers table with quarantine/release actions |
| `/console/sessions` | Cross-tenant sessions table |
| `/console/cpaas` | Provider cards with circuit-breaker state, force open/close (ROOT) |
| `/console/fleet` | API/Webhook/Worker/Postgres/Redis/Runtime infra cards |
| `/console/dlq` | DLQ depth banner, status filters, retry/abandon actions |
| `/console/pricing` | Per-tier editable price tables (ROOT) |
| `/console/audit` | Filterable audit log with JSON expand rows |
| `/console/operators` | ROOT-gated CRUD for operators; self-delete blocked |
| `/console/system` | Health checks, metrics link, feature flags + pod placeholders |

## Project layout

```
src/
  app/                  app router pages + layouts
  components/           shared UI (brand-mark, state-pill, stat-card, …)
  components/console/   sidebar, topbar, auth-guard
  lib/
    types.ts            Operator, Tenant, DlqEntry, PricingRow, …
    auth-store.ts       zustand+persist; key `nmaas_admin_token`
    api.ts              axios admin client + login/listTenants/quarantineNumber/etc
    format.ts           fmtRelative, fmtAbsolute, fmtNumber, fmtPercent, fmtCurrency
tests/e2e/              Playwright spec (6 tests)
```

## Design system

Same tokens as the tenant dashboard (ink/bone/paper/signal) but inverted —
the operator console uses an explicit dark theme with `ink-800` chrome to
distinguish it visually from the (light) tenant dashboard. The design
language lives at https://docs.relavoi.com/design.

## Build & deploy

```bash
npm run build
npm run start
```

Production deploys via the Vercel Git integration. Set `NEXT_PUBLIC_ADMIN_API_URL=https://api.relavoi.com/v1/admin` and `NEXT_PUBLIC_ENV_LABEL=ng-prod` (or per-environment label) in the project's environment variables. `.github/workflows/ci.yml` runs type-check + build on every push and a full Playwright E2E suite on PRs (boots the backend in service containers).

## E2E locally

```bash
npx playwright test          # boots npm run dev via webServer in playwright.config.ts
npx playwright test --ui     # debugger UI
```

## Related Repositories

- [relavoi-backend](https://github.com/cicanda/relavoi-backend) — API server
- [relavoi-dashboard](https://github.com/cicanda/relavoi-dashboard) — Tenant web dashboard
- [relavoi-android-sdk](https://github.com/cicanda/relavoi-android-sdk) — Android SDK
- [relavoi-ios-sdk](https://github.com/cicanda/relavoi-ios-sdk) — iOS SDK
- [relavoi-docs](https://github.com/cicanda/relavoi-docs) — Documentation site
- [relavoi-infra](https://github.com/cicanda/relavoi-infra) — Terraform infrastructure
