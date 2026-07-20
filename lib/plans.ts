import type { PlanId, UserDoc } from "./types";

export interface Plan {
  id: PlanId;
  label: string;
  /** Scans included per calendar month. */
  scanQuota: number;
  /** Monthly price in USD. PROVISIONAL — pending final validation. */
  priceMonthly: number;
  /** When true only Roof jobs may be scanned (the Roofer plan). */
  roofOnly: boolean;
}

/**
 * Plan catalog. Keep this in sync with the n8n "Meter & Gate" node's QUOTAS
 * map and with the LemonSqueezy products (map each LS variant → PlanId in the
 * billing webhook). Prices are provisional.
 */
export const PLANS: Record<PlanId, Plan> = {
  beta: { id: "beta", label: "Beta", scanQuota: 100, priceMonthly: 0, roofOnly: false },
  solo: { id: "solo", label: "Solo", scanQuota: 100, priceMonthly: 30, roofOnly: false },
  team: { id: "team", label: "Team", scanQuota: 300, priceMonthly: 75, roofOnly: false },
  commercial: {
    id: "commercial",
    label: "Commercial",
    scanQuota: 600,
    priceMonthly: 110,
    roofOnly: false,
  },
  roofer: { id: "roofer", label: "Roofer", scanQuota: 300, priceMonthly: 15, roofOnly: true },
};

/** Existing/legacy users (and beta testers) with no `plan` field default here. */
export const DEFAULT_PLAN_ID: PlanId = "beta";

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
 * Scans used in the CURRENT period. If the stored `usage_period` is stale (a
 * new month has begun) the effective count is 0 until the server resets it —
 * so the UI never shows a user locked out by last month's tally.
 */
export function usedThisPeriod(user: UserDoc | null | undefined): number {
  if (!user) return 0;
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
 * Client-side gate for the "Run AI Scan" action. This is a UX convenience only
 * — the authoritative enforcement runs server-side in n8n (the webhook is
 * directly callable and users can write their own Firestore user doc).
 */
export function canRunScan(
  user: UserDoc | null | undefined,
  surfaceType: string | undefined,
): { allowed: boolean; reason: string | null } {
  const { plan, overQuota, quota } = usageSummary(user);
  if (plan.roofOnly && surfaceType !== "Roof") {
    return {
      allowed: false,
      reason: "Your plan covers roof scans only — upgrade to scan this surface.",
    };
  }
  if (overQuota) {
    return {
      allowed: false,
      reason: `Monthly scan limit reached (${quota}). Upgrade your plan or wait for next month.`,
    };
  }
  return { allowed: true, reason: null };
}
