import type { Metadata } from "next";
import Link from "next/link";

import { Footer } from "@/components/Footer";
import { LandingNav } from "@/components/LandingNav";
import { Pricing } from "@/components/Pricing";

export const metadata: Metadata = {
  title: "SquareRate — Measure any job before you leave the driveway",
  description:
    "SquareRate measures roofs, driveways, decks, pools and lawns straight off the map. Drop an address, get the square footage you need to bid. 5 free scans, no credit card.",
  openGraph: {
    title: "SquareRate — Measure any job before you leave the driveway",
    description:
      "Roof, pavement, decking, pool and lawn measurements from an address. Built for trades and contractors.",
    siteName: "SquareRate",
    type: "website",
  },
};

const STEPS = [
  {
    n: "01",
    title: "Drop the address",
    body: "Type the address the way you'd say it. We pull up the property and center the map on it.",
  },
  {
    n: "02",
    title: "Run the scan",
    body: "The AI finds the surface and traces its boundary. Nudge any corner if you want it tighter.",
  },
  {
    n: "03",
    title: "Price the job",
    body: "Area, perimeter, and for roofs a plane-by-plane breakdown with pitch. Export the lot to CSV.",
  },
];

const SURFACES = [
  { name: "Roofs", detail: "Plane-by-plane area, pitch and azimuth" },
  { name: "Pavement", detail: "Driveways, lots, aprons and walkways" },
  { name: "Decking", detail: "Decks, patios and raised platforms" },
  { name: "Pools", detail: "Water surface and surround" },
  { name: "Lawns", detail: "Turf, sod and irrigation coverage" },
];

const FAQS = [
  {
    q: "What counts as a scan?",
    a: "One AI measurement run on one job. Drawing a boundary by hand, editing it afterwards, re-opening a finished job and exporting to CSV are all free — you're only charged when the AI does the work.",
  },
  {
    q: "What happens if I run out mid-month?",
    a: "Scanning pauses until your allowance resets on the 1st, or you can move up a plan and carry on the same day. Nothing you've already measured is touched, and we'll never bill you for going over without asking first.",
  },
  {
    q: "How accurate is it?",
    a: "Accurate enough to bid from and to rule jobs in or out without driving across town. It is an estimating aid built on aerial imagery, not a substitute for physical verification — check anything critical on site before you commit to a number.",
  },
  {
    q: "Can I cancel?",
    a: "Any time, from your account. You keep access until the end of the period you've paid for, and there's a 14-day refund if it isn't for you.",
  },
];

export default function LandingPage() {
  return (
    <>
      <LandingNav />

      <main className="flex flex-1 flex-col">
        {/* Hero */}
        <section className="border-b border-line">
          <div className="mx-auto w-full max-w-6xl px-6 py-20 sm:py-28">
            <p className="text-[11px] uppercase tracking-[0.22em] text-muted">
              For trades and contractors
            </p>
            <h1 className="mt-5 max-w-3xl text-4xl font-semibold leading-[1.1] tracking-tight text-charcoal sm:text-6xl">
              Measure any job before you leave the driveway
            </h1>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-graphite">
              SquareRate measures roofs, driveways, decks, pools and lawns
              straight off the map. Drop in an address, get square footage you
              can bid on — in about the time it takes to write the address down.
            </p>

            <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                href="/auth"
                className="bg-charcoal px-8 py-4 text-center text-sm font-medium uppercase tracking-[0.18em] text-paper transition-colors hover:bg-graphite"
              >
                Start with 5 free scans
              </Link>
              <Link
                href="#pricing"
                className="border border-charcoal px-8 py-4 text-center text-sm font-medium uppercase tracking-[0.18em] text-charcoal transition-colors hover:bg-mist"
              >
                See pricing
              </Link>
            </div>

            <p className="mt-5 text-[11px] uppercase tracking-[0.18em] text-muted">
              No credit card · No contract · Cancel anytime
            </p>
          </div>
        </section>

        {/* How it works */}
        <section className="border-b border-line">
          <div className="mx-auto w-full max-w-6xl px-6 py-20">
            <h2 className="text-[11px] uppercase tracking-[0.22em] text-muted">
              How it works
            </h2>
            <div className="mt-10 grid gap-px border border-line bg-line sm:grid-cols-3">
              {STEPS.map((step) => (
                <div key={step.n} className="bg-paper p-8">
                  <span className="font-mono text-[11px] tracking-[0.18em] text-muted">
                    {step.n}
                  </span>
                  <h3 className="mt-4 text-lg font-medium tracking-tight text-charcoal">
                    {step.title}
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-graphite">
                    {step.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Surfaces */}
        <section className="border-b border-line bg-bone">
          <div className="mx-auto w-full max-w-6xl px-6 py-20">
            <div className="max-w-2xl">
              <h2 className="text-[11px] uppercase tracking-[0.22em] text-muted">
                What it measures
              </h2>
              <p className="mt-5 text-2xl font-semibold tracking-tight text-charcoal sm:text-3xl">
                Five surface types, one workflow, every plan
              </p>
              <p className="mt-4 text-sm leading-relaxed text-graphite">
                We don&rsquo;t gate surfaces behind tiers. Whichever plan
                you&rsquo;re on, you get the whole toolset — the only difference
                is how many scans you run each month.
              </p>
            </div>

            <dl className="mt-12 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
              {SURFACES.map((surface) => (
                <div key={surface.name} className="border-t border-line pt-5">
                  <dt className="text-sm font-medium tracking-tight text-charcoal">
                    {surface.name}
                  </dt>
                  <dd className="mt-2 text-sm leading-relaxed text-graphite">
                    {surface.detail}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="scroll-mt-20 border-b border-line py-20">
          <Pricing />
        </section>

        {/* FAQ */}
        <section className="border-b border-line">
          <div className="mx-auto w-full max-w-3xl px-6 py-20">
            <h2 className="text-[11px] uppercase tracking-[0.22em] text-muted">
              Common questions
            </h2>
            <dl className="mt-10 space-y-8">
              {FAQS.map((faq) => (
                <div key={faq.q} className="border-t border-line pt-6">
                  <dt className="text-base font-medium tracking-tight text-charcoal">
                    {faq.q}
                  </dt>
                  <dd className="mt-3 text-sm leading-relaxed text-graphite">
                    {faq.a}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* Closing CTA */}
        <section className="bg-charcoal">
          <div className="mx-auto w-full max-w-6xl px-6 py-20 text-center">
            <h2 className="text-3xl font-semibold tracking-tight text-paper sm:text-4xl">
              Five scans, on us
            </h2>
            <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-line">
              Enough to run it on a real job and see whether the number holds up.
              No card, no call, no contract.
            </p>
            <Link
              href="/auth"
              className="mt-10 inline-block bg-paper px-8 py-4 text-sm font-medium uppercase tracking-[0.18em] text-charcoal transition-colors hover:bg-mist"
            >
              Create your account
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
