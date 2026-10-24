import Link from "next/link";
import { LegalPage } from "@/components/legal-page";
import { SUPPORT_EMAIL } from "@/lib/site";

/**
 * How Sundeck Pro protects data (owner, 2026-10-16: "How do we protect customer data. Both our
 * users and their clients"). Only what is built and running; keep it in step with the code.
 */
export function SecurityBody({ inApp = false }: { inApp?: boolean }) {
  const to = (path: string) => (inApp ? `/in-app${path}` : path);
  return (
    <LegalPage title="Security" updated="October 16, 2026">
      <p>
        Pool shops keep their customers’ names, addresses, phone numbers, photos, and payment
        records in Sundeck Pro. Here is how we keep them safe.
      </p>
      <section>
        <h2>Every shop’s records are its own</h2>
        <ul>
          <li>
            Each shop’s records are walled off in the database itself, not only in the app: a
            request for another shop’s records returns nothing, whatever asks for it.
          </li>
          <li>Automated tests check every table for this on every change we make.</li>
          <li>
            Owners and techs have different permissions. Techs can’t change settings, prices, or
            payments, and owners can limit techs to their own jobs and those customers’ messages.
          </li>
        </ul>
      </section>
      <section>
        <h2>Signing in</h2>
        <ul>
          <li>
            Two-step sign-in: anyone can add a code from an authenticator app (More › Two-Step
            Sign-In). With it on, a password alone opens nothing, on the website, in the app, or
            through our servers directly.
          </li>
          <li>
            Passwords are at least 10 characters with upper- and lowercase letters, a number and a
            symbol, and are never stored in readable form.
          </li>
          <li>Removing someone from the team ends their access to the shop’s records at once.</li>
        </ul>
      </section>
      <section>
        <h2>Phones in the field</h2>
        <ul>
          <li>The records saved on a tech’s phone are encrypted.</li>
          <li>Signing out removes the shop’s records from the phone.</li>
        </ul>
      </section>
      <section>
        <h2>Customers</h2>
        <ul>
          <li>
            Reports, quotes, and invoices are shared with a private link that can’t be guessed. A
            link stops working after 180 days, and the shop can turn one off at any time.
          </li>
          <li>
            Card and bank details go straight to Stripe and never reach Sundeck Pro. Payments are
            made to the shop’s own Stripe account.
          </li>
          <li>Customers can stop reminder emails with one click.</li>
        </ul>
      </section>
      <section>
        <h2>A record you can trust</h2>
        <ul>
          <li>A report can’t be changed once it’s sent, and original photos are kept as taken.</li>
          <li>
            Every change to a job is logged: who made it, on which device, what it was before, and
            when.
          </li>
        </ul>
      </section>
      <section>
        <h2>Where data lives</h2>
        <ul>
          <li>
            Records are stored with Supabase in the United States, encrypted on disk, and sent only
            over encrypted connections (HTTPS).
          </li>
          <li>
            Messages from our payment and phone providers are checked for a valid signature before
            we act on them. Texts and calls go only to US and Canadian numbers.
          </li>
          <li>
            The other companies we use, and what for, are listed in our{" "}
            <Link href={to("/privacy")} className="text-link underline">
              privacy policy
            </Link>
            .
          </li>
        </ul>
      </section>
      <section>
        <h2>Found a problem?</h2>
        <p>
          Write to{" "}
          <a className="text-link underline" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>
          . We read every report and reply quickly.
        </p>
      </section>
    </LegalPage>
  );
}
