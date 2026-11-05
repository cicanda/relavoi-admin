#!/usr/bin/env node
//
// vercel-ignore-build.mjs
//
// Vercel's Ignored Build Step. It decides whether this production build may go
// ahead, by asking the live backend which API contract version it is serving
// and comparing that with the minimum this repository declares in
// backend-contract.json.
//
// Why this exists
// ---------------
// The house rule is "backend before frontends". Vercel's Git integration
// deploys this repository on every push to main, within a minute, with no
// regard for what the backend is serving. On 5 November 2026 both frontends
// went live calling GET /v1/reference half an hour before the backend that
// answers it was deployed. Nothing broke, because the new dropdowns degrade to
// "Not set" on a 404, but the ordering rule was not being enforced by
// anything. This is the enforcement.
//
// The other half lives in relavoi-infra/scripts/deploy-staging.sh: once the
// backend deploy has proved the running api is the image it just built, it
// pokes this project's Vercel deploy hook, so a build that was told to wait
// runs as soon as the thing it was waiting for is serving. Without that poke a
// skipped build waits for the next push instead.
//
// EXIT CODES ARE INVERTED AND THIS IS THE WHOLE RISK IN THIS FILE
// ---------------------------------------------------------------
// Vercel's documented contract, which is the opposite of every other script on
// earth:
//
//   "If the command exits with code 1, the build continues as normal.
//    If the command exits with code 0, the build is immediately aborted,
//    and the deployment state is set to CANCELED."
//
// So exit 0 means SKIP and exit 1 means BUILD. Get it backwards and this file
// cancels every deployment of this project. Nothing below calls process.exit
// with a literal: it goes through runBuild() or skipBuild(), which are named
// for what they do rather than for the number they return.
//
// What it does NOT gate
// ---------------------
//   - Preview builds. A preview is for review and is never the production
//     surface, and blocking previews would stall a pull request over a backend
//     deploy that has nothing to do with it.
//   - Any build where this repository declares nothing, or declares something
//     unreadable. Nothing declared means nothing to wait for.
//
// It fails OPEN: if the backend cannot be reached, the build goes ahead and
// says loudly in the log that the gate did not run. The alternative, failing
// closed, means one unreachable health endpoint silently freezes every
// frontend deploy, including the ones that need nothing new, and a typo in a
// URL would do it permanently. Being late with a feature flag is a smaller
// problem than not being able to ship at all. The backend deploy script's own
// sha assertion, and the weekly checks, are what catch a backend that is
// actually missing.
//
// Run it by hand without touching an exit code:
//
//   node scripts/vercel-ignore-build.mjs --explain
//   RELAVOI_BACKEND_HEALTH_URL=http://localhost:8080/v1/health \
//     node scripts/vercel-ignore-build.mjs --explain
//
// Runs before `npm install`, so: Node builtins only, no dependencies.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const CONTRACT_FILE = 'backend-contract.json';
const ATTEMPTS = 3;
const TIMEOUT_MS = 8000;
const RETRY_DELAY_MS = 2000;

const explainOnly = process.argv.includes('--explain');
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');

const log = (line) => console.log(`[backend-gate] ${line}`);

/** Vercel: exit 1 continues the build. */
function runBuild(why) {
  log(`BUILD: ${why}`);
  if (!explainOnly) process.exit(1);
}

/** Vercel: exit 0 aborts the build and marks the deployment CANCELED. */
function skipBuild(why) {
  log(`SKIP: ${why}`);
  if (!explainOnly) process.exit(0);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function readContractVersion(url) {
  let last;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { accept: 'application/json' },
      });
      // A degraded backend answers 503 and still reports its version, which is
      // the honest answer to "what code is serving": Postgres being briefly
      // unreachable says nothing about whether this frontend's endpoints
      // exist. So the body is read whatever the status, and only an
      // unparseable body counts as a failure.
      const body = await res.json();
      const version = body?.contractVersion;
      if (!Number.isInteger(version)) {
        return {
          ok: false,
          why:
            `${url} answered HTTP ${res.status} with no integer contractVersion ` +
            `(got ${JSON.stringify(version)}). A backend older than 5 November 2026 ` +
            `does not report one.`,
        };
      }
      return { ok: true, version, status: res.status };
    } catch (err) {
      last = err;
      if (attempt < ATTEMPTS) await sleep(RETRY_DELAY_MS);
    }
  }
  return {
    ok: false,
    why: `${url} unreachable after ${ATTEMPTS} attempts (${last?.message ?? last}).`,
  };
}

async function main() {
  const env = process.env.VERCEL_ENV;
  const sha = (process.env.VERCEL_GIT_COMMIT_SHA ?? '').slice(0, 7);
  log(`commit ${sha || '(unknown)'}, VERCEL_ENV=${env ?? '(unset)'}`);

  if (env && env !== 'production') {
    runBuild(`${env} builds are not gated on the backend version.`);
    return;
  }

  const file = path.join(repoRoot, CONTRACT_FILE);
  let declared;
  try {
    declared = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    runBuild(`cannot read ${CONTRACT_FILE} (${err.message}), so there is nothing to wait for.`);
    return;
  }

  const required = declared.minimumBackendContractVersion;
  if (!Number.isInteger(required) || required < 1) {
    runBuild(
      `${CONTRACT_FILE} does not declare an integer minimumBackendContractVersion ` +
        `(got ${JSON.stringify(required)}), so there is nothing to wait for.`,
    );
    return;
  }

  const url = process.env.RELAVOI_BACKEND_HEALTH_URL ?? declared.healthUrl;
  if (!url) {
    runBuild(`${CONTRACT_FILE} declares no healthUrl and RELAVOI_BACKEND_HEALTH_URL is unset.`);
    return;
  }

  log(`this build needs backend contract >= ${required}; asking ${url}`);
  const live = await readContractVersion(url);

  if (!live.ok) {
    runBuild(`gate did not run: ${live.why} Failing open, see the header of this script.`);
    return;
  }

  if (live.version >= required) {
    runBuild(`backend is at contract ${live.version}, this build needs ${required}.`);
    return;
  }

  skipBuild(
    `backend is at contract ${live.version}, this build needs ${required}. ` +
      `Deploy the backend first; its deploy script pokes this project's Vercel ` +
      `deploy hook when it is done, which runs this build again.`,
  );
}

main().catch((err) => {
  // An uncaught throw already exits 1, which is "build", but say so rather
  // than letting the reason vanish into a stack trace nobody reads.
  runBuild(`the gate itself threw (${err?.message ?? err}). Failing open.`);
  if (!explainOnly) process.exit(1);
});
