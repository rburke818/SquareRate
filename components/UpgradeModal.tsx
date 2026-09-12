"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

import { checkoutUrlFor } from "@/lib/billing";
import {
  formatUsd,
  nextPlanUp,
  usageSummary,
  type BillingPeriod,
} from "@/lib/plans";
import { SUPPORT_EMAIL } from "@/lib/site";
import type { UserDoc } from "@/lib/types";

interface UpgradeModalProps {
  /** Drive this from `hasReachedLimit(userDoc)`. */
  open: boolean;
  onClose: () => void;
  userDoc: UserDoc | null;
  /**
   * LemonSqueezy checkout URL for the CTA. Defaults to the configured URL for
   * whichever plan is next up from the user's current one.
   */
  checkoutUrl?: string | null;
  /** Cadence the CTA sells. Monthly converts better off a hard block. */
  period?: BillingPeriod;
}

/**
 * Blocking overlay shown once a user has burned their scan allowance.
 *
 * The CTA adapts to where they are in the ladder — a trial user is sold Solo
 * Crew, a Solo customer who runs out mid-month is sold Pro Crew, and a Pro
 * customer is pointed at support rather than a checkout that doesn't exist.
 *
 * Dismissible on purpose: the limit is enforced at scan time regardless, and
 * trapping someone who only wants to re-read a finished job is hostile.
 */
export function UpgradeModal({
  open,
  onClose,
  userDoc,
  checkoutUrl,
  period = "monthly",
}: UpgradeModalProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  // Escape to dismiss, and hold the background still while the overlay is up.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  const { plan, used, quota } = usageSummary(userDoc);
  const target = nextPlanUp(userDoc);
  const url =
    checkoutUrl ??
    (target ? checkoutUrlFor(target, period, userDoc) : null);

  const headline = plan.lifetimeQuota
    ? "You've used all 5 free scans"
    : `You've used all ${quota} scans this month`;

  const body = plan.lifetimeQuota
    ? "That's the whole free trial. Your jobs and measurements are safe — pick a plan and pick up right where you left off."
    : `You're on ${plan.label}, which includes ${quota} scans a month. Your allowance resets on the 1st, or you can move up now and keep going today.`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="upgrade-modal-title"
    >
      {/* Click-to-dismiss scrim. Hidden from assistive tech so it doesn't
          announce a second "Close" alongside the real one; Escape and the
          header button remain the keyboard paths out. */}
      <button
        type="button"
        aria-hidden
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-charcoal/40"
      />

      <div className="relative w-full max-w-md border border-charcoal bg-paper">
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <span className="text-[11px] uppercase tracking-[0.22em] text-muted">
            Scan limit reached
          </span>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="text-[11px] uppercase tracking-[0.18em] text-graphite transition-colors hover:text-charcoal"
          >
            Close
          </button>
        </div>

        <div className="px-6 py-8">
          <h2
            id="upgrade-modal-title"
            className="text-2xl font-semibold tracking-tight text-charcoal"
          >
            {headline}
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-graphite">{body}</p>

          <p className="mt-6 border border-line bg-bone px-4 py-3 text-[11px] uppercase tracking-[0.18em] text-graphite">
            {used} of {quota} scans used
          </p>

          {target && url ? (
            <a
              href={url}
              className="mt-8 block w-full bg-charcoal py-3 text-center text-sm font-medium uppercase tracking-[0.18em] text-paper transition-colors hover:bg-graphite"
            >
              {`Upgrade to ${target.label} — ${formatUsd(target.priceMonthly)}/mo`}
            </a>
          ) : target ? (
            <Link
              href="/pricing"
              className="mt-8 block w-full bg-charcoal py-3 text-center text-sm font-medium uppercase tracking-[0.18em] text-paper transition-colors hover:bg-graphite"
            >
              {`Upgrade to ${target.label} — ${formatUsd(target.priceMonthly)}/mo`}
            </Link>
          ) : (
            <a
              href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
                "Scan volume above Pro Crew",
              )}`}
              className="mt-8 block w-full bg-charcoal py-3 text-center text-sm font-medium uppercase tracking-[0.18em] text-paper transition-colors hover:bg-graphite"
            >
              Talk to us about volume
            </a>
          )}

          <div className="mt-4 flex items-center justify-between text-[11px]">
            <Link
              href="/pricing"
              className="uppercase tracking-[0.18em] text-graphite transition-colors hover:text-charcoal"
            >
              Compare plans
            </Link>
            <span className="text-muted">
              {plan.lifetimeQuota ? "Cancel anytime" : "Upgrade takes effect immediately"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
