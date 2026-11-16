import type { ChapterDef } from "../types";
import {
  Browser,
  Flow,
  FromTheField,
  Meta,
  Note,
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
  BigFigure,
} from "../kit";

export const homeowner: ChapterDef = {
  id: "homeowner",
  title: "The homeowner’s evening",
  subtitle: "the customer’s report, quote and invoice pages",
  moment: "Wednesday · 7:30 p.m.",
  lede: "Everything Dana sent this morning lands on Maria’s phone. Here is what she sees, page by page, and what comes back to the shop while Dana is making dinner.",
  learn: [
    "What the homeowner gets by email and text",
    "The report, quote and invoice pages, as she sees them",
    "How she accepts the quote and pays the deposit",
    "What the shop sees come back, and where",
  ],
  Body: () => (
    <>
      <Scene time="Wednesday, 7:30 p.m.">
        <p>
          The dishes are done. Maria sits at the kitchen table with her phone and finally opens the
          email she saw at lunch: “Your leak detection report from Canyon State.”
        </p>
        <p>
          Her husband was at work this morning. He wants to know what she agreed to, what it costs,
          and whether the leak company actually found anything or just “ran some tests.” She turns
          the phone so he can see.
        </p>
      </Scene>

      <Section kicker="No app, no password" title="What lands on her phone">
        <Meta who={["Customer"]} where={["Phone website", "Website"]} />
        <p>
          A homeowner never signs in to anything. Each document comes as a private link in an email
          or a text, and the link is the key. It opens in whatever browser the phone already has.
        </p>
        <Flow
          stages={[
            {
              title: "The report",
              text: "By email, with the PDF attached. The link opens the report page.",
            },
            {
              title: "The quote",
              text: "By text from the shop. Accept and pay the deposit on the page.",
            },
            {
              title: "The invoice",
              text: "By email. Pay by card or bank on the page.",
            },
          ]}
        />
        <p>
          The email comes from your shop’s name, and a reply goes to your shop’s email. It says
          “Your leak detection report for 1423 Palm Ct is ready,” with a link to view it, and your
          phone number under your name. The text is just as short.
        </p>
        <p>
          A link in a text doesn’t arrive as a bare web address. It unfolds into a card with your
          logo, “Quote for Maria Alvarez,” the total and the date it’s good through. Before she
          taps, she already knows who it’s from and what it is.
        </p>
        <Note title="Always light, always yours">
          Every customer page carries your logo (or your shop’s name if you haven’t added one) and
          your main color, and stays light even if her phone is in dark mode, so it looks the same
          as the PDF. The only mention of us is a small “Powered by Sundeck Pro” at the very bottom.
        </Note>
      </Section>

      <Section kicker="The report page" title="What Dana found, in her words and her numbers">
        <Spread
          figure={
            <Browser
              phone
              src="customer-report-phone"
              alt="A customer’s leak detection report on a phone: the shop’s logo, name, phone and email on a navy band with a Download PDF button, Leak Detection Report and the date; then “We found a leak: Skimmer seam (Seam at the skimmer throat).”, “Inspected by Dana and Jake”, a Summary with tiles for 24 Items Pass, 0 Need Attention and 1 Leaking, and the property, pool, technicians and leak detection fee."
              caption="The shop’s band, one plain line, three tiles. She knows the answer before she scrolls."
            />
          }
        >
          <p>
            The page opens with Canyon State’s header and one plain line: there’s a leak, and where.
            Under it, “Inspected by Dana and Jake.” Then three tiles that tell the story before a
            word is read: how many items passed, how many need attention, how many are leaking.
          </p>
          <p>Then, in order:</p>
          <Table
            rows={[
              ["Summary", "Dana’s text, in plain words."],
              [
                "Details",
                "The property, who it’s for, the pool, the date, the tech, the detection fee.",
              ],
              ["Findings", "Numbered, with severity and location: “1. Skimmer seam leak, Major.”"],
              ["The diagram", "Her pool’s own shape, with a numbered pin on the seam."],
              ["What happens next", "What Dana recommends, and that the quote has the price."],
              ["Tests we ran", "Every test, pass or fail: “Dropped 8 PSI in 15 min,” Fail."],
              ["What we checked", "Every item, with its result, and the reason for any N/A."],
              ["Photos", "The throat of the skimmer, with Dana’s red circle on the crack."],
              ["Signatures", "Maria’s, with the date."],
            ]}
          />
          <p>
            A <Ui>Download PDF</Ui> link sits at the top for the husband who wants to print it.
          </p>
        </Spread>
        <Browser
          src="customer-report"
          url="sundeckpro.com/r/…"
          alt="The same kind of report on a computer: the shop’s header band with its logo, the plain line about the skimmer seam leak, the Summary tiles, the details, What we found, What happens next and What we checked."
          caption="On a computer the report reads like a printed document. The PDF matches it page for page."
        />
        <Tip title="Asked how it went">
          Under the report, Maria sees <Ui>How did we do?</Ui> with a thumbs up or down. A thumbs up
          leads to Leave a Google Review, if the shop has a review link. A thumbs down opens a box,
          What went wrong?, and what she writes goes to Dana privately as a complaint. No review is
          asked for while it’s open.
        </Tip>
        <FromTheField title="The report sells the repair">
          “Ran some tests” turns into every item on the checklist with its result, a pressure test
          with a start and an end reading, and a photo with a circle on it. The husband stops asking
          whether the leak is real and starts asking when they can fix it.
        </FromTheField>
      </Section>

      <Section kicker="The quote page" title="Yes, at the kitchen table">
        <p>
          Maria taps the link in Dana’s text. <Ui>Repair Quote</Ui>, with the number, the date, who
          it’s prepared for and the property. Under <Ui>Work</Ui>, each line with its price, and
          under the reseal, “For: Skimmer seam leak,” tying the price to the finding she just read
          about. Then the subtotal, tax and total, and a line she reads twice: “Deposit due when you
          accept.”
        </p>
        <Steps>
          <Step
            title={
              <>
                Under <Ui>Accept This Quote</Ui>, she checks the date
              </>
            }
          >
            “Good through” and a date. After that, the quote expires and the page asks her to
            contact the shop.
          </Step>
          <Step
            title={
              <>
                She types her name and taps <Ui>Accept Quote</Ui>
              </>
            }
          >
            The line above the button says what she’s agreeing to: “I accept this quote and ask
            Canyon State to do the work for $600.00.”
          </Step>
          <Step
            title={
              <>
                She taps <Ui>Pay $300.00 Deposit</Ui>
              </>
            }
          >
            The payment form opens right on the page: card, Apple Pay, Google Pay, or a bank
            account. A minute later: “Deposit of $300.00 received. Thank you!”
          </Step>
        </Steps>
        <p>
          The heading now reads <Ui>Accepted</Ui>, with her name and the date, and “Canyon State
          will contact you to schedule the repair.” If she opens the link next week, that’s still
          what it says.
        </p>
        <Sub>Card or bank</Sub>
        <p>
          Payments go straight to your shop’s own Stripe account; Sundeck Pro never holds the money.
          If you pass the card fee on, she sees two buttons, <Ui>Pay $300.00 Deposit by Bank</Ui>{" "}
          with no fee and a card button with the fee spelled out. A bank payment says it’s
          processing and usually clears in about four business days; there’s nothing more she has to
          do.
        </p>
        <Watch title="Before the first quote goes out">
          Online payments need <Ui>Set Up Payments</Ui> in Settings › Payments and Deposits, done
          once by the owner. Until then, customers can still accept quotes; they just can’t pay on
          the page.
        </Watch>
      </Section>

      <Section kicker="The invoice page" title="Paying for the detection">
        <p>
          Last, the invoice email: “Your invoice from Canyon State,” the amount, and “View and pay
          it here.” The page opens with one line, “$649.00 due on receipt.”, then <Ui>Billed to</Ui>
          , <Ui>Property</Ui>, the leak detection line and <Ui>Balance due</Ui>. Under it,{" "}
          <Ui>Pay This Invoice</Ui>.
        </p>
        <p>
          She pays by card. The page turns into a receipt: the heading reads “Receipt” in place of
          “Invoice,” and the line reads “Paid in full. Thank you!” Stripe emails her a receipt on
          its own. Partial payments work too; the page then says how much is still due. If the shop
          offers Affirm or Klarna, <Ui>Pay over time with Affirm or Klarna</Ui> sits under the
          button too.
        </p>
        <Tip title="Reminders you don’t have to send">
          If she hadn’t paid, a polite reminder would go out 7, 14 and 30 days after sending, and
          quote reminders at 3 and 7 days. They stop the moment she pays or accepts. Change the days
          in Settings › Company and Branding, and choose Email, Text or Both under Send Reminders
          By.
        </Tip>
      </Section>

      <BigFigure value="0" label="accounts, passwords or apps Maria needed tonight" />

      <Scene time="7:52 p.m.">
        <p>
          Dana is draining pasta when her phone buzzes on the counter. Then again. Then a third
          time. She doesn’t need to open the app to know what happened.
        </p>
      </Scene>

      <Section kicker="Meanwhile, at Dana’s" title="What comes back to the shop">
        <Meta who={["Owner", "Admin", "Tech"]} where={["iPhone", "Android", "Website"]} />
        <Spread
          flip
          figure={
            <Phone
              src="20-wrap-up"
              alt="Maria Alvarez’s Wrap-Up, 3 of 4 done: Report draft ready, Quote #1006 Accepted · deposit paid $1,250.00, Customer signs Not yet, Invoice #1025 Partly paid · $375.00 due on $649.00."
              caption="The finish list updates itself: accepted, deposit paid, and what’s still owed."
            />
          }
        >
          <Sub>Notifications</Sub>
          <p>Each one arrives the moment it happens, with the customer’s name:</p>
          <Table
            rows={[
              ["Report opened", "The first time Maria opens the report link."],
              ["Quote accepted", "“Maria Alvarez accepted the $600.00 quote.”"],
              ["Payment received", "The deposit, and later the invoice."],
              ["Report signed", "When a customer signs a report."],
            ]}
          />
          <p>
            Techs get them for their own jobs; owners and admins for the whole shop. Each can be
            turned off in More › Notifications.
          </p>
        </Spread>
        <Sub>The job moves itself</Sub>
        <p>
          The job’s status walks forward with no one touching it: <Ui>Report sent</Ui>,{" "}
          <Ui>Quote sent</Ui>, <Ui>Quote accepted</Ui>, and once the detection is paid,{" "}
          <Ui>Paid</Ui>. On the job’s <Ui>Details</Ui>, under <Ui>Customer Links</Ui>, the report
          link says how many times it was opened and when. And accepting the quote made something
          new: a repair job for Maria, waiting in <Ui>Needs a Time</Ui> on the Schedule.
        </p>
        <Spread
          figure={
            <Phone
              src="70-dashboard-activity"
              alt="The Activity sheet: Payment received, Maria Alvarez, $225.00, 8:14 PM; Job completed, by Tony, 7:31 PM; Quote accepted, $1,450.00, 5:26 PM; and See All."
              caption="Activity: the shop’s evening, newest first. Tap a row to open the job."
            />
          }
        >
          <Sub>Activity</Sub>
          <p>
            In the morning Dana opens More › <Ui>Activity</Ui> (or the <Ui>Activity</Ui> pill on the
            Dashboard) and reads the evening as a list: quote accepted, payment received, report
            opened, each with a name, an amount and a time. Nobody had to call anybody.
          </p>
        </Spread>
        <UseIt
          items={[
            {
              who: "Opened, but quiet",
              text: "The report was opened twice and the quote is still “Sent · waiting.” That’s the customer to call this afternoon, and you know they’ve read it.",
            },
            {
              who: "Never opened",
              text: "No “Report opened” two days later usually means a wrong email. Check it on the job, then resend.",
            },
            {
              who: "Link sent to the wrong person",
              text: (
                <>
                  <Ui>Turn Off</Ui> under Customer Links stops that link working. Sending again
                  makes a new one.
                </>
              ),
            },
          ]}
        />
      </Section>

      <WhyItMatters
        figures={[
          { value: "3", label: "pages, each under your logo" },
          { value: "180", label: "days each link keeps working" },
        ]}
      >
        Maria never saw a carbon copy, a PDF from a template site or a payment app with someone
        else’s name on it. She saw Canyon State: its logo on the report, the quote and the bill, the
        same colors on each, her own pool drawn on the page, and a button that took her money the
        way every other company she pays does. By dinner, the shop that arrived in a pickup this
        morning had put what it found, what the fix costs and what she owes in front of her, under
        one name. Dana did nothing tonight to make that happen.
      </WhyItMatters>
    </>
  ),
};
