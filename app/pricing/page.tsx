import type { Metadata } from "next";

import { Footer } from "@/components/Footer";
import { PricingSection } from "@/components/PricingSection";

export const metadata: Metadata = {
  title: "Pricing — SquareRate",
  description:
    "Solo Crew at $49/mo for 100 scans, Pro Crew at $129/mo for 350 scans. Two months free on annual. Every plan includes every surface type.",
};

export default function PricingPage() {
  return (
    <>
      <PricingSection />
      <Footer />
    </>
  );
}
