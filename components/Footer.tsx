import Link from "next/link";

/**
 * Global site footer — Nordic-minimalist: a single hairline rule, generous
 * whitespace, small uppercase tracking. Rendered on the dashboard and auth
 * pages (and future marketing pages) but NOT the job map tool, which has its
 * own control dock.
 *
 * PLACEHOLDERS: swap these three once finalized. The Contact link is a simple
 * mailto for now; the planned upgrade is an in-app modal form that POSTs to
 * n8n (captures user/page/job context).
 */
const CONTACT_EMAIL = "hello@squarerate.app"; // TODO: real support inbox
const TIMBERWOLF_URL = "#"; // TODO: Timberwolf website URL

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-line bg-paper">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-6 py-6 text-[11px] text-muted sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="uppercase tracking-[0.18em] text-charcoal">
            SquareRate
          </span>
          <span aria-hidden className="text-line">
            ·
          </span>
          <span>© {year}</span>
          <span aria-hidden className="text-line">
            ·
          </span>
          <span>
            by{" "}
            <a
              href={TIMBERWOLF_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-graphite underline-offset-2 transition-colors hover:text-charcoal hover:underline"
            >
              Timberwolf
            </a>
          </span>
        </div>

        <nav className="flex flex-wrap items-center gap-x-5 gap-y-1 uppercase tracking-[0.18em]">
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="text-graphite transition-colors hover:text-charcoal"
          >
            Contact
          </a>
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
