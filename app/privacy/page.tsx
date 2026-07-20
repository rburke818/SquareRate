import Link from "next/link";

import { Footer } from "@/components/Footer";
import { Logo } from "@/components/Logo";

export const metadata = {
  title: "Privacy Policy — SquareRate",
};

export default function PrivacyPage() {
  return (
    <>
      <main className="flex flex-1 flex-col">
        <header className="border-b border-line">
          <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-6 py-5">
            <Logo href="/dashboard" />
            <Link
              href="/dashboard"
              className="text-[11px] uppercase tracking-[0.18em] text-graphite transition-colors hover:text-charcoal"
            >
              Back
            </Link>
          </div>
        </header>

        <div className="mx-auto w-full max-w-3xl px-6 py-12">
          <h1 className="text-xs uppercase tracking-[0.22em] text-muted">Legal</h1>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-charcoal">
            Privacy Policy
          </h2>
          <p className="mt-6 text-sm leading-relaxed text-graphite">
            [Placeholder] SquareRate&rsquo;s privacy policy is being finalized.
            This page will describe what personal data we collect, how it is
            used and stored, the third parties we rely on, and your rights over
            your data. For any questions in the meantime, use the Contact link
            below.
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
}
