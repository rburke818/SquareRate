import type { BillingPeriod, Plan } from "./plans";
import type { PlanId, UserDoc } from "./types";

/**
 * LemonSqueezy checkout wiring.
 *
 * Store: https://squarerate.lemonsqueezy.com
 *
 * Each purchasable plan/cadence pair is one LemonSqueezy variant, and each
 * variant has its own checkout URL. Paste the four "Share / Buy link" URLs into
 * `.env.local`; anything left unset simply disables that button rather than
 * sending the user to a broken checkout.
 *
 * `NEXT_PUBLIC_*` variables are inlined by Next at build time, so they MUST be
 * referenced as literal property accesses — `process.env[someVariable]` returns
 * undefined in the browser bundle. Hence the static map below.
 */
const CHECKOUT_URLS: Record<string, string | undefined> = {
  "solo:monthly": process.env.NEXT_PUBLIC_LS_CHECKOUT_SOLO_MONTHLY,
  "solo:annual": process.env.NEXT_PUBLIC_LS_CHECKOUT_SOLO_ANNUAL,
  "pro:monthly": process.env.NEXT_PUBLIC_LS_CHECKOUT_PRO_MONTHLY,
  "pro:annual": process.env.NEXT_PUBLIC_LS_CHECKOUT_PRO_ANNUAL,
};

/** Public storefront, used for the "manage billing" fallback link. */
export const LEMONSQUEEZY_STORE_URL = "https://squarerate.lemonsqueezy.com";

/**
 * Build the checkout URL for a plan, stamped with the buyer's identity.
 *
 * The `checkout[custom][uid]` parameter is load-bearing: a LemonSqueezy webhook
 * has no idea who the buyer is in OUR system, so without it the billing
 * workflow cannot match a `subscription_created` event back to a Firestore user
 * doc. It comes back as `meta.custom_data.uid` on every order, subscription and
 * license-key event.
 *
 * Returns `null` when the variant URL has not been configured yet, so callers
 * can disable the button instead of rendering a dead link.
 */
export function checkoutUrlFor(
  plan: Plan,
  period: BillingPeriod,
  user?: {
    uid: string;
    email?: string | null;
    referred_by?: string | null;
  } | null,
): string | null {
  const base = CHECKOUT_URLS[`${plan.id}:${period}`];
  if (!base) return null;

  let url: URL;
  try {
    url = new URL(base);
  } catch {
    return null;
  }

  // Echo the plan back so the webhook doesn't have to maintain its own
  // variant-id → plan lookup table.
  url.searchParams.set("checkout[custom][plan]", plan.id);
  url.searchParams.set("checkout[custom][period]", period);

  if (user?.uid) {
    url.searchParams.set("checkout[custom][uid]", user.uid);
  }
  if (user?.email) {
    // Pre-fills the email field; the buyer can still change it, which is why
    // uid (not email) is what the webhook keys on.
    url.searchParams.set("checkout[email]", user.email);
  }
  if (user?.referred_by) {
    // Carries the referrer into the `subscription_created` payload, so the
    // billing workflow can record the commission without a second lookup.
    url.searchParams.set("checkout[custom][ref]", user.referred_by);
  }

  return url.toString();
}

/** True when at least one checkout URL is configured. */
export function isCheckoutConfigured(): boolean {
  return Object.values(CHECKOUT_URLS).some(Boolean);
}

/**
 * Map a LemonSqueezy variant back to a plan. The billing webhook in n8n should
 * prefer `meta.custom_data.plan` (set above) and fall back to this only for
 * checkouts created outside the app.
 */
export function planIdFromCustomData(raw: unknown): PlanId | null {
  return raw === "solo" || raw === "pro" ? raw : null;
}

/** Whether this account is on a paid subscription. */
export function isPaidUser(user: UserDoc | null | undefined): boolean {
  return user?.plan === "solo" || user?.plan === "pro";
}
