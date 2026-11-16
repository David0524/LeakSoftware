import type { ChapterDef } from "../types";
import {
  Browser,
  Flow,
  FromTheField,
  Gallery,
  Meta,
  Note,
  Path,
  Phone,
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

export const gettingPaid: ChapterDef = {
  id: "getting-paid",
  title: "Getting paid",
  moment: { pool: "Tuesday · 6:40 p.m.", leak: "Tuesday · 10:40 a.m." },
  lede: {
    pool: "Customers pay by card or bank from the link in their invoice. A check handed to a tech at the gate is on the books before the truck leaves. Here’s how the money gets in, and how you know.",
    leak: "A homeowner pays the deposit when she accepts the quote and the balance when the repair is done. A check handed over on the deck goes on the books before the truck leaves. Here’s how the money gets in, and how you know.",
  },
  learn: [
    "Read the invoices list at a glance",
    "See what the customer sees and pays",
    "Connect Stripe, set a deposit and tax",
    "Record a cash or check payment",
    "Send a receipt, or void an invoice",
  ],
  Body: ({ edition }) => (
    <>
      {edition === "pool" ? (
        <Scene time="Tuesday, 6:40 p.m.">
          <p>
            Dana is cooking dinner when her phone buzzes: “Payment received. Salazar paid $220.00.”
            The invoice went out Sunday morning. She doesn’t open anything. She stirs the pot.
          </p>
          <p>
            By Friday most of the rest will have come in the same way. One or two will pay by check,
            which means a different kind of call.
          </p>
        </Scene>
      ) : (
        <Scene time="Tuesday, 10:40 a.m.">
          <p>
            Jake finishes the skimmer repair at Maria’s. She comes out with a checkbook. “Do I make
            it out to Dana?” She’d have paid online, she says, but the check is already written.
          </p>
          <p>
            Jake opens the job on his phone, taps <Ui>Record Payment</Ui>, and types in what Maria
            gave him. By the time he’s coiling the hose, the invoice says Paid.
          </p>
        </Scene>
      )}

      <Section kicker="The overview" title="The invoices list">
        <Meta who={["Owner", "Admin", "Tech"]} where={["Website", "iPhone", "Android"]} />
        <p>
          <Ui>Invoices</Ui> lives under <Ui>More</Ui>. The line under the title tells you the whole
          story in one sentence: “1 open · $375.00 owed”, or “Nothing owed right now.”
        </p>
        <Spread
          figure={
            <Phone
              src="46-invoices"
              alt="The Invoices list: one open invoice with the amount owed, Export Invoices and Export Payments buttons, filter pills All, Unpaid, Overdue and Drafts with counts, and a row for an invoice marked Partly paid with the balance due."
              caption="Filters with counts, and a row that says what’s still owed."
            />
          }
        >
          <p>
            Filter with the pills, each with its count: <Ui>All</Ui>, <Ui>Unpaid</Ui>,{" "}
            <Ui>Overdue</Ui>, <Ui>Drafts</Ui>, <Ui>Paid</Ui>, <Ui>Void</Ui>. <Ui>Sort</Ui> by
            Newest, Oldest, Due Date, Amount Owed, Total or Customer, or search by customer, invoice
            or job number.
          </p>
          <p>
            A row says it all: the customer, “#1025 · Job #1042”, a status such as “Partly paid ·
            $375.00 due”, and the total. Statuses: Draft, Sent, Partly paid, Paid, Void.
          </p>
          <p>
            Swipe left on an unpaid invoice for <Ui>Send Reminder</Ui>; swipe right for{" "}
            <Ui>Record Payment</Ui>. Touch and hold (or right-click) for the rest: <Ui>Open</Ui>,{" "}
            <Ui>Copy Payment Link</Ui>, <Ui>Send Receipt</Ui>, <Ui>Void…</Ui>.
          </p>
        </Spread>
        <Note title="Export">
          <Ui>Export Invoices</Ui> and <Ui>Export Payments</Ui> make a spreadsheet file, for your
          bookkeeper.
        </Note>
        <Tip title="Reminders go out on their own">
          Unpaid invoices get a reminder by default at 7, 14 and 30 days. Set the days in{" "}
          <Path items={["Settings", "Company and Branding"]} />, or send one yourself from the
          swipe.
        </Tip>
        <Browser
          src="invoices"
          url="sundeckpro.com/invoices"
          alt="The website’s Invoices page: 8 open · $1,485.00 owed, Export Invoices and Export Payments, a Monthly Billing row for November 2026, filter pills All, Unpaid, Overdue, Drafts, Paid and Void with counts, a search box and Sort, and a table of invoices with customer, status, total and balance."
          caption="On a computer: the same list, with room for the whole row."
        />
      </Section>

      <Section kicker="What the customer sees" title="The invoice page">
        <p>
          The customer doesn’t log in. The link in their email or text opens a plain page in your
          shop’s colors, with your logo. A short line at the top says where things stand: “$180.00
          due on receipt.”, “$80.00 still due.” or “Paid in full. Thank you!”
        </p>
        <p>
          The page shows <strong>Billed to</strong>, <strong>Property</strong>, the lines, then
          Subtotal, Discount, Tax, Total and <strong>Balance due</strong>. After payment it becomes{" "}
          <em>Receipt #…</em> and the button reads <Ui>Paid in Full</Ui>. Customers can download a
          PDF. These pages are always light, whatever your appearance setting.
        </p>
        <Sub>How they pay</Sub>
        <Steps>
          <Step
            title={
              <>
                The customer taps <Ui>Pay</Ui>.
              </>
            }
          >
            The button shows the amount, such as <Ui>Pay $649.00</Ui>.
          </Step>
          <Step title="Stripe’s form opens in place.">
            Card, Apple Pay, Google Pay, Link or a bank account. “Payments are handled by Stripe.
            Bank payments take a few business days to clear.”
          </Step>
          <Step title="You’re told.">
            “Payment received,” on the page for them and in a push to you.
          </Step>
        </Steps>
        <p>
          The money goes straight to your own Stripe account. Sundeck Pro never holds it. A bank
          payment “is processing” and usually clears in about four business days.
        </p>
      </Section>

      <Section kicker="Setting it up once" title="Payments, deposits and tax">
        <p>
          Everything lives in <Path items={["Settings", "Payments and Deposits"]} />, on the
          website. Owners connect Stripe and change the card fee; owners and admins set deposit and
          tax. On an iPhone, the page opens in the browser.
        </p>
        <Table
          head={["Setting", "What it does"]}
          rows={[
            [
              <Ui key="a">Set Up Payments</Ui>,
              "Connects your Stripe account. It says Continue Stripe Setup until Stripe is finished, then “Ready.” Until then, customers can still accept quotes and you can still record payments by hand.",
            ],
            [
              <Ui key="b">Pass the card fee to customers</Ui>,
              "Off by default. On, the customer chooses Pay $X by Bank (no fee) or Pay $Y by Card (fee added, spelled out). Up to 3%. Some states don’t allow it; check yours.",
            ],
            [
              <Ui key="c">Deposit on accepted quotes</Ui>,
              "A percentage of the quote or a fixed amount, with a minimum. Default: none.",
            ],
            [
              <Ui key="d">Sales tax rate (%)</Ui>,
              "Applied to price book items marked Taxable. Tax shows as its own line on quotes and invoices.",
            ],
          ]}
        />
        {edition === "leak" ? (
          <Note title="How a deposit works">
            After a customer accepts a repair quote, the quote page asks for the deposit:{" "}
            <Ui>Pay $X Deposit</Ui>. On the invoice that follows, it’s credited as “Deposit paid”,
            so the balance due is only what’s left. If a deposit paid by bank is still clearing, the
            invoice waits for it.
          </Note>
        ) : (
          <Note title="Deposits on repairs">
            Pool repairs you quote work the same way: set a deposit in Payments and Deposits, and
            the invoice credits it.
          </Note>
        )}
        <Flow
          stages={[
            { title: "Quote accepted", text: "Deposit due when they accept." },
            { title: "Work done", text: "Invoice drafted from the quote." },
            { title: "Pay", text: "Card, bank, or recorded by hand." },
            { title: "Paid", text: "The job turns Paid at zero." },
          ]}
        />
      </Section>

      <Section kicker="Cash, check, other" title="Record Payment">
        <p>
          Not every payment comes through Stripe. A check handed over at the gate, cash in an
          envelope, a payment you got some other way: all of it goes on the invoice the same way,
          and <strong>anyone on the team can record it</strong>, including techs, on jobs they can
          see.
        </p>
        <Spread
          flip
          figure={
            <Phone
              src="81-record-payment"
              alt="Record Payment: an Amount received field filled with the invoice total, the helper text about a check or cash, a Paid by control with Cash, Check and Other, and a Record Payment button."
              caption="The amount is already filled in. Check the control, then tap the button."
            />
          }
        >
          <Steps>
            <Step
              title={
                <>
                  On the invoice, tap <Ui>Record Payment</Ui>.
                </>
              }
            >
              Or swipe right on it in the Invoices list.
            </Step>
            <Step
              title={
                <>
                  Check <Ui>Amount received ($)</Ui>.
                </>
              }
            >
              It starts at the balance. Type less for a partial payment.
            </Step>
            <Step
              title={
                <>
                  Choose <Ui>Paid by</Ui>: <Ui>Cash</Ui>, <Ui>Check</Ui> or <Ui>Other</Ui>.
                </>
              }
            >
              For a check, add the <Ui>Check number</Ui>. It’s optional, and it prints on the
              receipt.
            </Step>
            <Step
              title={
                <>
                  Tap <Ui>Record Payment</Ui>.
                </>
              }
            >
              When the balance reaches zero, the job becomes Paid.
            </Step>
          </Steps>
        </Spread>
        <Watch title="Only the office edits, voids or refunds">
          Techs can record a payment. Only owners and admins can edit or send invoices, and only
          they can refund.
        </Watch>
      </Section>

      <Section kicker="A receipt for the record" title="Send Receipt">
        <p>
          The moment you record a payment, a sheet asks: “Payment recorded. Send the customer a
          receipt?” (or “Paid in full…”).
        </p>
        <Gallery caption="The sheet after a payment: choose Email or Text, check the address, tap Send Receipt.">
          <Phone
            src="81-send-receipt-email-only"
            alt="Send Receipt: the line Payment recorded, a payment summary with check number and remaining balance, an Email and Text control, the customer’s email address, Send Receipt and Not Now."
            caption="By email, with the remaining balance on it."
          />
          <Phone
            src="81-send-receipt-text"
            alt="Send Receipt with Text chosen: the customer’s mobile number, the note Texted from your company number, Send Receipt and Not Now."
            caption="Or by text from the company number."
          />
        </Gallery>
        <p>
          Tap <Ui>Send Receipt</Ui> or <Ui>Not Now</Ui>. You can send it later from the invoice. The
          receipt is the invoice’s own page, now reading Receipt. Card and bank payments through
          Stripe email their receipt on their own; a payment you record by hand doesn’t, because you
          decide. Every receipt sent shows in Activity.
        </p>
        <Note title="Needs a signal">
          Receipts need a connection. Offline, the app says so and doesn’t queue it; use{" "}
          <Ui>Send Receipt</Ui> on the invoice when you’re back in range.
        </Note>
      </Section>

      <Section kicker="When it’s wrong" title="Voiding an invoice">
        <p>
          A wrong customer, a duplicate, a price that was never agreed. The owner can{" "}
          <Ui>Void Invoice</Ui> from the invoice page, but only when no payment has been recorded on
          it. A voided invoice stays in the list under <Ui>Void</Ui>, so there’s a record, and
          there’s only ever one invoice per job.
        </p>
        <Watch title="Paid? Void won’t help">
          Once money is on an invoice, it can’t be voided. Talk to the customer and handle a refund
          the way you normally would.
        </Watch>
      </Section>

      <UseIt
        items={
          edition === "pool"
            ? [
                {
                  who: "Friday: who’s late?",
                  text: "Open Invoices, filter to Overdue, and swipe Send Reminder down the list.",
                },
                {
                  who: "A check at the gate",
                  text: "Tony records it on the spot, with the check number. Dana sees it in Activity.",
                },
                {
                  who: "A customer lost the email",
                  text: "Touch and hold the invoice, Copy Payment Link, and text it.",
                },
              ]
            : [
                {
                  who: "Deposit in, repair booked",
                  text: "Accepting the quote and paying the deposit happen on the same page, so the repair is booked with money behind it.",
                },
                {
                  who: "A check on the deck",
                  text: "Jake records it with the check number. The invoice is Paid before the hose is coiled.",
                },
                {
                  who: "Partly paid",
                  text: "The deposit shows as a credit. The balance is what the customer sees and pays.",
                },
              ]
        }
      />

      <FromTheField title="From the field">
        Record the payment at the moment you take it. “I’ll do it tonight” is how a check ends up in
        a truck door for a week.
      </FromTheField>

      <WhyItMatters>
        When payment lands, Dana hears about it that minute. The invoice status, the job status and
        the Dashboard’s “Owed to you” all change together, because they’re the same record. Nothing
        gets reconciled on Sunday night.
      </WhyItMatters>
    </>
  ),
};
