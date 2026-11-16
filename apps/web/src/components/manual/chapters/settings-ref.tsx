import type { ChapterDef, PerEdition } from "../types";
import { pick } from "../types";
import type { Edition } from "../kit";
import { Browser, Note, Path, Section, Table, Tip } from "../kit";

type Row = {
  name: string;
  what: PerEdition<string>;
  who: string;
  /** Only shown for this shop type; omitted means both. */
  only?: Edition;
};

const SHOP: Row[] = [
  {
    name: "Company and Branding",
    what: {
      pool: "Your name, address, time zone and phone; the logo and colors on every document; the Pool Care, Leak Detection or Both choice; reminders by Email, Text or Both, and reviews with Ask How We Did First; and the next job number.",
      leak: "Your name, address, time zone and phone; the logo and colors on every document; the Pool Care, Leak Detection or Both choice; reminders by Email, Text or Both, and reviews with Ask How We Did First; the report disclaimer; and the next job number.",
    },
    who: "Owner and admin",
  },
  {
    name: "Team",
    what: "Invite people, set roles, turn people off, pick tech colors, decide what techs can see, and set the rules for completing a job. Only the owner changes roles and security.",
    who: "Owner and admin",
  },
  {
    name: "Import Customers (website)",
    what: {
      pool: "Bring in a CSV of customers, their pools and their visit plans from your current software.",
      leak: "Bring in a CSV of customers and their pools from your current software.",
    },
    who: "Owner and admin",
  },
  {
    name: "Scheduling and Routes",
    what: {
      pool: "Your working day and working days, job length, maintenance visit length, how far ahead maintenance is booked, the arrival window customers are told, the shop’s location, drive times, Regular cleanings, and Skip Unfinished Visits at Day’s End.",
      leak: "Your working day and working days, usual job length, the arrival window customers are told, the shop’s location, and drive times.",
    },
    who: "Owner and admin",
  },
  {
    name: "Phone and Texting",
    what: "The company number for texts and calls, photos in texts, the voicemail greeting, which phones ring, and whether On My Way goes from the company number or the tech’s phone.",
    who: "Owner and admin",
  },
];

const MONEY: Row[] = [
  {
    name: "Price Book",
    what: {
      pool: "Services, chemicals and repairs with their prices, and the Charge for Chemicals switch.",
      leak: "Detection fees and repairs with their prices, used by quotes and the repair menu.",
    },
    who: "Owner and admin",
  },
  {
    name: "Payments and Deposits (website)",
    what: {
      pool: "Stripe connection, deposits on quotes, sales tax, the card fee, Autopay with Retry Failed Payments, Offer Pay Over Time (Affirm and Klarna), and monthly invoices: the invoice day and Send Automatically.",
      leak: "Stripe connection, deposits on quotes, sales tax, the card fee, Autopay with Retry Failed Payments, and Offer Pay Over Time (Affirm and Klarna).",
    },
    who: "Owner and admin. Only the owner connects Stripe and sets the card fee.",
  },
  {
    name: "Sundeck Pro Billing (website)",
    what: "Your Sundeck Pro subscription: team size, Subscribe, and Manage Billing. This is what you pay Sundeck Pro, not what customers pay you.",
    who: "Owner only",
  },
];

const CHECKS: Row[] = [
  {
    name: "Checklist Components",
    what: {
      pool: "The questions every visit walks through, and the cleanings that are done on a schedule.",
      leak: "The Leak Inspections and Pool Inspections lists the techs work through.",
    },
    who: "Owner and admin",
  },
  {
    name: "Test Types",
    what: "The tests techs can record, and the limits for the pressure and bucket tests.",
    who: "Owner and admin",
    only: "leak",
  },
  {
    name: "Severities",
    what: "The names, pin colors and report-summary rules for findings: Minor, Moderate, Major and Critical.",
    who: "Owner and admin",
    only: "leak",
  },
  {
    name: "Exclusion Reasons",
    what: "The reasons a checklist item can be left out (N/A). The report shows the reason.",
    who: "Owner and admin",
    only: "leak",
  },
  {
    name: "Skip Reasons",
    what: "The reasons a tech picks from when a visit can’t happen: Locked Gate, Dog in Yard, Weather and the rest. Add, rename or remove them.",
    who: "Owner and admin",
    only: "pool",
  },
  {
    name: "Report Templates",
    what: {
      pool: "Visit reports: Each Visit, Monthly or Off, with automatic sending and the photo rule.",
      leak: "The Homeowner report on or off, who can send it, and Saved Reports.",
    },
    who: "Owner and admin",
  },
];

