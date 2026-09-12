import type { Metadata } from "next";
import Link from "next/link";

import { Clause, LegalLayout, LegalList } from "@/components/LegalLayout";
import {
  COMPANY_LEGAL_NAME,
  GOVERNING_STATE,
  PRODUCT_NAME,
  REFUND_WINDOW_DAYS,
  SUPPORT_EMAIL,
} from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms of Service — SquareRate",
  description:
    "The terms covering your use of SquareRate, including subscriptions, refunds, and measurement-accuracy limitations.",
};

export default function TermsPage() {
  return (
    <LegalLayout
      title="Terms of Service"
      intro={`These terms are an agreement between you and ${COMPANY_LEGAL_NAME}, a ${GOVERNING_STATE} limited liability company doing business as ${PRODUCT_NAME} ("we", "us"). By creating an account or using the service you agree to them. If you're accepting on behalf of a company, you confirm you're authorized to bind it.`}
    >
      <Clause n={1} title="What SquareRate does">
        <p>
          SquareRate estimates the area and perimeter of surfaces — roofs,
          pavement, decking, pools and lawns — from aerial and satellite imagery
          of an address you provide. You can run an automated scan, adjust the
          result by hand, and export the figures.
        </p>
        <p>
          It is an estimating tool. It is not a survey, an inspection, or an
          engineering service, and we are not acting as your surveyor, engineer
          or contractor.
        </p>
      </Clause>

      <Clause n={2} title="Your account">
        <LegalList
          items={[
            "You must be at least 18 and able to enter a binding contract.",
            "Give us accurate information and keep it current.",
            "You're responsible for activity under your account and for keeping your credentials safe. Tell us promptly if you think someone else has access.",
            "One account per person or business unless we agree otherwise in writing. Don't share logins to stretch a scan allowance across crews — that's what the Pro Crew plan is for.",
          ]}
        />
      </Clause>

      <Clause n={3} title="Free trial">
        <p>
          New accounts get five free scans. They do not expire and they do not
          renew — once they&rsquo;re used, scanning stops until you subscribe. No
          card is required to start, and we won&rsquo;t charge you unless you
          choose a plan.
          The trial is one per customer; creating extra accounts to get more free
          scans is a breach of these terms.
        </p>
      </Clause>

      <Clause n={4} title="Plans, scans and allowances">
        <p>
          Paid plans include a set number of scans each calendar month. A scan
          means one automated AI measurement run on one job. Drawing or editing a
          boundary yourself, re-opening a saved job, and exporting to CSV are all
          free and don&rsquo;t draw down your allowance.
        </p>
        <LegalList
          items={[
            "Allowances reset at the start of each calendar month (UTC) and do not roll over.",
            "Annual plans are billed once per year but the scan allowance is still granted monthly — an annual Solo Crew subscription provides 100 scans each month, not 1,200 at once.",
            "If you reach your limit, scanning pauses. We will never charge you for overage without your explicit agreement first.",
            "We may change plan prices or allowances with at least 30 days' notice. Changes take effect at your next renewal, and you can cancel before then.",
          ]}
        />
      </Clause>

      <Clause n={5} title="Payment">
        <p>
          Payments are processed by Lemon Squeezy, which acts as the merchant of
          record and authorized reseller for all purchases. Your order is
          therefore with Lemon Squeezy, and their terms and privacy policy apply
          to the transaction itself. They handle billing, invoices and any sales
          tax or VAT that applies where you are.
        </p>
        <p>
          All prices are in United States dollars. Subscriptions renew
          automatically at the then-current price until cancelled. We never see
          or store your full card details.
        </p>
      </Clause>

      <Clause n={6} title="Refunds and cancellation">
        <p>
          If SquareRate isn&rsquo;t right for you, email{" "}
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="text-charcoal underline underline-offset-2"
          >
            {SUPPORT_EMAIL}
          </a>{" "}
          within {REFUND_WINDOW_DAYS} days of a charge and we&rsquo;ll refund it
          in full, no questions asked. That applies to your first payment and to
          each renewal.
        </p>
        <p>
          You can cancel at any time. Cancellation stops future billing and you
          keep access until the end of the period you&rsquo;ve already paid for.
          We don&rsquo;t prorate partial periods outside the{" "}
          {REFUND_WINDOW_DAYS}-day window.
        </p>
      </Clause>

      <Clause n={7} title="Measurement accuracy — please read this one">
        <p className="border border-charcoal bg-mist px-4 py-3 text-charcoal">
          SquareRate produces <strong>estimates</strong> derived from third-party
          aerial imagery. Those estimates can be wrong, and you must not rely on
          them as the sole basis for a binding quote, a material order, a
          structural decision, or anything else where being wrong costs money or
          creates risk.
        </p>
        <p>Accuracy is affected by things outside our control, including:</p>
        <LegalList
          items={[
            "The age of the imagery — recent construction, demolition or landscaping may not appear.",
            "Tree cover, shadow, snow, and low-resolution or oblique captures.",
            "Complex, multi-level or heavily obstructed roof geometry.",
            "Overhangs, undercuts and anything not visible from above.",
            "Elevation and slope data, which are modelled rather than directly measured.",
          ]}
        />
        <p>
          Verify measurements on site before you commit to a price or place an
          order. You are solely responsible for the bids, quotes and decisions
          you make using output from the service.
        </p>
      </Clause>

      <Clause n={8} title="Third-party imagery and data">
        <p>
          Map imagery, place data and solar/roof geometry are supplied by Google
          and other providers, and your use of them through SquareRate is subject
          to those providers&rsquo; terms. You may use the output for your own
          estimating and for quoting your customers. You may not scrape, bulk
          extract, redistribute or resell the underlying imagery or data.
        </p>
      </Clause>

      <Clause n={9} title="Your data">
        <p>
          Job data you create — addresses, coordinates, boundaries and
          measurement results — belongs to you. You grant us only the permission
          we need to host, process and display it back to you, and to keep the
          service running. We don&rsquo;t sell it. See our{" "}
          <Link
            href="/privacy"
            className="text-charcoal underline underline-offset-2"
          >
            Privacy Policy
          </Link>{" "}
          for the detail.
        </p>
      </Clause>

      <Clause n={10} title="Acceptable use">
        <p>You agree not to:</p>
        <LegalList
          items={[
            "Use the service for anything unlawful, or to measure property for an unlawful purpose.",
            "Attempt to bypass scan limits, billing, or authentication — including by calling our processing endpoints directly.",
            "Reverse engineer, resell, sublicense or white-label the service without our written agreement.",
            "Upload malicious code, or probe, scan or overload our infrastructure.",
            "Use automated means to create accounts or harvest data from the service.",
          ]}
        />
        <p>
          We may suspend or close an account that breaches this section, and
          we&rsquo;ll refund any unused prepaid time if we do so without cause.
        </p>
      </Clause>

      <Clause n={11} title="Availability">
        <p>
          We aim to keep SquareRate available but we don&rsquo;t promise
          uninterrupted service. We depend on third-party providers for imagery,
          hosting and processing, and we may need to take the service down for
          maintenance or change how features work. We&rsquo;ll give notice of
          significant changes where we reasonably can.
        </p>
      </Clause>

      <Clause n={12} title="Disclaimer of warranties">
        <p>
          The service is provided &ldquo;as is&rdquo; and &ldquo;as
          available&rdquo;. To the fullest extent permitted by law we disclaim all
          warranties, express or implied, including merchantability, fitness for a
          particular purpose, non-infringement, and any warranty as to the
          accuracy, completeness or reliability of any measurement.
        </p>
      </Clause>

      <Clause n={13} title="Limitation of liability">
        <p>
          To the fullest extent permitted by law, neither {COMPANY_LEGAL_NAME} nor
          anyone working with us is liable for indirect, incidental, special,
          consequential or punitive damages, or for lost profits, lost business,
          rework, material costs, or losses arising from an inaccurate
          measurement.
        </p>
        <p>
          Our total liability for any claim relating to the service is limited to
          the amount you paid us in the twelve months before the claim arose, or
          one hundred US dollars, whichever is greater.
        </p>
        <p>
          Some jurisdictions don&rsquo;t allow certain exclusions, so parts of
          this section may not apply to you.
        </p>
      </Clause>

      <Clause n={14} title="Indemnity">
        <p>
          You agree to indemnify and hold us harmless from claims, damages and
          reasonable costs arising out of your use of the service, your breach of
          these terms, or any bid, quote or work you produced using SquareRate
          output.
        </p>
      </Clause>

      <Clause n={15} title="Termination">
        <p>
          You may stop using the service and delete your account at any time. We
          may suspend or terminate an account for breach of these terms, or for
          non-payment. Sections covering accuracy, disclaimers, liability,
          indemnity and governing law survive termination.
        </p>
      </Clause>

      <Clause n={16} title="Changes to these terms">
        <p>
          We may update these terms. If a change is material we&rsquo;ll give
          reasonable notice by email or in the app before it takes effect.
          Continuing to use the service after that means you accept the updated
          terms.
        </p>
      </Clause>

      <Clause n={17} title="Governing law">
        <p>
          These terms are governed by the laws of the State of {GOVERNING_STATE},
          United States, without regard to its conflict-of-laws rules. The state
          and federal courts located in {GOVERNING_STATE} have exclusive
          jurisdiction over any dispute, and you and we consent to that venue.
        </p>
      </Clause>

      <Clause n={18} title="Contact">
        <p>
          {COMPANY_LEGAL_NAME}, doing business as {PRODUCT_NAME}.{" "}
          {GOVERNING_STATE}, United States. Questions about these terms go to{" "}
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="text-charcoal underline underline-offset-2"
          >
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      </Clause>
    </LegalLayout>
  );
}
