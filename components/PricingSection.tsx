"use client";

import Link from "next/link";

import { Logo } from "@/components/Logo";
import { Pricing } from "@/components/Pricing";
import { useAuth } from "@/lib/auth-context";
import { resolvePlan, usageSummary } from "@/lib/plans";

/**
 * Auth-aware wrapper around `<Pricing>` for the standalone `/pricing` route.
 *
 * Unlike the landing page, this route does NOT bounce signed-in users away —
 * they're the ones who need it, since it's where the upgrade modal sends them.
 * Being signed in also means we can stamp the checkout URL with their uid so
 * the LemonSqueezy webhook can match the purchase back to their account.
 */
export function PricingSection() {
  const { user, userDoc, loading } = useAuth();
  const plan = resolvePlan(userDoc);
  const { used, quota } = usageSummary(userDoc);

  return (
    <>
      <header className="border-b border-line">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
          <Logo href={user ? "/dashboard" : "/"} />
          <Link
            href={user ? "/dashboard" : "/"}
            className="text-[11px] uppercase tracking-[0.18em] text-graphite transition-colors hover:text-charcoal"
          >
            {user ? "Back to dashboard" : "Back"}
          </Link>
        </div>
      </header>

      {/* Current-usage strip. Only meaningful once we know who they are. */}
      {!loading && userDoc ? (
        <div className="border-b border-line bg-bone">
          <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-2 px-6 py-3 text-[11px] uppercase tracking-[0.18em]">
            <span className="text-muted">
              Current plan — <span className="text-charcoal">{plan.label}</span>
            </span>
            <span className="text-muted">
              {used} of {quota} scans used
              {plan.lifetimeQuota ? " (free trial)" : " this month"}
            </span>
          </div>
        </div>
      ) : null}

      <main className="flex flex-1 flex-col py-20">
        <Pricing
          currentPlanId={userDoc?.plan ?? null}
          user={
            user
              ? {
                  uid: user.uid,
                  email: user.email,
                  referred_by: userDoc?.referred_by ?? null,
                }
              : null
          }
        />
      </main>
    </>
  );
}
