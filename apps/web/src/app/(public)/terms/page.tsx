import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { SUPPORT_EMAIL } from "@/lib/site";

export const metadata: Metadata = { title: "Terms of Service · Sundeck Pro" };

/** Terms of service (M11). Draft until the owner's final text is in. */
export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="October 14, 2026">
      <section>
        <h2>The service</h2>
        <p>
          Sundeck Pro gives pool leak detection shops a field app and an office website. A shop
          subscribes monthly after a free trial; the owner can cancel at any time and keeps
          read-only access to its records.
        </p>
      </section>
      <section>
        <h2>Your records</h2>
        <p>
          The shop owns everything it enters and is responsible for it, including the findings and
          recommendations in its reports. AI-written drafts are a starting point; the tech reviews
          and approves every report before it is sent.
        </p>
      </section>
      <section>
        <h2>Payments</h2>
        <p>
          Customer payments go straight to the shop’s own Stripe account. Sundeck Pro doesn’t hold
          shop funds.
        </p>
      </section>
      <section>
        <h2>Fair use</h2>
        <p>
          Don’t use Sundeck Pro to break the law, send unwanted messages, or try to reach another
          shop’s data.
        </p>
      </section>
      <section>
        <h2>Contact</h2>
        <p>
          <a className="text-link underline" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>
        </p>
      </section>
    </LegalPage>
  );
}
