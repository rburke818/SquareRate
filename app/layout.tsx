import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { AuthProvider } from "@/lib/auth-context";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SquareRate — Precision measurement for field work",
  description:
    "SquareRate measures hardscape, turf, and roofs from a map. Built for fast, repeatable field estimates.",
  applicationName: "SquareRate",
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/*
          DOM-level CSP override. Turbopack ignores the `headers()` config in
          dev mode, so we ship the policy in the document `<head>` where the
          browser is forced to honor it on every load. Permissive on purpose:
          `'unsafe-eval'` is mandatory for the Google Maps JS API, and the
          wildcard `script-src *` lets gstatic sub-libraries (drawing,
          geometry, places) load without an explicit allow-list. Tighten
          this once Phase 3 ships and we know every host SquareRate touches.
        */}
        <meta
          httpEquiv="Content-Security-Policy"
          content="default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; script-src * 'unsafe-inline' 'unsafe-eval' https://*.googleapis.com https://*.gstatic.com; connect-src * 'unsafe-inline' https://*.googleapis.com; img-src * data: blob: 'unsafe-inline' https://*.googleapis.com https://*.gstatic.com;"
        />
      </head>
      <body className="min-h-full bg-paper text-charcoal flex flex-col">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
