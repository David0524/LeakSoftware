import { LegalPage } from "@/components/legal-page";
import { COMPANY, SUPPORT_EMAIL } from "@/lib/site";

/**
 * Texting terms (2026-11-28): what a shop's customers agree to when they get texts from the
 * shop's Sundeck Pro number. Phone companies' campaign reviewers look for each point here: who
 * sends, how people opt in, how often, "message and data rates may apply", STOP and HELP, and
 * that mobile numbers aren't shared or sold. Each shop's campaign links to this page.
 */
export function TextingTermsBody({ inApp = false }: { inApp?: boolean }) {
  const to = (path: string) => (inApp ? `/in-app${path}` : path);
  return (
    <LegalPage title="Texting Terms" updated="November 28, 2026">
      <section>
        <h2>Who texts you</h2>
        <p>
          Pool service and leak detection companies use Sundeck Pro, made by {COMPANY.legalName}, to
          text their own customers. Each text comes from the company’s own business number and
          starts with the company’s name. Sundeck Pro carries the texts for the company; it doesn’t
          text you for itself or for anyone else.
        </p>
      </section>
      <section>
        <h2>How you agree to texts</h2>
        <p>
          You agree to get texts when you give the company your mobile number for your service, by
          phone, in person, or on the company’s website or service form, and say it’s OK to text
          you. The company records that in Sundeck Pro, with the date.
        </p>
      </section>
      <section>
        <h2>What you get, and how often</h2>
        <p>
          Texts about your service: appointment times and when a technician is on the way, links to
          your reports, quotes and invoices, and replies to your questions. How many depends on your
          service, usually a few for each visit. No marketing texts are sent under these terms.
        </p>
        <p>Message and data rates may apply.</p>
      </section>
      <section>
        <h2>Stopping texts and getting help</h2>
        <ul>
          <li>
            Reply <strong>STOP</strong> to any text to stop all texts from that company. You’ll get
            one text confirming it. Reply <strong>START</strong> to get texts again.
          </li>
          <li>
            Reply <strong>HELP</strong> for help, or contact the company directly. You can also
            write to{" "}
            <a className="text-link underline" href={`mailto:${SUPPORT_EMAIL}`}>
              {SUPPORT_EMAIL}
            </a>
            .
          </li>
          <li>Phone companies aren’t responsible for texts that are delayed or not delivered.</li>
        </ul>
      </section>
      <section>
        <h2>Your privacy</h2>
        <p>
          Mobile numbers and consent to receive texts are never shared with or sold to third parties
          or affiliates for marketing or promotional purposes. Twilio carries the texts only to
          deliver them. Our{" "}
          <a className="text-link underline" href={to("/privacy")}>
            Privacy Policy
          </a>{" "}
          says what else we keep and why.
        </p>
      </section>
    </LegalPage>
  );
}
