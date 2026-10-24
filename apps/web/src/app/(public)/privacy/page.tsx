import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { SUPPORT_EMAIL } from "@/lib/site";
import { sharePreview } from "@/lib/share-preview";

export const metadata: Metadata = {
  title: "Privacy Policy · Sundeck Pro",
  ...sharePreview(
    "Privacy Policy · Sundeck Pro",
    "What Sundeck Pro collects, why, and how shops and their customers stay in control.",
  ),
};

/** Privacy policy: the App Store and Google Play listings link here. */
export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="October 22, 2026">
      <section>
        <h2>Who this covers</h2>
        <p>
          Sundeck Pro is software for pool service and pool leak detection shops. Shops use it to
          run service visits and inspections, send reports, quotes, and invoices, text and call
          their customers, and schedule their techs. This policy covers the shop’s team (owners and
          techs) and the shop’s customers whose information the shop keeps in Sundeck Pro.
        </p>
      </section>
      <section>
        <h2>What we keep</h2>
        <ul>
          <li>Team accounts: name, email, phone, and sign-in details.</li>
          <li>
            If you start signing up for Sundeck Pro and don’t finish, what you entered (name,
            company, email, phone) so we can follow up. Ask us to delete it at any time.
          </li>
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
          <li>
            How each person uses the app and website: which screens they open and for how long (only
            while it’s open in front of them), the app version, what they do (such as jobs completed
            or photos taken), and errors they run into. We use it to help shops and to improve
            Sundeck Pro, and keep it for 180 days.
          </li>
          <li>
            Billing details for the shop’s Sundeck Pro subscription. Stripe keeps the card; we see
            only its brand and last four digits.
          </li>
        </ul>
        <p>
          We don’t sell or share personal information, and we don’t use it for advertising. The
          website uses only the cookies it needs to keep you signed in and remember your settings;
          there are no advertising or tracking cookies.
        </p>
      </section>
      <section>
        <h2>Who owns it</h2>
        <p>
          Each shop owns its records. Sundeck Pro stores and processes them for the shop, only to
          run the service, and other shops can’t see them. For the shop’s customers, the shop
          decides what it keeps and is the one to ask first. Our staff look at a shop’s records only
          to help the shop and its people, to keep the service safe and working, or when the law
          requires it, and each time is logged.
        </p>
      </section>
      <section>
        <h2>Services we use</h2>
        <ul>
          <li>Supabase: database, sign-in, and file storage (United States).</li>
          <li>Vercel: hosting the website.</li>
          <li>Stripe: card and bank payments; card numbers never reach Sundeck Pro.</li>
          <li>Resend: sending report, quote, and invoice emails.</li>
          <li>Deepgram: turning voice notes into text.</li>
          <li>Twilio: the shop’s phone number, texts, calls, and voicemail.</li>
          <li>Apple Maps: showing maps and suggesting addresses as you type them.</li>
          <li>Mapbox: placing pool addresses on the map and planning routes.</li>
          <li>Sentry: error reports.</li>
        </ul>
        <p>
          Each one gets only what it needs for its part and may use it only to provide that service.
          They store data in the United States.
        </p>
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
          While the shop uses Sundeck Pro. Sent reports and original photos aren’t changed after the
          fact, so the record stays trustworthy. When a shop cancels, it keeps read-only access to
          its records; the owner can ask us to delete the shop’s data, and we do so within 30 days.
          Backups are overwritten within a further 30 days. We keep what the law requires us to
          keep, such as billing records.
        </p>
      </section>
      <section>
        <h2>Your choices</h2>
        <ul>
          <li>
            Team members can delete their account in the app (Settings) or on the website (More).
          </li>
          <li>Customers can stop reminder, review and shop emails with the link in any of them.</li>
          <li>
            To see, correct, or delete what a shop keeps about you, ask the shop or write to{" "}
            <a className="text-link underline" href={`mailto:${SUPPORT_EMAIL}`}>
              {SUPPORT_EMAIL}
            </a>
            .
          </li>
        </ul>
      </section>
      <section>
        <h2>Children</h2>
        <p>Sundeck Pro is for businesses and isn’t meant for anyone under 16.</p>
      </section>
      <section>
        <h2>Changes</h2>
        <p>
          If we change this policy, we update the date above and tell shop owners by email before a
          change that affects how their records are used.
        </p>
      </section>
      <section>
        <h2>Contact</h2>
        <p>
          Questions about privacy:{" "}
          <a className="text-link underline" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      </section>
    </LegalPage>
  );
}
