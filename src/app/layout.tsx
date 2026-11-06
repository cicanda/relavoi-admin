import type { Metadata } from "next";
import localFont from "next/font/local";

// Self-hosted, latin subsets, 46 KB for all three files. next/font/local
// serves them from this origin, injects the preload link and sets
// font-display: swap, so nothing is requested from a font CDN at build time
// or at run time.
//
// Sora is the variable face: one file carries the 400 body and the 600
// headline weight, which is why the weight is a range rather than a list.
const sora = localFont({
  variable: "--font-sora",
  src: [{ path: "./fonts/sora-variable.woff2", weight: "400 600", style: "normal" }],
  display: "swap",
  preload: true,
  fallback: ["system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
});

// The mono face is for numbers, code and API values. Not preloaded: it is
// never in the first paint, so preloading it would compete with the headline.
const plexMono = localFont({
  variable: "--font-plex-mono",
  src: [
    { path: "./fonts/ibm-plex-mono-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/ibm-plex-mono-500.woff2", weight: "500", style: "normal" },
  ],
  display: "swap",
  preload: false,
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
});

import "./globals.css";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: "Relavoi · Operator Console",
  description: "Relavoi platform operations and tenant management",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${sora.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
