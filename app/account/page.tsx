import type { Metadata } from "next";

import { AccountSection } from "@/components/AccountSection";
import { Footer } from "@/components/Footer";

export const metadata: Metadata = {
  title: "Account — SquareRate",
};

export default function AccountPage() {
  return (
    <>
      <AccountSection />
      <Footer />
    </>
  );
}
