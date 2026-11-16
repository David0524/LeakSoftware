import type { ChapterDef } from "../types";
import {
  Browser,
  Flow,
  FromTheField,
  Meta,
  Note,
  Path,
  Phone,
  PullQuote,
  Scene,
  Section,
  Spread,
  Step,
  Steps,
  Sub,
  Table,
  Tip,
  Ui,
  UseIt,
  Watch,
  WhyItMatters,
} from "../kit";

export const billingDay: ChapterDef = {
  id: "billing-day",
  title: "Billing day",
  subtitle: "Monthly Billing",
  moment: "Sunday · November 1 · 7:30 a.m.",
  lede: "A month of visits becomes one invoice per customer, drafted for you, checked in one sitting and sent in one tap. No spreadsheet, no “did I bill the Ochoas for the filter clean?”",
  learn: [
    "See what’s ready to bill and what isn’t",
    "Review a draft and add a charge",
    "Send every invoice at once",
    "Set each customer’s invoice day",
    "Let invoices send themselves",
  ],
  Body: () => (
    <>
      <Scene time="Sunday, 7:30 a.m.">
        <p>
          It’s the first of the month. Dana makes coffee and opens <Ui>Invoices</Ui>. At the top of
          the page, in a group called <Ui>Monthly Billing</Ui>, there is one row: “October 2026”,
          with a count of invoices waiting and a dollar total.
        </p>
        <p>
          She didn’t build them. Every visit in October was written down at the pool, with the
          chemicals Priya added and the filter Luis cleaned, and Sundeck Pro drafted an invoice for
          each customer from that record. Dana’s job this morning is to read them, not write them.
        </p>
      </Scene>

      <Section kicker="Where the invoices come from" title="How a month becomes a bill">
        <Meta who={["Owner", "Admin"]} where={["Website", "iPhone", "Android"]} />
        <p>Each month, every customer gets one draft invoice. It’s made from the month’s work:</p>
        <Flow
          stages={[
            {
              title: "Visits",
              text: "Done at the pool, written down once. A plan’s visits carry no price of their own.",
            },
            {
              title: "Drafts",
              text: "“Pool service, October”, plus charges, priced cleanings, and chemicals if you charge for them.",
            },
            {
              title: "You review",
              text: "Open any draft, remove a line, add a charge.",
            },
            {
              title: "Send",
              text: "Everyone gets the same month’s invoice, by email or text.",
            },
          ]}
        />
        <p>
          The line for a plan is the plan’s monthly price, and it only appears when at least one
          visit was done that month. Visits booked “just once” keep their own price. A customer with
          several plans is billed on the earliest invoice day.
        </p>
        <Note title="When the drafts get made">
          A daily run drafts each customer’s invoice on that customer’s <strong>invoice day</strong>
          . The shop’s default is the 1st. You can also draft the rest early with{" "}
          <Ui>Create Invoices</Ui>, below. A draft has no date yet: the invoice is dated when it’s
          sent.
        </Note>
      </Section>

      <Section kicker="The month page" title="October Billing">
        <p>
          Tap the month. The title reads <Ui>October Billing</Ui>, with a subtitle such as “3 to
          send · $550.00”, or “All sent” when you’re done. At the top may be a card: “2 customers
          have visits not on an invoice yet. They’re billed on their invoice day, Nov 15.” Its
          button, <Ui>Create Invoices</Ui>, drafts them now.
        </p>
        <Spread
          figure={
            <Phone
              src="46-month-billing"
              alt="October Billing: a notice about customers with visits not on an invoice yet, a To Send and Sent control, three customer rows with totals, one marked in amber No email or mobile number, and a Send 2 Invoices button."
              caption="To Send: each customer, what’s on it, how it will go, and the total. The amber row can’t be sent yet."
            />
          }
        >
          <p>
            Below is a segmented control: <Ui>To Send</Ui> and <Ui>Sent</Ui>, each with a count.
            Each row in <Ui>To Send</Ui> shows three things:
          </p>
          <ul>
            <li>
              <strong>The customer</strong> and their lines, like “Pool service · Replace skimmer
              basket · 1 more”.
            </li>
            <li>
              <strong>How it will go</strong>: by email, as “Text (555) 123-4567”, or in orange “No
              email or mobile number”.
            </li>
            <li>
              <strong>The total.</strong>
            </li>
          </ul>
          <p>
            <Ui>Sent</Ui> rows show the invoice number, its status (Sent, Paid or Overdue) and the
            date it went.
          </p>
        </Spread>
        <Browser
          src="invoices-month"
          url="sundeckpro.com/invoices/month/2026-11"
          alt="The website’s November Billing page: a To Send 7 and Sent 8 control, then a To Send list with each customer, Pool service, their email address and the total."
          caption="The same page on a computer: one row per customer, with the total on the right."
        />
      </Section>

      <Section kicker="The review" title="Open a draft">
        <p>
          Tap a row. A sheet opens with the month and the total, then <Ui>Lines</Ui>: every line on
          the invoice. This is where Dana catches things.
        </p>
        <Steps>
          <Step title="Read the lines.">
            Pool service for the plan, a filter clean Luis charged for, the chemicals Priya added
            (if your price book charges for them).
          </Step>
          <Step
            title={
              <>
                Tap <Ui>Remove</Ui> on a line that shouldn’t be there.
              </>
            }
          >
            Item lines only. The plan’s own line comes from the plan.
          </Step>
          <Step
            title={
              <>
                Tap <Ui>Add Charge</Ui> for anything missing.
              </>
            }
          >
            A part, a one-time cleaning, anything the visits didn’t capture.
          </Step>
          <Step
            title={
              <>
                Need a discount, due date or note? Tap <Ui>Open Invoice</Ui>.
              </>
            }
          >
            That opens the invoice itself.
          </Step>
        </Steps>
        <Browser
          src="invoice-detail"
          url="sundeckpro.com/invoices/month/2026-11"
          alt="A customer’s draft opened over the November Billing page: Hector Lambert, November · $145.00, Lines with Pool service, November $145.00 and a Remove button, Add Charge, an Open Invoice button and Done."
          caption="A draft opened: the lines, Remove, Add Charge and Open Invoice."
        />
        <Tip title="Fix a missing email now, not after you send">
          A row in amber says it can’t be sent: no email and no mobile number. Open the customer,
          add one, and the row turns normal. Until then, that invoice stays a draft and the others
          go without it.
        </Tip>
      </Section>

      <Section kicker="One tap" title="Send all of them">
        <p>
          At the bottom is <Ui>Send 2 Invoices</Ui>. The number is only the invoices that can go.
          Tap it and Sundeck Pro asks first:
        </p>
        <Table
          head={["It says", "It means"]}
          rows={[
            [
              <>Send 38 invoices?</>,
              "Each customer gets their October invoice now: 36 by email, 2 by text. 1 without an email or mobile number stays a draft.",
            ],
            [<Ui key="c">Cancel</Ui>, "Nothing is sent."],
            [<Ui key="s">Send</Ui>, "Sending… then “Sent 38 invoices.”"],
          ]}
        />
        <p>
          If some don’t go, the message says why for each, such as “Sent 36 invoices. 2 didn’t go.”
          Those stay in <Ui>To Send</Ui> so you can fix them and try again. Emails go out four at a
          time, and an invoice is only ever sent once.
        </p>
        <Watch title="Sending can’t be undone">
          Once an invoice is sent, the customer has it, and it’s locked. Read the lines first. A
          sent invoice can still be voided by the owner, if nothing has been paid on it (see Chapter
          12).
        </Watch>
        <Sub>The service report goes with it</Sub>
        <p>
          If your shop sends one monthly service report instead of one per visit, it goes with the
          invoice: one email or text with two links, the invoice and the report of every visit that
          month, with readings, chemicals added and photos. You choose this in{" "}
          <Path items={["Settings", "Report Templates", "Visit reports"]} /> by picking{" "}
          <Ui>Monthly</Ui>. A customer with no invoice that month gets the report alone on the 1st.
        </p>
      </Section>

      <Section kicker="Not everyone on the same day" title="Invoice day, and Send Automatically">
        <p>
          The default invoice day is the 1st, but a customer can have their own. When a plan is set
          up or edited, <Ui>Invoice day</Ui> sits under the price: <Ui>Shop Default (1st)</Ui>, or
          any day from the 1st to the 28th. It’s “the day of the next month this customer’s monthly
          invoice is drafted.” The shop’s own default lives in{" "}
          <Path items={["Settings", "Payments and Deposits", "Monthly invoices", "Invoice Day"]} />.
        </p>
        <Spread
          flip
          figure={
            <Phone
              src="50-plan-sheet"
              alt="The Maintenance Plan sheet: Repeats Weekly, first visit, tech, time, visit length, price per month, and Invoice day set to Shop Default (1st)."
              caption="On the plan: Invoice day under the price."
            />
          }
        >
          <p>
            Dana bills most customers on the 1st. A few who pay by check on the 15th get the 15th.
            Their drafts show up in <Ui>To Send</Ui> on that day, not before.
          </p>
          <Sub>Send Automatically</Sub>
          <p>
            Next to <Ui>Invoice Day</Ui> is a switch, <Ui>Send Automatically</Ui>, off to start
            with. Turn it on and Sundeck Pro drafts and sends each customer’s invoice on their
            invoice day, by email or text, with whatever charges are on it by then.
          </p>
        </Spread>
        <Browser
          src="settings-payments"
          url="sundeckpro.com/settings/payments"
          alt="The website’s Payments and Deposits settings with the Monthly invoices group: Invoice Day and the Send Automatically switch."
          caption="Settings › Payments and Deposits: the two settings that decide when invoices go."
        />
        <Note title="What automatic does and doesn’t do">
          Only drafts whose invoice day is on or after the day you switch it on go by themselves.
          There’s no backlog. An invoice that can’t go (no email or mobile number) stays in{" "}
          <Ui>To Send</Ui> with the reason: “Didn’t go on its invoice day.” The month page adds a
          line: “These also go by themselves on each customer’s invoice day. Send All sends them
          now.” On an iPhone, the Payments page opens in the browser.
        </Note>
      </Section>

      <Section kicker="Customers who pay themselves" title="Autopay on monthly invoices">
        <Meta who={["Owner", "Admin"]} where={["Website", "iPhone", "Android"]} />
        <p>
          A customer who has saved a card or bank account, and agreed to autopay, doesn’t wait for
          the invoice to be paid. When the monthly invoice is sent, Sundeck Pro charges the saved
          card or bank account right away. The email says so: “Amount due: $164.00, paid
          automatically with your Visa •••• 4242; there’s nothing to do.” Card payments carry the
          card fee, as on any Checkout. Bank accounts have none.
        </p>
        <p>
          Autopay is on for the shop from the start, and does nothing until a customer saves a card.
          Only monthly maintenance invoices are charged this way. Nothing else is charged on its
          own.
        </p>
        <Sub>When a payment fails</Sub>
        <p>
          The customer gets their normal pay link by email, the first time only. You get a
          notification on the first failure and again if the last try fails. In{" "}
          <Path items={["Settings", "Payments and Deposits"]} /> you set{" "}
          <Ui>Retry Failed Payments</Ui> (Off, or 1 to 3 more tries, 2 to start) and{" "}
          <Ui>Try Again</Ui> (every 1, 2, 3, 5 or 7 days, 3 to start). A retry only runs while the
          invoice is still owed and the customer still has autopay and a card.
        </p>
        <Note title="Turning it off">
          A customer’s page has an <Ui>Autopay</Ui> group with the status and the card, such as
          “Visa •••• 4242, Expires 04/30”. <Ui>Turn Off Autopay</Ui> stops the charges and keeps the
          card for <Ui>Charge Card on File</Ui>. <Ui>Remove Card</Ui> deletes it. Customers can’t
          turn autopay off themselves, so they ask the shop.
        </Note>
      </Section>

      <UseIt
        items={[
          {
            who: "The first-of-the-month shop",
            text: "Leave the invoice day at the 1st, review the drafts over coffee, and send them all.",
          },
          {
            who: "The “just send them” shop",
            text: "Turn on Send Automatically. Use To Send only for the ones that didn’t go.",
          },
          {
            who: "Customers who pay on their own schedule",
            text: "Give them their own invoice day, so the bill arrives the week they sit down to pay.",
          },
        ]}
      />

      <FromTheField title="From the field">
        Do the review once with Send Automatically off, as a trial run. When you’ve seen a month of
        drafts come out right, turning it on is the easy part.
      </FromTheField>

      <WhyItMatters>
        Every line on a customer’s invoice came from a visit that was written down at the pool, so
        Dana isn’t reconstructing the month from memory. The invoice and the service report arrive
        together, so the customer can see what the money paid for before they ask.
      </WhyItMatters>
      <PullQuote>The month’s work, billed from the month’s record.</PullQuote>
    </>
  ),
};
