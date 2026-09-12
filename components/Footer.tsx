import Link from "next/link";

import { SupportLink } from "@/components/SupportLink";
import { COMPANY_LEGAL_NAME, DISCORD_INVITE_URL } from "@/lib/site";

/**
 * Global site footer — Nordic-minimalist: a single hairline rule, generous
 * whitespace, small uppercase tracking. Rendered on the marketing, auth,
 * pricing, legal and dashboard pages but NOT the job map tool, which has its
 * own control dock.
 *
 * "Timberwolf Development" is deliberately plain text rather than a link:
 * timberwolfdev.com currently redirects back to squarerate.app, so linking it
 * would send a reader in a circle. Restore the anchor once there's a real page
 * at the other end.
 */
export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-line bg-paper">
      {/* Extra bottom padding keeps the nav clear of the fixed "Report a bug"
          toggle on pages that render both. */}
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-6 pb-16 pt-6 text-[11px] text-muted sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="uppercase tracking-[0.18em] text-charcoal">
            SquareRate
          </span>
          <span aria-hidden className="text-line">
            ·
          </span>
          <span>
            © {year} {COMPANY_LEGAL_NAME}
          </span>
        </div>

        {/* Two columns on phones so the links land 2x2, then one unbroken row
            once there's width for it. `shrink-0` + `flex-nowrap` are what stop
            the nav being squeezed by the copyright line into an orphaned
            fourth link on its own row; the left block wraps instead. */}
        <nav className="grid grid-cols-2 gap-x-5 gap-y-2 uppercase tracking-[0.18em] sm:flex sm:shrink-0 sm:flex-nowrap sm:items-center sm:gap-y-1">
          <Link
            href="/pricing"
            className="text-graphite transition-colors hover:text-charcoal"
          >
            Pricing
          </Link>
          <SupportLink topic="question">Contact</SupportLink>
          {DISCORD_INVITE_URL ? (
            <a
              href={DISCORD_INVITE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-graphite transition-colors hover:text-charcoal"
            >
              Discord
            </a>
          ) : null}
          <Link
            href="/privacy"
            className="text-graphite transition-colors hover:text-charcoal"
          >
            Privacy
          </Link>
          <Link
            href="/terms"
            className="text-graphite transition-colors hover:text-charcoal"
          >
            Terms
          </Link>
        </nav>
      </div>
    </footer>
  );
}
