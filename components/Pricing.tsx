"use client";

import { useState } from "react";

import { checkoutUrlFor } from "@/lib/billing";
import {
  annualListPrice,
  formatUsd,
  monthsFreeOnAnnual,
  priceFor,
  PURCHASABLE_PLANS,
  type BillingPeriod,
  type Plan,
} from "@/lib/plans";
import type { PlanId } from "@/lib/types";

/** Plain-language feature lists. Written for someone pricing a job, not a CTO. */
const FEATURES: Record<string, string[]> = {
  solo: [
    "100 scans every month",
    "Roofs, driveways, decking, lawns and more",
    "Per-plane roof breakdown with pitch and azimuth",
    "CSV export for your scans",
    "Unlimited saved jobs",
    "Email support",
  ],
  pro: [
    "350 scans every month",
    "Everything in Solo Crew",
    "Built for multiple estimators on one account",
    "Priority email support",
    "First access to new features",
  ],
};

interface PricingProps {
  /**
   * Plan the signed-in user is already on, if any. Cards for the current plan
   * render as "Your plan" instead of a checkout button.
   */
  currentPlanId?: PlanId | null;
  /** Identity stamped onto the checkout URL so the billing webhook can match
   *  the purchase back to a Firestore user. Omit for logged-out visitors. */
  user?: { uid: string; email?: string | null } | null;
  /**
   * Override the LemonSqueezy checkout URL per card. Defaults to the URLs
   * configured in `.env.local` via `lib/billing.ts`.
   */
  resolveCheckoutUrl?: (plan: Plan, period: BillingPeriod) => string | null;
  /** Heading copy. Set `false` to render bare cards inside another section. */
  heading?: boolean;
}

export function Pricing({
  currentPlanId = null,
  user = null,
  resolveCheckoutUrl,
  heading = true,
}: PricingProps) {
  const [period, setPeriod] = useState<BillingPeriod>("monthly");
  const resolve = resolveCheckoutUrl ?? ((plan: Plan, p: BillingPeriod) =>
    checkoutUrlFor(plan, p, user));

  return (
    <section className="mx-auto w-full max-w-5xl px-6">
      {heading ? (
        <div className="text-center">
          <p className="text-[11px] uppercase tracking-[0.22em] text-muted">
            Pricing
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-charcoal sm:text-4xl">
            One measurement beats a second trip out
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-graphite">
            Every plan covers all surface types and every tool in the app. The
            only thing that changes is how many scans you get each month. No
            setup fees, no contracts, cancel whenever.
          </p>
        </div>
      ) : null}

      <BillingToggle period={period} onChange={setPeriod} />

      <div className="mt-10 grid gap-px border border-line bg-line sm:grid-cols-2">
        {PURCHASABLE_PLANS.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            period={period}
            featured={plan.id === "solo"}
            isCurrent={currentPlanId === plan.id}
            checkoutUrl={resolve(plan, period)}
          />
        ))}
      </div>

      <p className="mt-6 text-center text-[11px] text-muted">
        All prices in USD. Sales tax is added at checkout where it applies.
        Payments are handled by Lemon Squeezy, our authorized reseller.
      </p>
    </section>
  );
}

function BillingToggle({
  period,
  onChange,
}: {
  period: BillingPeriod;
  onChange: (next: BillingPeriod) => void;
}) {
  return (
    <div className="mt-10 flex flex-col items-center gap-3">
      <div
        role="radiogroup"
        aria-label="Billing period"
        className="grid w-full max-w-xs grid-cols-2 border border-charcoal"
      >
        {(["monthly", "annual"] as const).map((value) => {
          const active = period === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(value)}
              className={`py-2.5 text-[11px] uppercase tracking-[0.18em] transition-colors ${
                active
                  ? "bg-charcoal text-paper"
                  : "bg-paper text-graphite hover:bg-mist"
              }`}
            >
              {value === "monthly" ? "Monthly" : "Annual"}
            </button>
          );
        })}
      </div>

      {/* Reserve the row whether or not the badge shows, so toggling doesn't
          shunt the cards up and down. */}
      <p
        className={`text-[11px] uppercase tracking-[0.18em] transition-opacity ${
          period === "annual"
            ? "text-charcoal opacity-100"
            : "text-muted opacity-0"
        }`}
        aria-hidden={period !== "annual"}
      >
        2 Months Free
      </p>
    </div>
  );
}

