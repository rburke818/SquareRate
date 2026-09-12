import Link from "next/link";
import type { ReactNode } from "react";

import { Footer } from "@/components/Footer";
import { Logo } from "@/components/Logo";
import { LEGAL_LAST_UPDATED } from "@/lib/site";

/**
 * Shared chrome for `/terms` and `/privacy`.
 *
 * Both routes are reachable without an account — they're linked from checkout
 * and from the footer, so a prospective customer (or a payment provider
 * reviewing the store) must be able to read them cold. That's why the logo and
 * back link point at `/` rather than `/dashboard`, which would bounce a
 * logged-out reader into the sign-in wall.
 */
export function LegalLayout({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <>
      <main className="flex flex-1 flex-col">
        <header className="border-b border-line">
          <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-6 py-5">
            <Logo href="/" />
            <Link
              href="/"
              className="text-[11px] uppercase tracking-[0.18em] text-graphite transition-colors hover:text-charcoal"
            >
              Back
            </Link>
          </div>
        </header>

        <div className="mx-auto w-full max-w-3xl px-6 py-12">
          <p className="text-xs uppercase tracking-[0.22em] text-muted">Legal</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-charcoal">
            {title}
          </h1>
          <p className="mt-2 text-[11px] uppercase tracking-[0.18em] text-muted">
            Last updated {LEGAL_LAST_UPDATED}
          </p>
          <p className="mt-6 text-sm leading-relaxed text-graphite">{intro}</p>

          <div className="mt-12 space-y-10">{children}</div>
        </div>
      </main>
      <Footer />
    </>
  );
}

/** One numbered top-level clause. */
export function Clause({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-line pt-6">
      <h2 className="flex gap-3 text-base font-medium tracking-tight text-charcoal">
        <span className="font-mono text-[11px] tracking-[0.18em] text-muted">
          {String(n).padStart(2, "0")}
        </span>
        {title}
      </h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-graphite">
        {children}
      </div>
    </section>
  );
}

/** Bulleted list matching the square-bullet motif used on the pricing cards. */
export function LegalList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="space-y-2">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3">
          <span
            aria-hidden
            className="mt-[7px] inline-block h-[5px] w-[5px] shrink-0 bg-charcoal"
          />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}
