import type { Metadata } from "next";
import Link from "next/link";

import { Clause, LegalLayout, LegalList } from "@/components/LegalLayout";
import {
  COMPANY_LEGAL_NAME,
  DATA_DELETION_WINDOW_DAYS,
  GOVERNING_STATE,
  PRODUCT_NAME,
  SUPPORT_EMAIL,
} from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy Policy — SquareRate",
  description:
    "What SquareRate collects, why, who processes it, how long we keep it, and how to get it deleted.",
};

export default function PrivacyPage() {
  return (
    <LegalLayout
      title="Privacy Policy"
      intro={`This explains what ${COMPANY_LEGAL_NAME}, doing business as ${PRODUCT_NAME}, collects when you use the service, why we collect it, and what control you have over it. We've tried to write it in plain language rather than lawyer's English.`}
    >
      <Clause n={1} title="The short version">
        <p>
          We collect the minimum we need to run the product: an email address to
          identify your account, the job data you create, and a count of the
          scans you&rsquo;ve used so we can apply your plan. We never see your
          card details. We don&rsquo;t sell your data, and we don&rsquo;t use it
          for advertising.
        </p>
      </Clause>

      <Clause n={2} title="What we collect">
        <p className="font-medium text-charcoal">Account information</p>
        <p>
          Your email address and an authentication identifier. If you sign in
          with Google, we receive the email address and basic profile
          information associated with that Google account. We do not receive or
          store your Google password.
        </p>

        <p className="mt-4 font-medium text-charcoal">Job data</p>
        <p>
          The addresses you look up, their coordinates, the surface type you
          select, the boundaries drawn on the map (by you or by the AI), and the
          resulting area, perimeter and roof-plane figures. Property addresses
          can relate to a real person, so we treat this as personal information
          even when it belongs to your customer rather than to you.
        </p>

        <p className="mt-4 font-medium text-charcoal">Usage and billing status</p>
        <p>
          Which plan you&rsquo;re on, how many scans you&rsquo;ve used in the
          current period, and subscription identifiers supplied by our payment
          provider so we can match a subscription to your account.
        </p>

        <p className="mt-4 font-medium text-charcoal">Support messages</p>
        <p>
          When you contact us or file a bug report in the app, we receive your
          message along with context that helps us reproduce the problem — your
          account email, your plan, the page you were on, and your browser and
          operating system version.
        </p>

        <p className="mt-4 font-medium text-charcoal">
          What we do <em>not</em> collect
        </p>
        <p>
          Card numbers and payment credentials never reach us — Lemon Squeezy
          handles payment collection as merchant of record. We don&rsquo;t run
          advertising trackers or third-party analytics profiling.
        </p>
      </Clause>

      <Clause n={3} title="Why we use it">
        <LegalList
          items={[
            "To create and secure your account, and to sign you in.",
            "To run measurements and store the results so you can come back to them.",
            "To apply your plan's scan allowance and process your subscription.",
            "To answer support requests and fix bugs you report.",
            "To send service messages — billing notices, material changes to these policies, security issues. We don't send marketing email unless you ask for it.",
            "To protect the service from abuse, fraud and misuse.",
          ]}
        />
      </Clause>

      <Clause n={4} title="Who processes it for us">
        <p>
          We use a small number of providers to operate the service. Each
          receives only what it needs for its role, and each is bound by its own
          terms and security obligations.
        </p>
        <LegalList
          items={[
            <>
              <strong>Google (Firebase Authentication, Cloud Firestore)</strong> —
              account authentication and storage of your account and job data.
            </>,
            <>
              <strong>Google Maps Platform</strong> — address autocomplete, map
              imagery, and roof geometry via the Solar API. Addresses you search
              are sent to Google to return results.
            </>,
            <>
              <strong>Modal</strong> — runs the image-segmentation model that
              detects surface boundaries. Receives an image crop of the property
              and its coordinates, not your identity.
            </>,
            <>
              <strong>n8n</strong> — orchestrates the scan pipeline and routes
              support messages to our inbox.
            </>,
            <>
              <strong>Lemon Squeezy</strong> — payment processing as merchant of
              record. They collect your billing details directly; we receive only
              subscription status and identifiers.
            </>,
          ]}
        />
      </Clause>

      <Clause n={5} title="Cookies and local storage">
        <p>
          We use browser storage for one thing: keeping you signed in. Firebase
          Authentication stores a session token on your device so you don&rsquo;t
          have to log in on every visit. There are no advertising or
          cross-site-tracking cookies. Clearing your browser storage signs you
          out.
        </p>
      </Clause>

      <Clause n={6} title="How long we keep it">
        <p>
          Account and job data are kept for as long as your account is open, so
          your job history stays where you left it.
        </p>
        <p>
          When you delete your account — or ask us to delete it — we remove your
          account record and your job data within{" "}
          {DATA_DELETION_WINDOW_DAYS} days. Backups age out shortly after that.
          We may retain a minimal record of transactions where tax or accounting
          law requires it, and anonymised, non-identifying operational counts.
        </p>
      </Clause>

      <Clause n={7} title="Your choices">
        <LegalList
          items={[
            "Access — ask us for a copy of what we hold about you.",
            "Correction — your email is editable from your account; email us for anything else.",
            "Deletion — ask us to delete your account and its data.",
            "Export — job data can be exported to CSV from the dashboard at any time, without asking us.",
            "Objection — tell us if you want us to stop a particular use of your data.",
          ]}
        />
        <p>
          Email{" "}
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="text-charcoal underline underline-offset-2"
          >
            {SUPPORT_EMAIL}
          </a>{" "}
          from your account address and we&rsquo;ll action it. We don&rsquo;t
          charge for these requests and we won&rsquo;t treat you differently for
          making one.
        </p>
      </Clause>

      <Clause n={8} title="Security">
        <p>
          Traffic is encrypted in transit. Access to production data is limited
          to people who need it to run the service. Data is stored on
          Google&rsquo;s infrastructure with its access controls and encryption
          at rest.
        </p>
        <p>
          No service is perfectly secure, and we can&rsquo;t guarantee absolute
          security. If a breach affects your personal information we&rsquo;ll
          notify you and any regulator that requires it, without undue delay.
        </p>
      </Clause>

      <Clause n={9} title="Children">
        <p>
          SquareRate is a business tool and is not directed at children. We
          don&rsquo;t knowingly collect information from anyone under 18. If you
          believe a child has given us information, contact us and we&rsquo;ll
          delete it.
        </p>
      </Clause>

      <Clause n={10} title="Where your data is held">
        <p>
          We operate from the United States and our providers store and process
          data there. If you use SquareRate from outside the US, you understand
          that your information will be transferred to and processed in the US,
          where privacy laws may differ from those where you live.
        </p>
      </Clause>

      <Clause n={11} title="Changes to this policy">
        <p>
          If we change this policy materially we&rsquo;ll update the date at the
          top and give notice in the app or by email before the change takes
          effect. Our{" "}
          <Link
            href="/terms"
            className="text-charcoal underline underline-offset-2"
          >
            Terms of Service
          </Link>{" "}
          cover the rest of the relationship.
        </p>
      </Clause>

      <Clause n={12} title="Contact">
        <p>
          {COMPANY_LEGAL_NAME}, doing business as {PRODUCT_NAME}.{" "}
          {GOVERNING_STATE}, United States. Privacy questions and data requests
          go to{" "}
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