function PlanCard({
  plan,
  period,
  featured,
  isCurrent,
  checkoutUrl,
}: {
  plan: Plan;
  period: BillingPeriod;
  featured: boolean;
  isCurrent: boolean;
  checkoutUrl: string | null;
}) {
  const isAnnual = period === "annual" && plan.priceAnnual !== null;
  const price = priceFor(plan, period);
  const monthsFree = monthsFreeOnAnnual(plan);
  const perMonthEquivalent = Math.round(price / 12);

  return (
    <div
      className={`flex flex-col p-8 ${featured ? "bg-bone" : "bg-paper"}`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[11px] uppercase tracking-[0.22em] text-charcoal">
          {plan.label}
        </h3>
        {featured ? (
          <span className="border border-charcoal px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-charcoal">
            Most popular
          </span>
        ) : null}
      </div>

      <p className="mt-3 text-sm leading-relaxed text-graphite">{plan.tagline}</p>

      <div className="mt-8 border-t border-line pt-8">
        <div className="flex items-baseline gap-2">
          <span className="text-4xl font-semibold tracking-tight text-charcoal">
            {formatUsd(price)}
          </span>
          <span className="text-sm text-muted">
            {isAnnual ? "/yr" : "/mo"}
          </span>
        </div>

        {isAnnual ? (
          <p className="mt-2 flex flex-wrap items-center gap-x-2 text-[11px] text-muted">
            <span className="line-through">{formatUsd(annualListPrice(plan))}</span>
            <span className="uppercase tracking-[0.18em] text-charcoal">
              {monthsFree} Months Free
            </span>
            <span className="w-full text-muted">
              Works out to {formatUsd(perMonthEquivalent)}/mo, billed once a year.
            </span>
          </p>
        ) : (
          <p className="mt-2 text-[11px] text-muted">
            {plan.scanQuota} scans a month. Billed monthly, cancel anytime.
          </p>
        )}
      </div>

      <ul className="mt-8 flex-1 space-y-3">
        {FEATURES[plan.id]?.map((feature) => (
          <li key={feature} className="flex gap-3 text-sm text-graphite">
            <span
              aria-hidden
              className="mt-[7px] inline-block h-[5px] w-[5px] shrink-0 bg-charcoal"
            />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      <div className="mt-8">
        <CheckoutButton
          plan={plan}
          period={period}
          featured={featured}
          isCurrent={isCurrent}
          checkoutUrl={checkoutUrl}
        />
      </div>
    </div>
  );
}

/**
 * The CTA. Takes the LemonSqueezy checkout URL as a prop so the payment
 * gateway can be rewired without touching the pricing layout.
 *
 * Renders a disabled button rather than a dead link when no URL is configured,
 * which is what happens in local dev before the `.env.local` variables are set.
 */
export function CheckoutButton({
  plan,
  period,
  featured,
  isCurrent,
  checkoutUrl,
}: {
  plan: Plan;
  period: BillingPeriod;
  featured: boolean;
  isCurrent: boolean;
  checkoutUrl: string | null;
}) {
  const base =
    "block w-full py-3 text-center text-sm font-medium uppercase tracking-[0.18em] transition-colors";

  if (isCurrent) {
    return (
      <span
        className={`${base} cursor-default border border-line bg-paper text-muted`}
      >
        Your plan
      </span>
    );
  }

  if (!checkoutUrl) {
    return (
      <button
        type="button"
        disabled
        title="Checkout link not configured yet"
        className={`${base} border border-line bg-paper text-muted opacity-60`}
      >
        Coming soon
      </button>
    );
  }

  return (
    <a
      href={checkoutUrl}
      className={`${base} ${
        featured
          ? "bg-charcoal text-paper hover:bg-graphite"
          : "border border-charcoal bg-paper text-charcoal hover:bg-mist"
      }`}
    >
      {`Get ${plan.label} — ${formatUsd(priceFor(plan, period))}${
        period === "annual" && plan.priceAnnual !== null ? "/yr" : "/mo"
      }`}
    </a>
  );
}
