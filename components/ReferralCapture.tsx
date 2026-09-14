"use client";

import { useEffect } from "react";

import { captureReferralFromUrl } from "@/lib/referrals";

/**
 * Parks any `?ref=` code from the entry URL so it survives until signup.
 *
 * Renders nothing and runs once per full page load, which is when a referral
 * link is actually followed. It reads `window.location.search` directly rather
 * than `useSearchParams()` on purpose: the hook forces every route that mounts
 * it into client rendering unless wrapped in Suspense, and that is a heavy
 * price for a one-line side effect in the root layout.
 */
export function ReferralCapture() {
  useEffect(() => {
    captureReferralFromUrl();
  }, []);

  return null;
}
