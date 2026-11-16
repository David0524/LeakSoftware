import type { ChapterDef } from "../types";
import { Flow, Table, Tip, Ui } from "../kit";

export const cheatSheet: ChapterDef = {
  id: "cheat-sheet",
  title: { pool: "A day on one page", leak: "A job on one page" },
  subtitle: { pool: "the whole process at a glance", leak: "the whole process at a glance" },
  lede: {
    pool: "The whole working day in six stages, and the button you need at each one.",
    leak: "A leak from the first call to the paid invoice in seven stages, and the button you need at each one.",
  },
  Body: ({ edition }) =>
    edition === "pool" ? (
      <>
        <Flow
          stages={[
            {
              title: "Sunday night",
              text: (
                <>
                  On <Ui>Schedule</Ui>, Week, tap <Ui>Optimize Week</Ui>. Plan for everyone, with{" "}
                  <Ui>Needs a Time</Ui> included.
                </>
              ),
            },
            {
              title: "Before the first stop",
              text: (
                <>
                  On <Ui>Today</Ui>, read the card. <Ui>Message</Ui> sends your On My Way text as
                  you pull out; tap <Ui>Start</Ui> when you get there.
                </>
              ),
            },
            {
              title: "At the pool",
              text: (
                <>
                  Tap <Ui>Open Checklist</Ui>. Answer each item, and enter the readings on the
                  Chemicals card.
                </>
              ),
            },
            {
              title: "Parts and finish",
              text: (
                <>
                  <Ui>Add Charge</Ui> for any parts used, then <Ui>Mark Complete</Ui> on the card.
                </>
              ),
            },
            {
              title: "The report",
              text: (
                <>
                  <Ui>Send Visit Report</Ui> by hand, or let it go out on its own under Settings ›
                  Report Templates.
                </>
              ),
            },
            {
              title: "Month’s end",
              text: (
                <>
                  On <Ui>Invoices</Ui>, check the drafts in <Ui>To Send</Ui> and send them.
                </>
              ),
            },
          ]}
        />

        <Table
          head={["When you want to…", "Do this"]}
          rows={[
            ["See the next stop", <>On Today, the blue card is the stop you’re on.</>],
            [
              "Come back to a stop later today",
              <>
                On the Today card, tap <Ui>Do Later</Ui>.
              </>,
            ],
            [
              "Skip a visit you can’t do",
              <>
                On the visit, tap <Ui>Skip Visit</Ui> and choose a reason, such as Locked Gate.
              </>,
            ],
            [
              "Rearrange the whole day",
              <>
                On Today, tap <Ui>Reorder</Ui>, drag each stop, then tap <Ui>Done</Ui>.
              </>,
            ],
            [
              "See a tech’s day",
              <>
                On Today, tap the tech’s name under <Ui>Whose Day</Ui>.
              </>,
            ],
            [
              "Find a customer fast",
              <>
                Press <Ui>Ctrl+K</Ui> (⌘K on a Mac), or use the search field on Jobs.
              </>,
            ],
            [
              "Start a maintenance plan",
              <>
                <Ui>New Job</Ui>, choose <Ui>Service</Ui>, pick a <Ui>Repeats</Ui> option, then tap{" "}
                <Ui>Start Plan</Ui>.
              </>,
            ],
            [
              "Pause a plan for a season",
              <>
                Customer page › Maintenance › the plan › <Ui>Pause</Ui>.
              </>,
            ],
            [
              "Place a job without a time",
              <>
                On <Ui>Schedule</Ui>, open <Ui>Needs a Time</Ui> and drag the job onto a day.
              </>,
            ],
            [
              "Tell a customer you’re on the way",
              <>
                On the Today card, tap <Ui>Message</Ui>. The On My Way text is ready to send.
              </>,
            ],
            [
              "Add a part to a visit’s invoice",
              <>
                On the visit, open <Ui>Checklist</Ui>, then <Ui>Add Charge</Ui>.
              </>,
            ],
            [
              "Tell the office about a problem",
              <>
                On the visit’s Details, tap <Ui>Report an Issue</Ui>.
              </>,
            ],
            [
              "Log the chemicals you added",
              <>
                On the Chemicals card, tap <Ui>Mark All Added</Ui>, or use <Ui>Also Added</Ui>.
              </>,
            ],
            [
              "Send invoices by themselves",
              <>
                Settings › Payments and Deposits › <Ui>Send Automatically</Ui>.
              </>,
            ],
            [
              "Get paid without chasing",
              <>
                Customer page › Autopay › <Ui>Request Card on File</Ui>.
              </>,
            ],
          ]}
        />

        <Tip>
          Each stage names the one button you need. The chapters explain what happens behind it.
        </Tip>
      </>
    ) : (
      <>
        <Flow
          stages={[
            {
              title: "The call",
              text: (
                <>
                  Tap <Ui>New Job</Ui>, choose <Ui>Leak</Ui>, add the customer and pool, then tap{" "}
                  <Ui>Start Job</Ui> when you arrive.
                </>
              ),
            },
            {
              title: "The inspection",
              text: (
                <>
                  Work the <Ui>Checklist</Ui> with one result per item. Record each test with{" "}
                  <Ui>Add Test</Ui>.
                </>
              ),
            },
            {
              title: "Findings and photos",
              text: (
                <>
                  <Ui>Add Finding</Ui> pins each problem to the pool diagram. <Ui>Add Photo</Ui> and{" "}
                  <Ui>Add Video</Ui> hold the evidence.
                </>
              ),
            },
            {
              title: "The report",
              text: (
                <>
                  On <Ui>Wrap-Up</Ui>, tap <Ui>Write Draft</Ui>, edit it, then{" "}
                  <Ui>Review with Customer</Ui> for the signature.
                </>
              ),
            },
            {
              title: "The quote",
              text: (
                <>
                  <Ui>Add From Findings</Ui> builds the repair from the price book. Tap{" "}
                  <Ui>Send Quote</Ui>, then copy the link for the customer.
                </>
              ),
            },
            {
              title: "The repair",
              text: (
                <>
                  Once the quote is accepted, the repair job appears. Do the fix, then tap{" "}
                  <Ui>Mark Complete</Ui> on the card.
                </>
              ),
            },
            {
              title: "Getting paid",
              text: (
                <>
                  <Ui>Create Invoice</Ui>, then <Ui>Send by Email</Ui>. When the money comes in, tap{" "}
                  <Ui>Record Payment</Ui>.
                </>
              ),
            },
          ]}
        />

        <Table
          head={["When you want to…", "Do this"]}
          rows={[
            [
              "Book a new leak job",
              <>
                <Ui>New Job</Ui>, choose <Ui>Leak</Ui>, then <Ui>Start Job</Ui>.
              </>,
            ],
            [
              "Record a pressure test",
              <>
                Findings › Tests › <Ui>Add Test</Ui>, then choose Pressure test.
              </>,
            ],
            [
              "Pin a problem to the pool",
              <>
                Findings › <Ui>Add Finding</Ui>, then tap the diagram.
              </>,
            ],
            [
              "Tell the office about something else you saw",
              <>
                On the job’s Details, tap <Ui>Report an Issue</Ui>.
              </>,
            ],
            [
              "Mark an item you couldn’t check",
              <>On the item, set the result to N/A, then choose a reason.</>,
            ],
            [
              "Write the homeowner report",
              <>
                Wrap-Up › Report › <Ui>Write Draft</Ui>.
              </>,
            ],
            [
              "Get the homeowner’s signature",
              <>
                Wrap-Up › Customer signs › <Ui>Review with Customer</Ui>.
              </>,
            ],
            [
              "Price the repair",
              <>
                Wrap-Up › Quote › <Ui>Add From Findings</Ui>.
              </>,
            ],
            [
              "Find a job by number",
              <>
                Press <Ui>Ctrl+K</Ui> (⌘K on a Mac), or use the search field on Jobs.
              </>,
            ],
            [
              "Bill the detection fee",
              <>
                Wrap-Up › Invoice › <Ui>Create Invoice</Ui>.
              </>,
            ],
            [
              "Record a check or cash payment",
              <>
                On the invoice, tap <Ui>Record Payment</Ui>.
              </>,
            ],
            [
              "Check what hasn’t synced",
              <>
                Read the sync bar under the title, or open More › <Ui>Sync</Ui>.
              </>,
            ],
            [
              "Put a job back on the schedule",
              <>
                On <Ui>Schedule</Ui>, open <Ui>Needs a Time</Ui> and drag the job onto a day.
              </>,
            ],
          ]}
        />

        <Tip>
          Checklist, tests, findings, photos and signatures save on the phone with no signal.
          Writing the report, sending, and taking payments need a connection.
        </Tip>
      </>
    ),
};
