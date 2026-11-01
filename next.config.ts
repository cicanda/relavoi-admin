import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Every response, including the static ones.
        source: "/:path*",
        headers: [
          // Vercel injects x-matched-path on each response, naming the
          // internal route that matched. It is the one header the edge
          // discloses that maps the application's routing for anyone
          // enumerating, and unlike server: Vercel or x-vercel-id it is worth
          // removing: see finding L5 in the security audit of 1 November 2026
          // (relavoi-backend docs/security-audit-2026-10-31.md). Overwritten
          // to empty rather than deleted, because it is added by the platform
          // after this application has finished with the response and there
          // is nothing here to delete.
          { key: "x-matched-path", value: "" },
        ],
      },
    ];
  },
};

export default nextConfig;
