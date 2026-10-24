import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { SUPPORT_EMAIL } from "@/lib/site";
import { sharePreview } from "@/lib/share-preview";

export const metadata: Metadata = {
  title: "Terms of Service · Sundeck Pro",
  ...sharePreview("Terms of Service · Sundeck Pro", "The terms for using Sundeck Pro."),
};

/** Terms of service: the App Store and Google Play listings link here. */
export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="October 18, 2026">
      <section>
        <h2>The service</h2>
        <p>
          Sundeck Pro (“we”) provides software for pool service and pool leak detection shops: a
          field app for techs and a website for the office. These terms are between us and the shop
          that signs up (“you”). Whoever signs up for a shop confirms they may accept these terms
          for it. Everyone the shop invites uses Sundeck Pro under the shop’s account.
        </p>
      </section>
      <section>
        <h2>Trial and billing</h2>
        <ul>
          <li>
            A new shop gets a free trial. A card is needed to start it, and the subscription begins
            when the trial ends unless the owner cancels first.
          </li>
          <li>
            The price is monthly and depends on the shop’s package and how many active team members
            it has. Adding or removing people changes the price from then on, prorated.
          </li>
          <li>
            The owner can cancel at any time in Settings › Sundeck Pro Billing. Service continues to
            the end of the paid month; we don’t refund partial months.
          </li>
          <li>
            If a payment fails and isn’t fixed, the shop becomes read-only until it is: its records
            stay, but nothing new can be added.
          </li>
          <li>
            We may change prices with at least 30 days’ notice by email; the new price applies from
            the next month after that.
          </li>
        </ul>
      </section>
      <section>
        <h2>Your records</h2>
        <p>
          The shop owns everything it enters and is responsible for it, including the findings,
          recommendations, quotes, and prices in what it sends. Sundeck Pro organizes and sends what
          the shop’s team enters; the tech reviews and approves every report before it goes to a
          customer. Calculators (such as pressure tests and chemical doses) are aids, and the shop
          remains responsible for its own professional judgment.
        </p>
        <p>
          After the shop cancels, it keeps read-only access to its records. The owner can ask us to
          delete them, as described in the{" "}
          <a className="text-link underline" href="/privacy">
            Privacy Policy
          </a>
          .
        </p>
      </section>
      <section>
        <h2>Payments from your customers</h2>
        <p>
          Customer payments go straight to the shop’s own Stripe account, under Stripe’s terms
          between Stripe and the shop. Sundeck Pro doesn’t hold shop funds and isn’t a party to the
          shop’s sales.
        </p>
      </section>
      <section>
        <h2>Texts and calls</h2>
        <p>
          The shop texts and calls only customers who have agreed to hear from it, honors STOP
          replies (Sundeck Pro does this automatically), and follows the laws and carrier rules for
          business texting and calls.
        </p>
      </section>
      <section>
        <h2>Fair use</h2>
        <p>
          Don’t use Sundeck Pro to break the law, send unwanted messages, upload anything you don’t
          have the right to, try to reach another shop’s data, or disrupt the service. We may
          suspend a shop that does, and tell the owner why.
        </p>
      </section>
      <section>
        <h2>The service as it is</h2>
        <p>
          We work to keep Sundeck Pro running, safe, and backed up, and post its status at{" "}
          <a className="text-link underline" href="/status">
            /status
          </a>
          . It is provided as it is, without guarantees that it will never be interrupted or free of
          mistakes. To the extent the law allows, we aren’t liable for indirect or lost-profit
          damages, and our total liability is limited to what the shop paid us in the 12 months
          before the claim.
        </p>
      </section>
      <section>
        <h2>Ending</h2>
        <p>
          The shop can stop at any time by canceling. We can end the service for a shop with 30
          days’ notice, or at once for a serious breach of these terms; either way the owner can get
          its records first.
        </p>
      </section>
      <section>
        <h2>Changes</h2>
        <p>
          If we change these terms, we update the date above and tell shop owners by email at least
          30 days before a change that affects them. Continuing to use Sundeck Pro after that means
          accepting the new terms.
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
