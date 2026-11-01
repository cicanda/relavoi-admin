import type { NextConfig } from "next";

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
        ],
      },
    ];
  },
};

export default nextConfig;
