import type { ChapterDef } from "../types";
import {
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
  Tip,
  Ui,
  UseIt,
  Watch,
  WhyItMatters,
  PullQuote,
} from "../kit";

export const theFix: ChapterDef = {
  id: "the-fix",
  title: "The fix",
  moment: "Friday · 7:05 a.m.",
  lede: "Maria said yes. Her accepted quote is already a repair job, waiting for a day. Follow it onto Jake’s route, through the repair, and back to the office as the last invoice, paid.",
  learn: [
    "Where an accepted quote’s repair job appears",
    "Schedule it into a tech’s day",
    "Add a second repair on site",
    "Wrap up a repair: report, signature, invoice",
    "Take the last payment and close the job",
  ],
  Body: () => (
    <>
      <Scene time="Friday, 7:05 a.m.">
        <p>
          Dana opens <Ui>Schedule</Ui> with her coffee. The <Ui>Needs a Time</Ui> row has a 1 on it
          that wasn’t there yesterday morning: Maria Alvarez, Repair.
        </p>
        <p>
          She didn’t create it. Maria did, at her kitchen table, when she tapped{" "}
          <Ui>Accept Quote</Ui>. The deposit is paid, the price is agreed, and the only question
          left is when.
        </p>
      </Scene>

      <Section kicker="From yes to a job" title="The repair job makes itself">
        <Meta who={["Owner", "Admin"]} where={["Website", "iPhone", "Android"]} />
        <Spread
          figure={
            <Phone
              src="08-repair-job-called"
              alt="A repair job before its visit: Unscheduled · Repair, the customer, the pool address with a map pin, Assigned to Tech: Nobody yet, a Repairs group with one repair and its price, Total, and Add Additional Repair; further down, Schedule with Schedule Job and Suggest Times, and Cancel Job."
              caption="A repair job waiting for a day: no tech yet, not scheduled, its price already set."
              full
            />
          }
        >
          <p>
            When a customer accepts a quote, Sundeck Pro creates the repair job for the same
            customer and the same pool, unscheduled. The quote links to it as “Repair job” and its
            number. Nothing is typed again.
          </p>
          <p>
            A repair job has four tabs, not five: <Ui>Details</Ui>, <Ui>Findings</Ui>,{" "}
            <Ui>Photos</Ui> and <Ui>Wrap-Up</Ui>. There’s no checklist, because the inspection
            already happened. The pool’s shape, its landmarks and its access notes come along from
            the pool record, so Jake works from the same drawing Dana used on Thursday.
          </p>
          <Sub>Give it a day</Sub>
          <Steps>
            <Step
              title={
                <>
                  Open <Ui>Needs a Time</Ui> on the Schedule
                </>
              }
            >
              Every job without a time, or without a tech, waits here. Only owners and admins see
              it.
            </Step>
            <Step
              title={
                <>
                  Tap the job’s ⋯ and choose <Ui>Suggest Times</Ui>
                </>
              }
            >
              Sundeck Pro offers slots that fit the routes, marked like “Adds no driving” or “First
              stop.” Or drag the card onto a tech’s day.
            </Step>
            <Step title="Pick Jake and the slot">
              The job leaves <Ui>Needs a Time</Ui>, lands on Jake’s Tuesday, and its status becomes{" "}
              <Ui>Scheduled</Ui>.
            </Step>
          </Steps>
          <p>
            From the job itself, <Ui>Schedule Job</Ui> and <Ui>Suggest Times</Ui> under{" "}
            <Ui>Schedule</Ui> do the same.
          </p>
        </Spread>
        <Tip title="Tell her the day">
          Text Maria from the round message button on the job. If your shop has a company number,
          the text goes from it and the conversation stays in <Ui>Messages</Ui>, so whoever picks up
          her reply sees the whole thread.
        </Tip>
      </Section>

      <Scene time="Tuesday, 8:20 a.m.">
        <p>
          Jake pulls up to 1423 Palm Ct as the first stop of his day. The gate code is on the card,
          and so is the note about the dog. He has never been to this pool, and he doesn’t need to
          call Dana: Maria’s customer page opens Thursday’s detection, where the diagram shows a red
          pin on the skimmer and Dana’s photo shows the crack.
        </p>
        <p>
          He taps <Ui>Start</Ui> on Today’s card.
        </p>
      </Scene>

      <Section kicker="On site" title="Jake’s repair visit">
        <Meta who={["Tech"]} where={["iPhone", "Android"]} />
        <p>
          A repair visit is shorter on paper than a detection, because most of the paperwork is
          already done. Jake does three things in the app: proves the work, adds anything extra, and
          gets it signed.
        </p>
        <Sub>Photos, before and after</Sub>
        <p>
          On <Ui>Photos</Ui>, <Ui>Add Photo</Ui> with <Ui>Attach to</Ui> set to the whole job: the
          throat cut out, the new seal, the skimmer refilled. Each photo is stamped with its time
          and, if the phone allows it, the place. With wet hands, <Ui>Voice Note</Ui> is quicker
          than typing: “Cut out the old seam, resealed with epoxy, cured forty minutes.” It’s turned
          into text once it uploads.
        </p>
        <Sub>The test that proves it</Sub>
        <p>
          On <Ui>Findings</Ui>, Jake taps <Ui>Add Test</Ui> and runs the same pressure test Dana
          ran: <Ui>Pressure test</Ui>, the skimmer line, 20 PSI, 15 minutes. This time the live line
          reads “Held at 20 PSI in 15 min,” and the result suggests Pass. Thursday’s failure and
          Tuesday’s pass now sit in the same customer’s history.
        </p>
        <Sub>The second repair</Sub>
        <Spread
          flip
          figure={
            <Phone
              src="08-new-job-repair"
              alt="New Job for a repair: two repairs, Pump motor at $450.00 and Heater igniter at $185.00, an Add Additional Repair button, and Total $635.00, with Create Job below."
              caption="Several repairs on one job, each with its own price. The same works on a job already under way."
            />
          }
        >
          <p>
            While the epoxy cures, Jake notices the skimmer lid is cracked through. Maria wants it
            replaced while he’s there.
          </p>
          <Steps>
            <Step
              title={
                <>
                  On <Ui>Details</Ui>, under <Ui>Repairs</Ui>, tap <Ui>Add Additional Repair</Ui>
                </>
              }
            >
              The sheet offers your price book. For anything not in it, choose{" "}
              <Ui>Something else</Ui> and describe it: “Replace cracked skimmer lid.”
            </Step>
            <Step
              title={
                <>
                  Enter the <Ui>Price ($)</Ui> and tap <Ui>Add Repair</Ui>
                </>
              }
            >
              $45. A repair with a name needs a price.
            </Step>
          </Steps>
          <p>
            It’s billed on the invoice as its own line, next to the quoted work. Two techs on one
            job can each add repairs, even with no signal, and both stay.
          </p>
        </Spread>
        <Watch title="Prices don’t edit in place">
          To change a repair’s price, remove it (swipe left, or its ⋯ button) and add it again.
          Removing asks first, and <Ui>Undo</Ui> brings it back for a few seconds.
        </Watch>
      </Section>

      <Section kicker="Wrap-Up, again" title="Finishing a repair">
        <p>
          A repair job’s <Ui>Wrap-Up</Ui> is the same finish list with no quote rows:{" "}
          <Ui>Report</Ui>, <Ui>Customer signs</Ui>, <Ui>Invoice</Ui>. The blue button walks Jake
          through it.
        </p>
        <Flow
          stages={[
            {
              title: "Write the Draft",
              text: "A Repair Report: Summary, What we did, What happens next. It opens with “Your repair is complete.” and “Repaired by Jake.”",
            },
            {
              title: "Review with Customer",
              text: "Maria reads it on Jake’s phone and signs, as she did on Thursday.",
            },
            {
              title: "Invoice",
              text: "The accepted quote, the extra repair, and the deposit already paid, taken off.",
            },
          ]}
        />
        <p>
          <Ui>What we did</Ui> lists the quote’s lines, then each repair Jake added. For a repair
          job, the draft also reads Jake’s voice-note transcripts, so the sentence he said into the
          phone at the skimmer can end up in the report, ready for him to tidy.
        </p>
        <Note title="Same rules, same lock">
          Once Maria signs, that version is finished; once it’s sent, it can’t be changed. The
          repair report joins the detection report on her record: what was wrong, and what was done
          about it, each signed.
        </Note>
      </Section>

      <Section kicker="The last invoice" title="Billing the repair">
        <Spread
          figure={
            <Phone
              src="21-wrap-up-sent-invoice"
              alt="An invoice after sending, partly paid: Subtotal $649.00, Paid $274.00, Balance due $375.00, a payment line recorded by the office, a Customer link with Copy Link, Amount received ($) 375.00, Paid by Cash, Check or Other, Record Payment, and Send Receipt."
              caption="A sent invoice: what’s been paid, what’s due, the customer’s link, and Record Payment."
              full
            />
          }
        >
          <p>
            From the office, Dana opens the <Ui>Invoice</Ui> row on the repair job and taps{" "}
            <Ui>Create Invoice</Ui>. The hint says what it will do: “Copies the accepted quote and
            credits the deposit already paid. You can change it before sending.”
          </p>
          <p>
            The quoted work is $600.00, the lid adds $45.00, and the $300.00 deposit comes off.
            Balance due: $345.00. She taps <Ui>Send by Email</Ui>, and the invoice is locked and on
            its way before Jake has his tools in the truck.
          </p>
          <p>Maria doesn’t need the link. She hands Jake a check.</p>
        </Spread>
        <Gallery caption="Record Payment, then the receipt: two sheets, one after the other.">
          <Phone
            src="81-record-payment"
            alt="Record Payment for an invoice: Amount received ($) 649.00, with the note “A check, cash, or anything paid outside Sundeck Pro.”, Paid by Cash, Check or Other, and a Record Payment button."
          />
          <Phone
            src="81-send-receipt"
            alt="Send Receipt: $649.00 · Cash · Paid in full, the customer’s email, a Send Receipt button and Not Now."
          />
        </Gallery>
        <Steps>
          <Step
            title={
              <>
                On the invoice, tap <Ui>Record Payment</Ui>
              </>
            }
          >
            <Ui>Amount received ($)</Ui> is filled in with the balance. Change it for a partial
            payment.
          </Step>
          <Step
            title={
              <>
                Choose <Ui>Check</Ui> and add the check number
              </>
            }
          >
            It’s optional, and it shows on the receipt.
          </Step>
          <Step
            title={
              <>
                Tap <Ui>Record Payment</Ui>, then <Ui>Send Receipt</Ui>
              </>
            }
          >
            By email, or by text when your shop has a company number. The receipt is the invoice’s
            own page, now marked paid.
          </Step>
        </Steps>
        <p>
          Techs can record a payment on any job they can see; sending and changing invoices stays
          with owners and admins. The balance hits zero, and the repair job turns <Ui>Paid</Ui>. The
          next chapter covers every other way the money comes in.
        </p>
      </Section>

      <FromTheField title="The check that doesn’t go in the cup holder">
        A check recorded at the gate is on the books before the truck leaves the street. Dana sees
        “Payment received” on her phone, and Friday’s deposit slip matches the{" "}
        <Ui>Export Payments</Ui> file without anyone hunting through a glovebox.
      </FromTheField>

      <Section kicker="Closing the loop" title="After paid">
        <p>
          The job is done, but Maria’s file isn’t closed; it’s full. Her customer page lists both
          jobs, each with its report, quote, invoice and payments. Her pool keeps its diagram, so
          the next tech who comes out starts from the same drawing: the shape, the spa and the
          landmarks.
        </p>
        <p>
          And if your shop has a review link set in{" "}
          <Path items={["Settings", "Company and Branding"]} />, Sundeck Pro asks Maria for a review
          once, by email, soon after the job is paid: while the pool is holding water and she still
          remembers who fixed it.
        </p>
        <UseIt
          items={[
            {
              who: "A repair with no detection",
              text: (
                <>
                  A past customer calls about a loose return fitting. <Ui>New Job</Ui>, choose{" "}
                  <Ui>Repair</Ui>, pick it from “What do they need?”, and add more with{" "}
                  <Ui>Add Additional Repair</Ui>. The price is the total of the repairs.
                </>
              ),
            },
            {
              who: "The leak comes back",
              text: "Open her record: the first report, the repair report, both tests, both signatures. You know in a minute whether it’s the same seam or a new leak.",
            },
            {
              who: "The quote is too big for today",
              text: "Repair jobs from accepted quotes wait in Needs a Time as long as they need to. Nothing gets lost between the yes and the date.",
            },
          ]}
        />
        <PullQuote>Thursday: dropped 8 PSI. Tuesday: held at 20. Both on the record.</PullQuote>
        <WhyItMatters
          figures={[
            { value: "1", label: "customer record from first call to paid" },
            { value: "0", label: "times anyone retyped the repair" },
          ]}
        >
          The repair Maria agreed to on Thursday night is the repair Jake did and the repair she
          paid for on Tuesday: the same lines, the same prices, the deposit already taken off. No
          one copied a quote into an invoice or remembered to knock off the deposit. When the books
          are done, every dollar on Maria’s pool points back to a finding, a photo and a signature.
          The shop that can show that is the shop that gets the next leak on the street.
        </WhyItMatters>
      </Section>
    </>
  ),
};
