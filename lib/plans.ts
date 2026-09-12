import type { PlanId, UserDoc } from "./types";

/** Billing cadence selected on the pricing page. */
export type BillingPeriod = "monthly" | "annual";

export interface Plan {
  id: PlanId;
  label: string;
  /** Scans included per calendar month, or in total when `lifetimeQuota`. */
  scanQuota: number;
  /** Price in USD per month when billed monthly. */
  priceMonthly: number;
  /** Price in USD charged once per year. `null` for plans not sold annually. */
  priceAnnual: number | null;
  /**
   * When true the quota is a ONE-TIME allowance that never resets — the free
   * trial. Usage for these plans is read from `trial_scans_used`, not from the
   * month-scoped counter.
   */
  lifetimeQuota: boolean;
  /** Whether the plan appears on the public pricing page. */
  purchasable: boolean;
  /** One-line positioning used on the pricing cards. */
  tagline: string;
}

/**
 * Plan catalog. Keep this in sync with the n8n "Meter & Gate" node's QUOTAS
 * map and with the LemonSqueezy variants (see `lib/billing.ts`, which maps
 * each variant checkout URL → PlanId + BillingPeriod).
 *
 * Annual plans bill once but the scan allowance is still granted MONTHLY and
 * resets with the calendar month — an annual Solo Crew customer gets 100 scans
 * in January, another 100 in February, and so on. They do not receive 1,200
 * scans up front.
 */
export const PLANS: Record<PlanId, Plan> = {
  beta: {
    id: "beta",
    label: "Beta",
    scanQuota: 100,
    priceMonthly: 0,
    priceAnnual: null,
    lifetimeQuota: false,
    purchasable: false,
    tagline: "Grandfathered early-access account.",
  },
  trial: {
    id: "trial",
    label: "Free Trial",
    scanQuota: 5,
    priceMonthly: 0,
    priceAnnual: null,
    lifetimeQuota: true,
    purchasable: false,
    tagline: "5 scans to try it on a real job.",
  },
  solo: {
    id: "solo",
    label: "Solo Crew",
    scanQuota: 100,
    priceMonthly: 49,
    priceAnnual: 490,
    lifetimeQuota: false,
    purchasable: true,
    tagline: "For the owner-operator or small crew running their own jobs.",
  },
  pro: {
    id: "pro",
    label: "Pro Crew",
    scanQuota: 350,
    priceMonthly: 129,
    priceAnnual: 1290,
    lifetimeQuota: false,
    purchasable: true,
    tagline:
      "For crews and contractors bidding a higher volume of estimates monthly.",
  },
};

/**
 * Plans shown on the pricing page, in display order. `solo` is rendered as the
 * highlighted/default option.
 */
export const PURCHASABLE_PLANS: Plan[] = [PLANS.solo, PLANS.pro];

/**
 * Fallback for user docs with NO `plan` field — i.e. accounts created before
 * paid plans shipped. They stay on `beta` (100 scans/month, free) rather than
 * being silently downgraded to the 5-scan trial. New signups are written with
 * an explicit `plan: "trial"` in `ensureUserDoc`, so they never hit this.
 */
export const DEFAULT_PLAN_ID: PlanId = "beta";

/** Plan assigned to every newly created account. */
export const SIGNUP_PLAN_ID: PlanId = "trial";

export function resolvePlan(user: UserDoc | null | undefined): Plan {
  const id = user?.plan;
  return (id && PLANS[id]) || PLANS[DEFAULT_PLAN_ID];
}

/**
 * Current usage period as "YYYY-MM" in UTC. The n8n metering node MUST compute
 * the period the same way so the client display and server enforcement agree.
 */
export function currentUsagePeriod(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/**
 * Scans counted against the user's current allowance.
 *
 * Trial accounts read the lifetime counter, which never resets. Everyone else
 * reads the month-scoped counter: if the stored `usage_period` is stale (a new
 * month has begun) the effective count is 0 until the server resets it, so the
 * UI never shows a user locked out by last month's tally.
 */
export function usedThisPeriod(user: UserDoc | null | undefined): number {
  if (!user) return 0;
  if (resolvePlan(user).lifetimeQuota) return user.trial_scans_used ?? 0;
  if (user.usage_period !== currentUsagePeriod()) return 0;
  return user.api_queries_this_month ?? 0;
}

export interface UsageSummary {
  plan: Plan;
  used: number;
  quota: number;
  remaining: number;
  overQuota: boolean;
}

export function usageSummary(user: UserDoc | null | undefined): UsageSummary {
  const plan = resolvePlan(user);
  const used = usedThisPeriod(user);
  const quota = plan.scanQuota;
  return {
    plan,
    used,
    quota,
    remaining: Math.max(0, quota - used),
    overQuota: used >= quota,
  };
}

/**
 * Whether the user has burned their whole allowance and should be shown the
 * upgrade modal. Display-only — n8n enforces the real limit server-side.
 */
export function hasReachedLimit(user: UserDoc | null | undefined): boolean {
  return usageSummary(user).overQuota;
}

/**
 * The plan we should sell to this user next, or `null` when they are already
 * on the top tier (in which case the UI points them at support instead).
 * Trial and grandfathered beta accounts are both upsold to Solo Crew.
 */
export function nextPlanUp(user: UserDoc | null | undefined): Plan | null {
  switch (resolvePlan(user).id) {
    case "trial":
    case "beta":
      return PLANS.solo;
    case "solo":
      return PLANS.pro;
    default:
      return null;
  }
}

/**
 * Client-side gate for the "Run AI Scan" action. This is a UX convenience only
 * — the authoritative enforcement runs server-side in n8n (the webhook is
 * directly callable and users can write their own Firestore user doc).
 */
export function canRunScan(
  user: UserDoc | null | undefined,
): { allowed: boolean; reason: string | null } {
  const { plan, overQuota, quota } = usageSummary(user);
  if (overQuota) {
    return {
      allowed: false,
      reason: plan.lifetimeQuota
        ? `You've used all ${quota} free scans. Upgrade to keep measuring.`
        : `Monthly scan limit reached (${quota}). Upgrade your plan or wait for next month.`,
    };
  }
  return { allowed: true, reason: null };
}

/* ---------------------------------------------------------------------------
   Pricing display helpers
--------------------------------------------------------------------------- */

/** Price actually charged for `plan` on the given cadence, in USD. */
export function priceFor(plan: Plan, period: BillingPeriod): number {
  return period === "annual" && plan.priceAnnual !== null
    ? plan.priceAnnual
    : plan.priceMonthly;
}

/**
 * The struck-through "was" figure on an annual card: twelve months at the
 * monthly rate. Solo Crew is $588 against $490, Pro Crew $1,548 against $1,290
 * — both exactly ten months, which is what makes "2 Months Free" true.
 */
export function annualListPrice(plan: Plan): number {
  return plan.priceMonthly * 12;
}

/** Whole months saved by paying annually. Renders as "2 Months Free". */
export function monthsFreeOnAnnual(plan: Plan): number {
  if (plan.priceAnnual === null || plan.priceMonthly <= 0) return 0;
  const saved = annualListPrice(plan) - plan.priceAnnual;
  return Math.round(saved / plan.priceMonthly);
}

/** `$49` / `$1,290` — whole dollars, since every price is a round number. */
export function formatUsd(amount: number): string {
  return `$${amount.toLocaleString("en-US")}`;
}
