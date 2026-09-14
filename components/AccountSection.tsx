"use client";

import { verifyBeforeUpdateEmail } from "firebase/auth";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Logo } from "@/components/Logo";
import { useAuth } from "@/lib/auth-context";
import { LEMONSQUEEZY_STORE_URL, isPaidUser } from "@/lib/billing";
import { formatUsd, resolvePlan, usageSummary } from "@/lib/plans";
import { SUPPORT_EMAIL } from "@/lib/site";

function formatDate(iso: string | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
}

/**
 * Account and billing settings.
 *
 * This page exists because the Terms commit to it: customers are told they can
 * cancel "at any time, from your account" and that their email is editable
 * there. A subscription people cannot self-cancel is also the fastest route to
 * chargebacks, which a merchant-of-record store can least afford.
 */
export function AccountSection() {
  const router = useRouter();
  const { user, userDoc, loading, logout } = useAuth();

  useEffect(() => {
    if (!loading && !user) router.replace("/auth");
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <p className="text-xs uppercase tracking-[0.18em] text-muted">Loading</p>
      </main>
    );
  }

  const plan = resolvePlan(userDoc);
  const { used, quota, remaining } = usageSummary(userDoc);
  const paid = isPaidUser(userDoc);
  const renewsAt = formatDate(userDoc?.ls_renews_at);
  const cancelled = userDoc?.ls_status === "cancelled";

  return (
    <>
      <header className="border-b border-line">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-6 py-5">
          <Logo href="/dashboard" />
          <Link
            href="/dashboard"
            className="text-[11px] uppercase tracking-[0.18em] text-graphite transition-colors hover:text-charcoal"
          >
            Back to dashboard
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
        <p className="text-xs uppercase tracking-[0.22em] text-muted">Account</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-charcoal">
          Your plan and details
        </h1>

        <div className="mt-12 space-y-10">
          <section className="border-t border-line pt-6">
            <h2 className="text-[11px] uppercase tracking-[0.22em] text-muted">
              Plan
            </h2>

            <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-2xl font-semibold tracking-tight text-charcoal">
                {plan.label}
              </span>
              {plan.priceMonthly > 0 ? (
                <span className="text-sm text-muted">
                  {formatUsd(plan.priceMonthly)}/mo
                </span>
              ) : null}
            </div>

            <p className="mt-4 text-sm text-graphite">
              {used} of {quota} scans used
              {plan.lifetimeQuota
                ? " — this is your free trial, and it doesn't reset."
                : " this month. Your allowance resets on the 1st."}
            </p>

            <div className="mt-4 h-1 w-full bg-mist" aria-hidden>
              <div
                className="h-1 bg-charcoal"
                style={{
                  width: `${Math.min(100, quota > 0 ? (used / quota) * 100 : 0)}%`,
                }}
              />
            </div>

            {cancelled && renewsAt ? (
              <p className="mt-4 border border-charcoal bg-mist px-4 py-3 text-xs text-charcoal">
                Your subscription is cancelled. You keep {plan.label} until{" "}
                {renewsAt}, then move back to the free trial allowance.
              </p>
            ) : renewsAt ? (
              <p className="mt-4 text-[11px] uppercase tracking-[0.18em] text-muted">
                Renews {renewsAt}
              </p>
            ) : null}

            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/pricing"
                className="border border-charcoal px-6 py-3 text-[11px] uppercase tracking-[0.18em] text-charcoal transition-colors hover:bg-mist"
              >
                {paid ? "Compare plans" : "See plans"}
              </Link>
              {remaining === 0 && !paid ? (
                <Link
                  href="/pricing"
                  className="bg-charcoal px-6 py-3 text-[11px] uppercase tracking-[0.18em] text-paper transition-colors hover:bg-graphite"
                >
                  Upgrade now
                </Link>
              ) : null}
            </div>
          </section>

          <BillingSection paid={paid} portalUrl={userDoc?.ls_customer_portal_url} />

          <EmailSection
            email={user.email ?? ""}
            providerIds={user.providerData.map((p) => p.providerId)}
          />

          <section className="border-t border-line pt-6">
            <h2 className="text-[11px] uppercase tracking-[0.22em] text-muted">
              Session
            </h2>
            <button
              type="button"
              onClick={async () => {
                await logout();
                router.replace("/");
              }}
              className="mt-4 border border-charcoal px-6 py-3 text-[11px] uppercase tracking-[0.18em] text-charcoal transition-colors hover:bg-mist"
            >
              Sign out
            </button>
          </section>

          <section className="border-t border-line pt-6">
            <h2 className="text-[11px] uppercase tracking-[0.22em] text-muted">
              Delete account
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-graphite">
              We&rsquo;ll remove your account and every job on it within 30 days,
              as set out in the Privacy Policy. This can&rsquo;t be undone, and
              your measurement history goes with it — export anything you still
              need from the dashboard first.
            </p>
            <a
              href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
                "Account deletion request",
              )}&body=${encodeURIComponent(
                `Please delete my SquareRate account and all associated job data.\n\nAccount email: ${
                  user.email ?? ""
                }\nAccount ID: ${user.uid}\n`,
              )}`}
              className="mt-4 inline-block border border-line px-6 py-3 text-[11px] uppercase tracking-[0.18em] text-graphite transition-colors hover:border-charcoal hover:text-charcoal"
            >
              Request deletion
            </a>
          </section>
        </div>
      </main>
    </>
  );
}

function BillingSection({
  paid,
  portalUrl,
}: {
  paid: boolean;
  portalUrl?: string;
}) {
  return (
    <section className="border-t border-line pt-6">
      <h2 className="text-[11px] uppercase tracking-[0.22em] text-muted">
        Billing
      </h2>

      {paid ? (
        <>
          <p className="mt-4 text-sm leading-relaxed text-graphite">
            Payments are handled by Lemon Squeezy, our authorized reseller. Use
            their portal to update your card, download invoices, or cancel —
            cancelling stops future billing and you keep access until the end of
            the period you&rsquo;ve paid for.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <a
              href={portalUrl ?? `${LEMONSQUEEZY_STORE_URL}/billing`}
              target="_blank"
              rel="noopener noreferrer"
              className="border border-charcoal px-6 py-3 text-[11px] uppercase tracking-[0.18em] text-charcoal transition-colors hover:bg-mist"
            >
              Manage billing
            </a>
            <a
              href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
                "Billing help",
              )}`}
              className="px-6 py-3 text-[11px] uppercase tracking-[0.18em] text-graphite transition-colors hover:text-charcoal"
            >
              Can&rsquo;t get in? Email us
            </a>
          </div>
          <p className="mt-3 text-[11px] text-muted">
            Within 14 days of a charge we&rsquo;ll refund it in full, no
            questions asked.
          </p>
        </>
      ) : (
        <p className="mt-4 text-sm leading-relaxed text-graphite">
          You&rsquo;re not on a paid plan, so there&rsquo;s nothing to bill and
          no card on file.
        </p>
      )}
    </section>
  );
}

