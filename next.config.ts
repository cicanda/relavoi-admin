import type { NextConfig } from "next";

/**
 * Where a violation report goes, and what the report-only policy says.
 *
 * Finding H6 of the security audit of 1 November 2026. The operator console had no
 * Content-Security-Policy at all, which means an injected script on this
 * origin could talk to anything it liked, and the operator token this app
 * holds in localStorage is readable by any script that runs here.
 *
 * CSP goes up in report-only first, deliberately. An enforced policy that is
 * one directive wrong is a blank console for whoever is on call, and the only
 * honest way to find the missing directive is to let real traffic tell us. The
 * browser evaluates this policy, blocks nothing, and posts what it would have
 * blocked to the api. A week of that, then enforce, with nonces if the reports
 * say they are needed.
 *
 * Two things are deliberately NOT relaxed, so that the reports measure
 * something true:
 *
 *  - `script-src` has no 'unsafe-inline'. Next's streaming payload arrives as
 *    inline script, so this WILL report, and that is the point: the report is
 *    the measurement of how much nonce work enforcing actually needs.
 *  - `style-src` does carry 'unsafe-inline', because next/font emits an inline
 *    @font-face block and nonce-ing styles is a separate and larger job. The
 *    XSS value of restricting styles is also much smaller than for scripts.
 *
 * `connect-src` is built from NEXT_PUBLIC_API_URL so that a preview build
 * pointed at a different api does not report every request it makes, and so
 * that `next dev` against localhost is quiet too.
 */
const API_ORIGIN = ((): string => {
  try {
    return new URL(process.env.NEXT_PUBLIC_API_URL ?? "https://api.relavoi.com/v1").origin;
  } catch {
    return "https://api.relavoi.com";
  }
})();

const REPORT_URI = "https://api.relavoi.com/v1/csp-report";

const REPORT_ONLY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self'",
  `connect-src 'self' ${API_ORIGIN}`,
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  `report-uri ${REPORT_URI}`,
].join("; ");

/**
 * The headers that go on enforced today, because none of them can break a
 * screen that works.
 *
 * frame-ancestors 'none' is the one directive worth enforcing before the rest
 * of the policy is proven: nothing should ever frame a console, and clickjacking
 * a console is the attack it prevents. A Content-Security-Policy header holding
 * only frame-ancestors restricts nothing else, so there is no risk in it.
 * X-Frame-Options is the same statement for browsers that predate it.
 *
 * Referrer-Policy is no-referrer rather than something milder because a console
 * URL carries tenant and session ids in its path, and there is no outbound link
 * here that needs to know where it came from.
 */
const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "Content-Security-Policy-Report-Only", value: REPORT_ONLY_POLICY },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  {
    key: "Permissions-Policy",
    value: [
      "accelerometer=()",
      "autoplay=()",
      "camera=()",
      "display-capture=()",
      "encrypted-media=()",
      "geolocation=()",
      "gyroscope=()",
      "magnetometer=()",
      "microphone=()",
      "midi=()",
      "payment=()",
      "picture-in-picture=()",
      "usb=()",
      "xr-spatial-tracking=()",
    ].join(", "),
  },
];

const nextConfig: NextConfig = {
  // Next sends X-Powered-By: Next.js from its own server. Vercel's edge
  // happens not to pass it on today, so this changes nothing in production,
  // but it is the one fingerprinting header this application actually controls
  // and it would be sent the moment the app is served anywhere else.
  poweredByHeader: false,

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // x-matched-path names the internal route that matched, and it is
          // the one header the edge discloses that maps this application's
          // routing for anyone enumerating (finding L5 in the security audit
          // of 1 November 2026, relavoi-backend
          // docs/security-audit-2026-10-31.md).
          //
          // This rule does not remove it, and the measurement is written down
          // here so nobody spends another deploy finding out. Running the
          // production build locally, `next start` emits `x-matched-path:`
          // empty, so the rule is applied; against app.relavoi.com the header
          // comes back with the real route. Vercel injects it at the edge
          // after the application has finished with the response, so an
          // application-level rule cannot win. Removing it would need an edge
          // feature this plan does not have.
          //
          // The rule is left in place so that it starts working if that ever
          // changes, and because it is correct everywhere other than Vercel.
          { key: "x-matched-path", value: "" },
          ...SECURITY_HEADERS,
        ],
      },
    ];
  },
};

export default nextConfig;
