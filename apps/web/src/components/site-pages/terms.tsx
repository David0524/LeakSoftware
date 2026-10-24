import { LegalPage } from "@/components/legal-page";
import { COMPANY, SUPPORT_EMAIL } from "@/lib/site";

/** Terms of service: the App Store and Google Play listings and the apps' More screens link here. */
export function TermsBody({ inApp = false }: { inApp?: boolean }) {
  const to = (path: string) => (inApp ? `/in-app${path}` : path);
  return (
    <LegalPage title="Terms of Service" updated="October 24, 2026">
      <section>
        <h2>The service and who these terms are with</h2>
        <p>
          Sundeck Pro is software for pool service and pool leak detection shops: a website for the
          office and an app for iPhone and Android. It is provided by {COMPANY.legalName}, a{" "}
          {COMPANY.state} limited liability company (“Sundeck Pro”, “we”). These terms are between
          us and the shop that signs up (“you”). Whoever signs up for a shop confirms they are at
          least 18 and may accept these terms for it. Everyone the shop invites uses Sundeck Pro
          under the shop’s account and these terms, and the shop is responsible for what they do in
          it.
        </p>
      </section>
      <section>
        <h2>Accounts</h2>
        <p>
          Keep sign-in details to yourself, and tell us at {SUPPORT_EMAIL} if you think someone else
          is using your account. The shop’s owners decide who is on its team and what each person
          can do, and can remove anyone at any time.
        </p>
      </section>
      <section>
        <h2>Trial and billing</h2>
        <ul>
          <li>
            A new shop gets a 30-day free trial. A card is needed to start it, and the subscription
            begins when the trial ends unless the owner cancels first. Subscriptions are bought on
            the Sundeck Pro website, not in the apps.
          </li>
          <li>
            The price is monthly and depends on the shop’s package and how many active team members
            it has. Adding or removing people changes the price from then on, prorated. Prices don’t
            include taxes, which are added where they apply.
          </li>
          <li>
            The owner can cancel at any time on the website (Settings › Sundeck Pro Billing).
            Service continues to the end of the paid month; we don’t refund partial months.
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
          recommendations, quotes, and prices in what it sends, and for having the right to collect
          and use its customers’ information. Sundeck Pro organizes and sends what the shop’s team
          enters; the tech reviews and approves every report before it goes to a customer.
          Calculators (such as pressure tests, chemical doses, and drive times) are aids, and the
          shop remains responsible for its own professional judgment.
        </p>
        <p>
          You give us permission to store, process, and send the shop’s records only to provide and
          support Sundeck Pro, as the{" "}
          <a className="text-link underline" href={to("/privacy")}>
            Privacy Policy
          </a>{" "}
          describes. After the shop cancels, it keeps read-only access to its records. The owner can
          ask us to delete them, as the Privacy Policy describes.
        </p>
      </section>
      <section>
        <h2>Payments from your customers</h2>
        <p>
          Customer payments go straight to the shop’s own Stripe account, under Stripe’s terms
          between Stripe and the shop. Sundeck Pro doesn’t hold shop funds and isn’t a party to the
          shop’s sales, refunds, or disputes with its customers.
        </p>
      </section>
      <section>
        <h2>Texts, calls, and emails</h2>
        <p>
          The shop texts, calls, and emails only customers who have agreed to hear from it, honors
          STOP replies and unsubscribe requests (Sundeck Pro handles both automatically), and
          follows the laws and carrier rules for business texting, calls, and email. Sundeck Pro
          pays for the shop’s company number, texts, and calls, within daily limits that keep the
          service fair for every shop.
        </p>
      </section>
      <section>
        <h2>Fair use</h2>
        <p>
          Don’t use Sundeck Pro to break the law, send unwanted messages, upload anything you don’t
          have the right to, try to reach another shop’s data, probe or overload the service, or
          copy it to build a competing one. We may suspend a shop that does, and tell the owner why.
        </p>
      </section>
      <section>
        <h2>Our software</h2>
        <p>
          Sundeck Pro, its apps, and its designs belong to us. While the shop’s subscription (or
          trial) is active, its team may use them for the shop’s business. If you send us ideas or
          feature requests, we may use them without owing you anything.
        </p>
      </section>
      <section>
        <h2>The apps from the App Store and Google Play</h2>
        <ul>
          <li>
            These terms are between you and Sundeck Pro, not Apple or Google. We, not they, are
            responsible for the apps, their support, and any claims about them, such as product
            liability, legal compliance, or intellectual property.
          </li>
          <li>
            You may use the iPhone app on Apple devices you own or control, as Apple’s Media
            Services Terms allow. Apple has no duty to support or maintain it. If the app fails to
            meet a warranty that applies, you may tell Apple, and Apple may refund the price paid
            for the app (it is free); Apple has no other warranty duty for it.
          </li>
          <li>
            Apple and its subsidiaries are third-party beneficiaries of these terms and may enforce
            them against you as they relate to the iPhone app.
          </li>
          <li>
            You confirm you aren’t in a country under a U.S. government embargo and aren’t on a U.S.
            government list of prohibited or restricted parties.
          </li>
        </ul>
      </section>
      <section>
        <h2>The service as it is</h2>
        <p>
          We work to keep Sundeck Pro running, safe, and backed up, and post its status at{" "}
          <a className="text-link underline" href={to("/status")}>
            /status
          </a>
          . It is provided as it is, without guarantees that it will never be interrupted or free of
          mistakes. To the extent the law allows, we aren’t liable for indirect, incidental, or
          lost-profit damages, and our total liability is limited to what the shop paid us in the 12
          months before the claim.
        </p>
        <p>
          The shop will cover our reasonable costs from a claim brought against us because of the
          records it entered or the messages it sent through Sundeck Pro.
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
        <h2>Law and disputes</h2>
        <p>
          The laws of the State of {COMPANY.state} govern these terms, without regard to its
          conflict-of-law rules. Any dispute that can’t be settled by talking it through first is
          heard in the state or federal courts in {COMPANY.venue}, and both sides agree to those
          courts.
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
          , or by mail to {COMPANY.legalName}, {COMPANY.mailingAddress}.
        </p>
      </section>
    </LegalPage>
  );
}