function EmailSection({
  email,
  providerIds,
}: {
  email: string;
  providerIds: string[];
}) {
  const [next, setNext] = useState(email);
  const [status, setStatus] = useState<"idle" | "saving" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  // Federated accounts don't own their email address — it lives with the
  // identity provider, and Firebase rejects the change outright.
  const federated = providerIds.some((id) => id !== "password");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setStatus("saving");
    try {
      const { auth } = await import("@/lib/firebase");
      if (!auth.currentUser) throw new Error("You're signed out.");
      await verifyBeforeUpdateEmail(auth.currentUser, next.trim());
      setStatus("sent");
    } catch (err) {
      setStatus("idle");
      const code =
        typeof err === "object" && err !== null && "code" in err
          ? String((err as { code: unknown }).code)
          : "";
      setError(
        code === "auth/requires-recent-login"
          ? "For security, sign out and back in before changing your email."
          : code === "auth/email-already-in-use"
            ? "That address is already attached to another account."
            : code === "auth/invalid-email"
              ? "That email address isn't valid."
              : "Couldn't update your email. Try again, or email support.",
      );
    }
  }

  return (
    <section className="border-t border-line pt-6">
      <h2 className="text-[11px] uppercase tracking-[0.22em] text-muted">
        Email
      </h2>

      {federated ? (
        <>
          <p className="mt-4 text-sm text-charcoal">{email}</p>
          <p className="mt-2 text-[11px] leading-relaxed text-muted">
            You sign in with Google, so your email is managed there. Change it in
            your Google account and it will follow through to SquareRate.
          </p>
        </>
      ) : status === "sent" ? (
        <p className="mt-4 border border-charcoal bg-mist px-4 py-3 text-xs text-charcoal">
          Check {next} for a confirmation link. Your address changes once you
          click it — until then, keep signing in with {email}.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="mt-4 flex flex-wrap gap-3">
          <input
            type="email"
            required
            value={next}
            onChange={(e) => setNext(e.target.value)}
            className="min-w-0 flex-1 border border-line bg-paper px-3 py-2.5 text-sm text-charcoal placeholder:text-muted focus:border-charcoal"
            aria-label="Email address"
          />
          <button
            type="submit"
            disabled={status === "saving" || next.trim() === email}
            className="border border-charcoal px-6 py-2.5 text-[11px] uppercase tracking-[0.18em] text-charcoal transition-colors hover:bg-mist disabled:opacity-40"
          >
            {status === "saving" ? "Sending…" : "Update"}
          </button>
          {error ? (
            <p className="w-full border border-charcoal bg-mist px-3 py-2 text-xs text-charcoal">
              {error}
            </p>
          ) : null}
        </form>
      )}
    </section>
  );
}