const MORE: Row[] = [
  {
    name: "Dashboard",
    what: {
      pool: "The shop’s numbers: customers, plans, money collected and owed, and charts, with Customer Feedback: the complaints customers sent with a thumbs down.",
      leak: "The shop’s numbers: customers, money collected and owed, quotes accepted, and charts, with Customer Feedback: the complaints customers sent with a thumbs down.",
    },
    who: "Owner and admin",
  },
  {
    name: "Customers",
    what: "Every customer, with search. Tap one for contact details, pools and jobs.",
    who: "Everyone",
  },
  {
    name: "Invoices",
    what: "Every invoice and receipt, with its status: Draft, Sent, Partly paid, Paid or Void.",
    who: "Everyone",
  },
  {
    name: "Activity",
    what: "The shop’s latest events. A blue dot on More means something new.",
    who: "Everyone",
  },
  {
    name: "Chemicals",
    what: "The chemical calculator: enter readings and see what to add. It works with no signal. Out of Range lists readings far outside their range in the last 30 days.",
    who: "Everyone",
    only: "pool",
  },
  {
    name: "My Profile",
    what: "Your name, mobile number, and Start My Day From: The Shop or Home.",
    who: "Everyone",
  },
  {
    name: "Notifications",
    what: {
      pool: "Which alerts reach your phone: customer texts, jobs, quotes, payments, reports, Live Activity and the start of the day. Owners and admins also get skipped visits, reported issues, customer complaints and out-of-range readings, and choose a weekly email.",
      leak: "Which alerts reach your phone: customer texts, jobs, quotes, payments, reports, Live Activity and the start of the day. Owners and admins also get reported issues and customer complaints, and choose a weekly email.",
    },
    who: "Everyone",
  },
  {
    name: "Two-Step Sign-In",
    what: "A code from an authenticator app, asked after your password. Each person chooses it. On the phone it opens the website.",
    who: "Everyone",
  },
  {
    name: "My Mobile Number",
    what: "The number your calls ring to first. Customers never see it.",
    who: "Everyone",
  },
  {
    name: "Appearance",
    what: "Light or Dark, on this device only.",
    who: "Everyone",
  },
  {
    name: "Directions",
    what: "Which map opens for directions: Automatic, Maps (Apple) or Maps (Google).",
    who: "Everyone",
  },
  {
    name: "Sync",
    what: "When your changes last reached the office, how many are waiting, and Sync Now.",
    who: "Everyone",
  },
  {
    name: "Help",
    what: "Contact Us, Call Us, System Status, Request a Feature, and the Privacy Policy and Terms of Service.",
    who: "Everyone",
  },
  {
    name: "Sign Out and Delete My Account",
    what: "Sign Out signs this phone out. Delete My Account asks you to type DELETE to confirm.",
    who: "Everyone",
  },
];

function rowsFor(list: Row[], edition: Edition) {
  return list
    .filter((r) => !r.only || r.only === edition)
    .map((r) => [r.name, pick(r.what, edition), r.who]);
}

export const settingsRef: ChapterDef = {
  id: "settings-ref",
  title: "Settings reference",
  subtitle: "every setting, one line each",
  lede: "Every page in Settings and More, what each one does, and who can use it.",
  Body: ({ edition }) => (
    <>
      <Note title="Where Settings lives">
        <p>
          On the phone, Settings is under <Path items={["More", "Settings"]} />, and only owners and
          admins see it. Everyone else who opens it reads: “Settings are for owners and admins. Ask
          one at your company if something needs to change.” On the website it is the gear at the
          far right of the top bar.
        </p>
      </Note>
      <Browser
        src="settings"
        url="sundeckpro.com/settings"
        alt="The website’s Settings page: a sidebar and a list in three groups, Your shop (Company and Branding, Team, Import Customers, Scheduling and Routes, Phone and Texting), Money (Price Book, Payments and Deposits, Sundeck Pro Billing) and Checklists and reports."
        caption="Settings on the website: the same groups as in the table below, with the gear at the far right of the top bar to open it."
      />

      <Section kicker="Settings" title="Your shop">
        <Table head={["Setting", "What it does", "Who"]} rows={rowsFor(SHOP, edition)} />
      </Section>

      <Section kicker="Settings" title="Money">
        <Table head={["Setting", "What it does", "Who"]} rows={rowsFor(MONEY, edition)} />
      </Section>

      <Section kicker="Settings" title="Checklists and reports">
        <Table head={["Setting", "What it does", "Who"]} rows={rowsFor(CHECKS, edition)} />
      </Section>

      <Section kicker="More" title="The More menu">
        <p>
          On the phone, More holds the shop’s reference pages and your own account. The website has
          the same pages, plus the account menu in the top bar.
        </p>
        <Browser
          src="more"
          url="sundeckpro.com/more"
          alt="The website’s More page: Customers, Invoices, Activity, Dashboard, Chemicals and Settings; a Your Account group with My Profile, Notifications and Two-Step Sign-In; and an On This Device group with Appearance and Directions open in."
          caption="The More page: the shop’s pages first, then Your Account, then settings for this device."
        />
        <Table head={["Setting", "What it does", "Who"]} rows={rowsFor(MORE, edition)} />
      </Section>

      <Tip title="Checklist changes wait for the next visit">
        <p>
          Checklist changes apply to new visits and jobs only. A visit or job already started keeps
          the list it was made with, so finish today’s work before you change the list.
        </p>
      </Tip>
    </>
  ),
};
