"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { Logo } from "@/components/Logo";
import { useAuth } from "@/lib/auth-context";

/**
 * Marketing header for the public landing page.
 *
 * Also owns the "already signed in" redirect that `app/page.tsx` used to do:
 * a signed-in user who lands on `/` is sent straight through to the dashboard.
 * The redirect runs from here rather than the page so the page itself can stay
 * a Server Component and ship real HTML — which matters for crawlers and for
 * anyone (Lemon Squeezy included) evaluating the product without an account.
 */
export function LandingNav() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && user) router.replace("/dashboard");
  }, [user, loading, router]);

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-paper/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
        <Logo href="/" />

        <nav className="flex items-center gap-5 text-[11px] uppercase tracking-[0.18em]">
          <Link
            href="/pricing"
            className="hidden text-graphite transition-colors hover:text-charcoal sm:inline"
          >
            Pricing
          </Link>
          {user ? (
            <Link
              href="/dashboard"
              className="border border-charcoal bg-charcoal px-4 py-2 text-paper transition-colors hover:bg-graphite"
            >
              Dashboard
            </Link>
          ) : (
            <>
              <Link
                href="/auth"
                className="text-graphite transition-colors hover:text-charcoal"
              >
                Sign in
              </Link>
              <Link
                href="/auth"
                className="border border-charcoal bg-charcoal px-4 py-2 text-paper transition-colors hover:bg-graphite"
              >
                Start free
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
