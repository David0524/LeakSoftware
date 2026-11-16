import type { ChapterDef } from "../types";
import {
  BigFigure,
  Flow,
  FromTheField,
  Meta,
  Note,
  Path,
  Phone,
  Scene,
  Section,
  Spread,
  Step,
  Steps,
  Table,
  Tip,
  Ui,
  UseIt,
  Watch,
  WhyItMatters,
} from "../kit";

// WANT: quote-page — sundeckpro.com/q/<token> (the customer's quote page with Accept This Quote, phone size)
// WANT: repair-details — sundeckpro.com/jobs/<id> (a repair job's Details with the Repairs group)
// WANT: repair-wrapup — sundeckpro.com/jobs/<id>?tab=wrap-up (a repair job's Wrap-Up with the invoice)

export const repairOnSite: ChapterDef = {
  id: "repair-on-site",
  title: "“The pump’s making a noise”",
  moment: "Tuesday · 10:20 a.m.",
  lede: "A weekly visit is where most repairs are found. Here is one from the noise at the equipment pad to the paid invoice: a quote priced on the spot, approved from the customer’s phone, scheduled, done, and billed.",
  learn: [
    "Start a quote from a visit and price it from the price book",
    "Send it, or have the customer sign on your phone",
    "What the customer sees, and how a deposit works",
    "Schedule the repair job and finish it with Wrap-Up",
  ],
  Body: () => (
    <>
      <Scene time="Tuesday, 10:20 a.m.">
        <p>
          Priya hears it before she opens the gate: a dry whine from the equipment pad, rising and
          falling. The pump motor’s bearings. She’s heard that sound end the same way a dozen times,
          usually in August, usually on a Friday.
        </p>
        <p>
          Gina Castillo is at work. Priya finishes the visit, marks{" "}
          <em>Equipment: leaks, noise, or drips</em> as Needs Attention with a note, records ten
          seconds of the noise on video, and opens the visit’s Details.
        </p>
      </Scene>

      <Flow
        stages={[
          { title: "Found", text: "On a visit. Noted, photographed, recorded." },
          { title: "Quoted", text: "Priced from the price book, before leaving the yard." },
          { title: "Approved", text: "The customer accepts on their phone, and pays a deposit." },
          { title: "Scheduled", text: "A repair job appears, ready for a day and a tech." },
          { title: "Fixed and billed", text: "Mark Complete, then Wrap-Up sends the invoice." },
        ]}
      />

      <Section kicker="On the visit" title="Start a quote">
        <Meta who={["Tech", "Owner", "Admin"]} where={["iPhone", "Android", "Website"]} />
        <p>
          A maintenance visit has no Wrap-Up, but it does take quotes. They’re at the end of the
          visit’s <Ui>Details</Ui>, under <Ui>Quotes</Ui>: “No quote yet.” and a{" "}
          <Ui>Start Quote</Ui> button.
        </p>
        <Steps>
          <Step
            title={
              <>
                On the visit’s Details, tap <Ui>Start Quote</Ui>.
              </>
            }
          >
            A draft quote opens.
          </Step>
          <Step title="Add the work from the price book.">
            Pick “Replace pump motor” and tap <Ui>Add Item</Ui>. The description and price come from
            the price book, so every tech quotes the same job the same way.
          </Step>
          <Step title="Add anything that isn’t in the book as a custom line.">
            Type it, give it a <Ui>Price ($)</Ui>, and <Ui>Add Line</Ui>. Each line has its own
            description, quantity and price, and a way to remove it.
          </Step>
          <Step title="Check the totals.">
            Subtotal, any <Ui>Discount ($)</Ui>, tax on the taxable lines, the total, and the
            deposit your shop asks for.
          </Step>
          <Step
            title={
              <>
                Tap <Ui>Send Quote</Ui>.
              </>
            }
          >
            It “locks the prices and gives you a link for the customer.” Text the link, or send it
            from the shop’s Messages.
          </Step>
        </Steps>
        <Tip title="Customer standing right there?">
          On the iPhone and Android, <Ui>Customer Signs Now</Ui> lets the homeowner read the quote
          on your phone and accept it with their signature, even with no signal. No link, no
          waiting.
        </Tip>
        <Note title="Discounts have a ceiling">
          A tech can take something off only up to the owner’s limit,{" "}
          <Ui>Largest discount a tech can give (%)</Ui> in{" "}
          <Path items={["Settings", "Payments and Deposits"]} />. New shops start at 0%, so techs
          can’t discount until the owner allows it. A discount always comes off before tax.
        </Note>
        <Watch title="Sent is final">
          Once a quote is sent its prices and lines are frozen: the customer is looking at them. To
          change the price, start another quote (“Need another price?”).
        </Watch>
      </Section>

      <Section kicker="The customer’s side" title="Approved from the couch">
        <p>
          The link opens the quote as a web page with your logo: <strong>Repair Quote</strong>, who
          it’s prepared for, the property, the work line by line, the totals, and “Deposit due when
          you accept.” Under it, <strong>Accept This Quote</strong> with the date it’s good through,
          a box for their name, and the line “I accept this quote and ask Canyon State to do the
          work for $….”
        </p>
        <Table
          head={["They tap", "They see"]}
          rows={[
            [
              <>
                <Ui>Accept Quote</Ui>
              </>,
              "Accepted by Gina Castillo on Nov 17. Canyon State will contact you to schedule the repair.",
            ],
            [
              <>
                <Ui>Pay $… Deposit</Ui>
              </>,
              "Card, Apple Pay, Google Pay or bank, in the page. Then “Deposit of $… received. Thank you!”",
            ],
          ]}
        />
        <p>
          Deposits are a shop setting: a percentage of the quote or a fixed amount, with an optional
          minimum (<Path items={["Settings", "Payments and Deposits"]} />
          ). Card payments go straight to the shop’s own Stripe account. A shop with no deposit set
          skips that step.
        </p>
        <Note title="Reminders go by themselves">
          A quote that hasn’t been answered gets reminders 3 and 7 days after it was sent, by
          default (Settings › Company and Branding). Nobody has to remember to chase it.
        </Note>
      </Section>

      <FromTheField title="Tuesday, 12:35 p.m.">
        Gina Castillo reads the quote on her lunch break, accepts it, and pays the deposit. Dana’s
        phone shows a notification that the quote was accepted. Priya is two pools further along her
        route and never hears about it, because she doesn’t need to.
      </FromTheField>

      <Section kicker="The office" title="A repair job, waiting for a day">
        <Spread
          figure={
            <Phone
              src="08-repair-job-called"
              alt="A repair job before it's scheduled: Unscheduled · Repair, the pool's address, a Repairs group with Pump motor $450.00 and Add Additional Repair, Schedule Job and Suggest Times buttons, and Start Job at the bottom."
              caption="The repair job the accepted quote made: unscheduled, with the work already on it."
            />
          }
        >
          <p>
            Accepting the quote creates a <strong>repair job</strong> for the same customer and
            pool, unscheduled. The quote links to it (“Repair job #1107”). It shows up on the
            Schedule under <Ui>Needs a Time</Ui> until someone gives it one.
          </p>
          <Steps>
            <Step title="Open the repair job.">
              From the quote’s link, the customer’s page (under <Ui>Repairs</Ui>), or Needs a Time.
            </Step>
            <Step
              title={
                <>
                  Tap <Ui>Schedule Job</Ui>, or <Ui>Suggest Times</Ui>.
                </>
              }
            >
              Pick the day, the time and the tech. A pump swap is a longer stop than a weekly visit;
              give it the hours it needs.
            </Step>
          </Steps>
          <p>
            The <strong>Repairs</strong> group lists the work with a price for each and a total.
            Found something else? <Ui>Add Additional Repair</Ui> adds another line from the price
            book, or “Something else” with a description and a price. Each repair is billed as its
            own line.
          </p>
        </Spread>
        <Tip title="A repair without a quote">
          A customer calls about a dead pool light. No quote needed: <Ui>New Job</Ui>, choose{" "}
          <Ui>Repair</Ui>, pick the work under “What do they need?”, and add more with{" "}
          <Ui>Add Additional Repair</Ui>.
        </Tip>
      </Section>

      <Section kicker="Thursday" title="The repair, and the bill">
        <Spread
          flip
          figure={
            <Phone
              src="08-new-job-repair"
              alt="New Job set to Repair: customer name, phone and email, the address, Job Service | Repair with Repair chosen, the date, start time, hours and tech, two repair lines, Pump motor $450.00 and Heater igniter $185.00, Add Additional Repair, Total $635.00, and Create Job."
              caption="New Job › Repair: several repairs in one job, with the total."
            />
          }
        >
          <p>
            On the day, the repair is a stop on the tech’s Today like any other. A repair has no
            checklist, so once the tech is on site the card shows <Ui>Mark Complete</Ui> alone. That
            marks the stop done for the day; the job itself stays open for its paperwork.
          </p>
          <p>
            The paperwork lives on the repair job’s <Ui>Wrap-Up</Ui>: a short list of what’s left to
            finish, each step with its state in words, and one button at the bottom for the next
            one.
          </p>
          <Steps>
            <Step
              title={
                <>
                  On Wrap-Up, open <Ui>Invoice</Ui> and create it.
                </>
              }
            >
              It “copies the accepted quote and credits the deposit already paid.” Add a line if
              something changed.
            </Step>
            <Step
              title={
                <>
                  Tap <Ui>Send by Email</Ui>.
                </>
              }
            >
              “Sending locks the invoice.” The customer gets a link with the balance and a{" "}
              <Ui>Pay This Invoice</Ui> button.
            </Step>
            <Step title="Watch it get paid.">
              The Invoice row reads “Sent · $… due,” then “Paid.” A check or cash goes in with{" "}
              <Ui>Record Payment</Ui>.
            </Step>
          </Steps>
        </Spread>
        <Note title="Separate from the monthly bill">
          A repair job has its own invoice. It doesn’t wait for the customer’s invoice day and
          doesn’t land on the monthly service invoice. Small parts swapped during a weekly visit (a
          basket, a gauge) are different: those are charges, and they go on the monthly invoice
          (Chapter 7).
        </Note>
      </Section>

      <UseIt
        items={[
          {
            who: "Charge or quote?",
            text: "If you fixed it during the visit with what’s on the truck, Add Charge. If it needs a part ordered, a second trip, or the customer’s yes, Start Quote.",
          },
          {
            who: "Seasonal checks",
            text: "Spring heater start-ups turn up igniters and heat exchangers. Quote them on the visit while the customer is thinking about the first swim.",
          },
          {
            who: "Two repairs, one trip",
            text: "The motor and a cracked lid together: one quote, one repair job, one line each on the invoice.",
          },
        ]}
      />

      <BigFigure
        value="0"
        label="phone calls between Priya hearing the bearings and Gina Castillo paying the deposit"
      />

      <WhyItMatters>
        The pool tech is the person most likely to find a repair, and the least likely to have time
        to sell it. When the quote happens at the pad, priced from the book, and the customer can
        say yes from wherever they are, the repair isn’t lost to “I’ll mention it to the office.”
        The deposit is in before the part is ordered, the job is on the schedule with the work
        already on it, and the invoice copies what the customer agreed to, so the price they
        approved is the price they’re billed.
      </WhyItMatters>
    </>
  ),
};
