import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { SUPPORT_EMAIL } from "@/lib/site";

export const metadata: Metadata = { title: "Privacy Policy · Tidemark" };

/** Privacy policy (M11): needed for the App Store and Google Play listings. Draft. */
export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="October 16, 2026">
      <section>
        <h2>Who this covers</h2>
        <p>
          Tidemark is software for pool service and pool leak detection shops. Shops use it to run
          service visits and inspections, send reports, quotes, and invoices, text and call their
          customers, and schedule their techs. This policy covers the shop’s team (owners and techs)
          and the shop’s customers whose information the shop keeps in Tidemark.
        </p>
      </section>
      <section>
        <h2>What we keep</h2>
        <ul>
          <li>Team accounts: name, email, and sign-in details.</li>
          <li>
            Shop records the shop enters: customers’ names, phone numbers, emails, and pool
            addresses; visit plans, service checklists, and water readings; inspection checklists,
            tests, findings, photos, videos, voice notes and their transcripts, signatures, reports,
            quotes, invoices, and payments.
          </li>
          <li>
            Texts and calls between the shop’s number and its customers: messages, pictures, call
            times, and voicemails.
          </li>
          <li>
            Where photos were taken, when the tech allows location, so reports show they were taken
            on site.
          </li>
          <li>Error reports from the app and website, without customer details.</li>
        </ul>
        <p>We don’t sell personal information and don’t use it for advertising.</p>
      </section>
      <section>
        <h2>Who owns it</h2>
        <p>
          Each shop owns its records. Tidemark stores and processes them for the shop. Other shops
          can’t see them.
        </p>
      </section>
      <section>
        <h2>Services we use</h2>
        <ul>
          <li>Supabase: database, sign-in, and file storage (United States).</li>
          <li>Vercel: hosting the website.</li>
          <li>Stripe: card and bank payments; card numbers never reach Tidemark.</li>
          <li>Resend: sending report, quote, and invoice emails.</li>
          <li>Anthropic: writing report drafts from inspection data, when the shop uses it.</li>
          <li>Deepgram: turning voice notes into text.</li>
          <li>Twilio: the shop’s phone number, texts, calls, and voicemail.</li>
          <li>Mapbox: placing pool addresses on the map and planning routes.</li>
          <li>Sentry: error reports.</li>
        </ul>
      </section>
      <section>
        <h2>How we protect it</h2>
        <p>
          Each shop’s records are walled off in the database, phones store them encrypted, customer
          links expire, and anyone can add two-step sign-in. The details are on our{" "}
          <a className="text-link underline" href="/security">
            Security
          </a>{" "}
          page.
        </p>
      </section>
      <section>
        <h2>How long we keep it</h2>
        <p>
          While the shop uses Tidemark. Sent reports and original photos aren’t changed after the
          fact, so the record stays trustworthy. When a shop leaves, its data is deleted on request.
        </p>
      </section>
      <section>
        <h2>Your choices</h2>
        <ul>
          <li>
            Team members can delete their account in the app (Settings) or on the website (More).
          </li>
          <li>Customers can stop reminder and review emails with the link in any email.</li>
          <li>
            To see, correct, or delete what a shop keeps about you, ask the shop or write to{" "}
            <a className="text-link underline" href={`mailto:${SUPPORT_EMAIL}`}>
              {SUPPORT_EMAIL}
            </a>
            .
          </li>
        </ul>
      </section>
    </LegalPage>
  );
}
