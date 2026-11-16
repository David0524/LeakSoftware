// WANT (website shots, once the catalog exists): sign-up — /sign-up; welcome — /welcome (team size and
// card); settings-company — /settings/company (logo and colors); home-getting-started — the
// Getting Started panel.
import type { ChapterDef } from "../types";
import {
  FromTheField,
  Gallery,
  Meta,
  Note,
  Path,
  Phone,
  Scene,
  Section,
  Spread,
  Steps,
  Step,
  Tip,
  Ui,
  Watch,
  WhyItMatters,
  UseIt,
} from "../kit";

export const dayOne: ChapterDef = {
  id: "day-one",
  title: "Day one",
  moment: { pool: "Sunday · 7:30 p.m.", leak: "Sunday · 7:30 p.m." },
  lede: {
    pool: "Dana sets Canyon State up in one evening: an account, a company that looks like hers, and the apps on three phones. Here is what she does, in the order she does it.",
    leak: "Dana sets Canyon State up in one evening: an account, a company that looks like hers, a sample report in her own inbox, and the app on two phones. Here is what she does, in the order she does it.",
  },
  learn: {
    pool: [
      "Start a free trial and pick your package",
      "Set your company details, logo and colors",
      "Follow the Getting Started checklist",
      "Put the apps on your techs’ phones and sign in",
    ],
    leak: [
      "Start a free trial and pick your package",
      "Set your company details, logo and colors",
      "Send yourself the sample report",
      "Put the app on your techs’ phones and sign in",
    ],
  },
  Body: ({ edition }) => (
    <>
      <Scene time="Sunday, 7:30 p.m.">
        <p>
          The kids are in bed. Dana puts her laptop on the kitchen table, opens a browser and types
          the address from the card in her truck.
        </p>
        <p>
          {edition === "pool"
            ? "Monday morning, three techs will start their routes. She has until then to get the shop into the system, and she wants to do it once, properly, instead of fixing it in pieces all month."
            : "Tomorrow she has a detection in Mesa and Jake is riding along. She wants the shop set up before then, so the first report that goes out already looks like Canyon State."}
        </p>
      </Scene>

      <Section kicker="Step one" title="Start the trial">
        <Meta who={["Owner"]} where={["Website"]} />
        <p>
          The account starts on the website, at <Ui>Start Free Trial</Ui>. One form makes both
          Dana’s sign-in and the company. The package she picks decides which screens, checklists
          and settings the shop gets, so a shop that does one kind of work isn’t buried in tools for
          the other.
        </p>
        <Steps>
          <Step title="Fill in the form">
            <p>
              <Ui>Your name</Ui>, <Ui>Company name</Ui>, <Ui>Email</Ui>, <Ui>Mobile phone</Ui> and a{" "}
              <Ui>Password</Ui>. The password needs at least 10 characters with an uppercase letter,
              a lowercase letter, a number and a symbol; a checklist under the box ticks them off as
              she types.
            </p>
          </Step>
          <Step title="Choose what the shop does">
            <p>
              Under <Ui>Your shop does</Ui>, Dana picks{" "}
              <Ui>{edition === "pool" ? "Pool Care" : "Leak Detection"}</Ui>. The three choices are{" "}
              <Ui>Pool Care</Ui>, <Ui>Leak Detection</Ui> and <Ui>Both</Ui>.{" "}
              {edition === "pool"
                ? "Pool Care brings cleaning routes, maintenance plans, the service checklist, the chemical calculator, repair quotes and monthly billing, and hides leak detection."
                : "Leak Detection brings leak detection jobs, tests, findings, reports and repair quotes, and hides cleaning plans and monthly billing."}
            </p>
          </Step>
          <Step title="Press Start Free Trial">
            <p>
              Sundeck Pro emails a link to confirm the address. It works on any phone or computer,
              once, for an hour.
            </p>
          </Step>
          <Step title="Pick the team size and add a card">
            <p>
              The next page shows the price for the package and a <Ui>People on your team</Ui>{" "}
              stepper. Owners, office staff and techs each count as one. The price follows the
              number as she taps it, and the page says the date the trial ends. A credit card is
              required to start, and it isn’t charged during the 30 days.
            </p>
          </Step>
        </Steps>
        <Note title="The card, and what happens without it">
          Until a card is in, the shop is read-only. If you cancel before the trial ends, in{" "}
          <Path items={["Settings", "Sundeck Pro Billing"]} />, you are never charged. Billing is a
          website page only; the apps show no prices and take no card.
        </Note>
        <p>
          The last page, <Ui>You’re All Set</Ui>, lists where to start:{" "}
          {edition === "pool"
            ? "invite your techs, add your customers and their pools, set up customer payments."
            : "invite your techs, set up customer payments, book your first job."}
          {edition === "leak"
            ? " It also has a button that Dana has been waiting for: See Your Sample Report."
            : ""}
        </p>
      </Section>

      {edition === "leak" ? (
        <Section kicker="The first win" title="Send yourself a report">
          <p>
            Every new leak detection shop gets one finished sample job on Today, with the shop’s own
            name and logo on it. It is there so the owner can see what a homeowner will receive
            before anyone has to earn it.
          </p>
          <Steps>
            <Step title="Open the sample job">
              <p>
                From <Ui>You’re All Set</Ui>, press <Ui>See Your Sample Report</Ui>, or open the job
                marked Sample on Today.
              </p>
            </Step>
            <Step title="Send it to yourself">
              <p>
                Press <Ui>Send Yourself This Report</Ui>. It goes only to the signed-in person, so
                no customer ever gets it.
              </p>
            </Step>
          </Steps>
          <Tip title="Open it on your phone">
            Dana opens the email on her phone, the way a homeowner will. If the report reads well
            there, it reads well anywhere.
          </Tip>
          <Note title="It never counts">
            The sample job is left out of every number and can be deleted. Once it’s deleted, it’s
            gone for good.
          </Note>
        </Section>
      ) : null}

      <Section kicker="Step two" title="Make it look like Canyon State">
        <Meta who={["Owner", "Admin"]} where={["Website", "iPhone", "Android"]} />
        <Spread
          figure={
            <Phone
              src="49-settings-company-branding"
              alt="The Company and Branding settings page: company profile fields, reminders and reviews, job numbers, and the Branding group with Logo, Main color and Accent color."
              caption="Company and Branding: the profile on top, the logo and colors at the bottom."
              full
            />
          }
        >
          <p>
            Reports, quotes and invoices go out under the shop’s own name, so this page is worth
            five minutes. Dana opens <Path items={["Settings", "Company and Branding"]} />.
          </p>
          <p>
            <strong>The profile</strong> is the company name, a legal name if invoices should carry
            a different one, phone, email, address and <Ui>Time zone</Ui>. The time zone sets every
            time on the schedule, so she checks it says Phoenix. A <Ui>Review link</Ui> (the Google
            or Yelp page) lets Sundeck Pro ask for a review after a job is paid.
          </p>
          <p>
            <strong>The branding</strong> is a <Ui>Logo</Ui> (PNG, JPEG or SVG, under 2 MB; a wide
            one works best), a <Ui>Main color</Ui> and an optional <Ui>Accent color</Ui>. Choose a
            logo and the page suggests a main color taken from it, under “From your logo”. A{" "}
            <Ui>Report header</Ui> strip shows the result at once.
          </p>
        </Spread>
        <Watch title="Light colors, dark text">
          Documents put dark text on the main color, so pick one that text can sit on. If the strip
          looks hard to read, it will be hard to read on the report too.
        </Watch>
        <p>
          The whole page has one <Ui>Save</Ui> button for everything on it. A logo uploads when the
          phone has signal. Reports and quotes that were already sent keep the logo and color they
          went out with.
        </p>
        <FromTheField title="Same logo, three places">
          Dana uploads the logo once. It shows at the top of the{" "}
          {edition === "pool" ? "visit report" : "leak report"}, on the quote, and on the invoice,
          so a homeowner who sees all three knows they came from the same shop.
        </FromTheField>
      </Section>

      <Section kicker="Step three" title="The checklist that follows her around">
        <p>
          Once she’s in, Dana sees a small panel called <Ui>Getting Started</Ui> (a card at the top
          of Today and the Dashboard on a phone, a panel in the corner on a wide screen). It shows
          “N of M done”, opens with one step already ticked, and ticks the rest by itself as the
          shop’s own data fills in.
        </p>
        <UseIt
          title="Canyon State’s list"
          items={
            edition === "pool"
              ? [
                  {
                    who: "Invite your techs",
                    text: "They sign in on the Sundeck Pro app. Chapter 3.",
                  },
                  {
                    who: "Add your customers and their pools",
                    text: "Import a spreadsheet, or add them one by one. Chapter 2.",
                  },
                  {
                    who: "Give each pool a visit plan",
                    text: "The day, how often, and the price per visit.",
                  },
                  {
                    who: "Set up customer payments",
                    text: "Card, Apple Pay or bank, paid to your own Stripe account.",
                  },
                  {
                    who: "Send your first invoices",
                    text: "Monthly billing is drafted from finished visits.",
                  },
                ]
              : [
                  {
                    who: "Send yourself the sample report",
                    text: "The first win, above.",
                  },
                  {
                    who: "Invite your techs",
                    text: "They sign in on the Sundeck Pro app. Chapter 3.",
                  },
                  { who: "Add your logo", text: "It goes on every report, quote and invoice." },
                  {
                    who: "Set up customer payments",
                    text: "Deposits and invoices go to your own Stripe account.",
                  },
                  {
                    who: "Book your first leak job",
                    text: "Inspect it on the phone. Chapter 4.",
                  },
                  {
                    who: "Send your first report",
                    text: "Finished on site and sent to the homeowner.",
                  },
                ]
          }
        />
        <p>
          Press <Ui>Hide</Ui> to put the panel away; it also goes by itself when every step is done.
          On a wide screen it remembers whether you left it open.
        </p>
        <Tip title="Payments are one setup, once">
          <Ui>Set up customer payments</Ui> connects a Stripe account so customers can pay by card
          or bank. The shop is the seller and the money goes straight to its own Stripe account. It
          lives in <Path items={["Settings", "Payments and Deposits"]} />, and only the owner can
          connect it. Customers can still accept a quote before it’s connected.
        </Tip>
      </Section>

      <Section kicker="Step four" title="Put the app on the phones">
        <Meta where={["iPhone", "Android"]} />
        <p>
          Dana searches <Ui>Sundeck Pro</Ui> in the App Store on her iPhone, and her Android techs
          find it in Google Play. Everyone signs in with the same email and password they use on the
          website.
        </p>
        <Gallery caption="Left: signing up inside the app, which is for people joining a team. Right: the code screen, for anyone with two-step sign-in on.">
          <Phone
            src="01-sign-up"
            alt="The app's Create an Account screen: Name, Email, Password with a strength checklist, How did you hear about us, and a Create Account button."
            caption="Create an Account"
          />
          <Phone
            src="07-code"
            alt="The Enter Your Code screen: a Code field and a Continue button."
            caption="Enter Your Code"
          />
        </Gallery>
        <p>
          Dana already has an account, so she taps <Ui>Sign In</Ui>. A tech who has been invited
          taps <Ui>Create an Account</Ui> instead and uses the invited email address (Chapter 3). If
          the shop’s card isn’t in yet, the app holds an owner on{" "}
          <Ui>Finish Setting Up Your Account</Ui> and tells them to finish on the website. It shows
          no link or price; the card is a website-only step.
        </p>
        <Note title="Two-step sign-in">
          For a second lock, open <Path items={["More", "Two-Step Sign-In"]} />. It opens a website
          page: scan the code with an authenticator app, type the six-digit code, and press{" "}
          <Ui>Turn On Two-Step Sign-In</Ui>. After that, signing in asks for the code. It’s per
          person and optional, and it covers the apps too, so a stolen password alone opens nothing.
        </Note>
      </Section>

      <WhyItMatters
        title="Why one evening is enough"
        figures={[
          { value: "30", label: "days free, card in, nothing charged" },
          { value: "1", label: "place the logo is set, for every document" },
        ]}
      >
        {edition === "pool"
          ? "The shop’s details are typed once. After tonight, every visit report and invoice that goes out carries Canyon State’s name, logo and colors, and nobody has to remember to add them."
          : "The shop’s details are typed once. After tonight, every report, quote and invoice that goes out carries Canyon State’s name, logo and colors, and the owner has already seen what a homeowner will get."}
      </WhyItMatters>
    </>
  ),
};
