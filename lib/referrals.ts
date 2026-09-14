import type { Plan } from "./plans";

/**
 * Referral attribution.
 *
 * The code is captured from `?ref=` on whatever page the visitor lands on,
 * parked in local storage, and then written onto the user document at signup
 * as `referred_by`. Attribution therefore happens at SIGNUP, not at checkout.
 *
 * That distinction is the whole point. SquareRate converts through a trial with
 * no expiry: someone clicks a referrer's link, signs up, works through five
 * free scans over however many weeks their job schedule allows, and only then
 * subscribes. Cookie-based affiliate tracking (LemonSqueezy's included) uses a
 * fixed window — 30 days by default — so a meaningful share of genuine
 * conversions would fall outside it and the referrer would go unpaid. A field
 * on the user document has no window and survives device changes.
 */

const STORAGE_KEY = "squarerate.ref";
const REF_PARAM = "ref";

/**
 * Codes are short and uppercase. Validating on the way in matters because this
 * value is persisted, echoed into a checkout URL, and later joined against
 * payout records — it must never carry arbitrary user-supplied text.
 */
const CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{1,23}$/;

export function normalizeReferralCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const code = raw.trim().toUpperCase();
  return CODE_PATTERN.test(code) ? code : null;
}

/**
 * Read `?ref=` off the current URL and park it.
 *
 * FIRST TOUCH WINS: an existing stored code is never overwritten. With a small
 * hand-picked referral team doing outbound work, the first introduction is
 * normally the real effort, and this stops a second referrer sniping a lead
 * that someone else spent weeks warming up. Flip the guard below if you'd
 * rather run last-touch.
 */
export function captureReferralFromUrl(): void {
  if (typeof window === "undefined") return;

  const code = normalizeReferralCode(
    new URLSearchParams(window.location.search).get(REF_PARAM),
  );
  if (!code) return;

  try {
    if (window.localStorage.getItem(STORAGE_KEY)) return;
    window.localStorage.setItem(STORAGE_KEY, code);
  } catch {
    // Private browsing or blocked storage. Losing attribution is survivable;
    // breaking the landing page over it is not.
  }
}

export function storedReferralCode(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return normalizeReferralCode(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

/** Called once the code has been written onto the user doc, so a second
 *  account created in the same browser isn't attributed to the same referrer. */
export function clearStoredReferralCode(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do — worst case the next signup re-attributes.
  }
}

/* ---------------------------------------------------------------------------
   Commission schemes
--------------------------------------------------------------------------- */

export interface Referrer {
  /** Value used in `?ref=`. Uppercase, matches CODE_PATTERN. */
  code: string;
  /** Human name, for the payout report. */
  label: string;
  /**
   * One-off bonus expressed as a multiple of the plan's monthly list price.
   * `1` means "one month". Set `0` when the referrer is on a flat fee.
   */
  signupBonusMonths: number;
  /** Flat USD bonus, as an alternative to `signupBonusMonths`. */
  flatBonusUsd: number;
  /** Ongoing share of every subsequent payment, in percent. `0` for none. */
  revSharePercent: number;
  /**
   * Days the customer must stay subscribed before any bonus becomes payable.
   * This is what protects you from the 14-day refund window and from a
   * referrer signing up their own throwaway accounts to harvest bonuses.
   */
  qualifyingDays: number;
  notes: string;
}

/**
 * THE COMMISSION BASE IS ALWAYS THE PLAN'S MONTHLY LIST PRICE — never the
 * amount actually charged.
 *
 * An annual Pro Crew sale bills $1,290 up front. A "one month" bonus on that
 * sale is $129, not $1,290. Reading it the other way on a single annual sale
 * would cost more than a month of the entire referral budget, so the rule lives
 * here in code rather than in anyone's memory of a conversation.
 *
 * PROVISIONAL — amounts and the roster below need signing off before the first
 * payout, and the n8n billing workflow must mirror whatever lands here.
 */
export const REFERRERS: Record<string, Referrer> = {
  PARTNER: {
    code: "PARTNER",
    label: "Business partner (placeholder — rename to their code)",
    signupBonusMonths: 1,
    flatBonusUsd: 0,
    revSharePercent: 15,
    qualifyingDays: 30,
    notes:
      "One month's list price as a signup bonus in lieu of salary, then 15% of every subsequent payment for the life of the account. The 30-day hold is deliberate: the original terms paid out immediately, which loses money on any customer who refunds inside the 14-day window. Revenue share this open-ended needs a written agreement covering gross vs net, what happens if they stop working, and what happens on a sale of the business.",
  },
  COUSIN: {
    code: "COUSIN",
    label: "Family referrer (placeholder — rename to their code)",
    signupBonusMonths: 1,
    flatBonusUsd: 0,
    revSharePercent: 0,
    qualifyingDays: 90,
    notes:
      "One month's list price once the customer has stayed three months. The qualifying period does the heavy lifting here — by payout time you've collected roughly three months of revenue against a one-month cost.",
  },
  STANDARD: {
    code: "STANDARD",
    label: "Standard referrer (default scheme)",
    signupBonusMonths: 0,
    flatBonusUsd: 0,
    revSharePercent: 0,
    qualifyingDays: 90,
    notes:
      "Flat fee after three months, amount still to be set. Consider tiering it by plan — a flat fee pays the same for a $49 Solo Crew and a $129 Pro Crew, which quietly pushes referrers toward whichever is easiest to sell rather than whichever is worth most.",
  },
};

/** The bonus owed for one conversion, in USD. Excludes ongoing revenue share. */
export function signupBonusFor(referrer: Referrer, plan: Plan): number {
  if (referrer.flatBonusUsd > 0) return referrer.flatBonusUsd;
  return referrer.signupBonusMonths * plan.priceMonthly;
}

/** Ongoing commission owed on a single payment of `amountUsd`. */
export function revShareFor(referrer: Referrer, amountUsd: number): number {
  return (referrer.revSharePercent / 100) * amountUsd;
}

export function findReferrer(code: string | null | undefined): Referrer | null {
  const normalized = normalizeReferralCode(code);
  return normalized ? (REFERRERS[normalized] ?? null) : null;
}
