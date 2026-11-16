import type { ChapterDef } from "../types";
import {
  Browser,
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
  WhyItMatters,
} from "../kit";

export const lookingBack: ChapterDef = {
  id: "looking-back",
  title: "Looking back",
  moment: "Friday · 4:30 p.m.",
  lede: {
    pool: "At the end of the week, Dana wants to know what got done, who owes what, and what’s waiting on a customer. Four screens answer that, and none of them needs a spreadsheet.",
    leak: "At the end of the week, Dana wants to know which jobs are waiting on a homeowner, who owes what, and how many quotes turned into repairs. Four screens answer that, and none of them needs a spreadsheet.",
  },
  learn: [
    "Read the Dashboard’s tiles and charts",
    "Find any job by status, type and date",
    "Find a sent report and send it again",
    "Filter the customer list",
    "Get the weekly summary by email",
  ],
  Body: ({ edition }) => (
    <>
      <Scene time="Friday, 4:30 p.m.">
        <p>
          {edition === "pool"
            ? "The trucks are back. Priya’s last report went out at 3:50. Dana gets a glass of water and opens the Dashboard."
            : "Jake’s truck is back at the shop. The last report went out at 3:50. Dana gets a glass of water and opens the Dashboard."}
        </p>
        <p>
          It’s the same screen she opened Monday morning. It’s just that now there’s a week’s worth
          of work behind it.
        </p>
      </Scene>

      <Section kicker="The owner’s first screen" title="The Dashboard">
        <Meta who={["Owner", "Admin"]} where={["Website", "iPhone", "Android"]} />
        <p>
          On a computer, <Ui>Dashboard</Ui> is the first tab. On a phone it’s under{" "}
          <Path items={["More", "Dashboard"]} />. Only owners and admins have it. A subtitle says
          the span: “Last 6 months · May 2026 – Oct 2026”.
        </p>
        <Spread
          figure={
            <Phone
              src="70-dashboard"
              alt="The Dashboard: tiles for customers, collected, owed to you, quotes accepted and invoiced; a bar chart, Collected by Month; and Jobs by Status."
              caption="Tiles on top, then two charts. Every number opens what’s behind it."
            />
          }
        >
          <Table
            head={["Tile", "What it counts"]}
            rows={[
              [<Ui key="a">Customers</Ui>, "How many, and how many are new in the last 30 days."],
              ...(edition === "pool"
                ? [
                    [
                      <Ui key="b">On a plan</Ui>,
                      "Customers with a maintenance plan, and their share of the whole. Opens the customer list on On a Plan.",
                    ],
                  ]
                : []),
              [<Ui key="c">Collected</Ui>, "Payments received over the six months."],
              [<Ui key="d">Owed to you</Ui>, "Unpaid balances, with a link to Open invoices."],
              [<Ui key="e">Quotes accepted</Ui>, "A percentage, and “12 of 21 sent”."],
              [<Ui key="f">Invoiced</Ui>, "Total invoiced over the six months."],
            ]}
          />
        </Spread>
        <Sub>The charts</Sub>
        <p>
          <strong>Collected by Month</strong> shows payments received by card, bank or check, a bar
          for each month. <strong>Jobs by Status</strong> counts every job as of now: Scheduled, In
          progress, Report sent, Invoiced, Paid. Tap a row and you’re in the Jobs list filtered to
          that status. Under them, <strong>By Month</strong> lists quotes sent and accepted,
          invoiced, collected and still owed for each month.
        </p>
        <Note title={edition === "leak" ? "Two things to know" : "Good to know"}>
          {edition === "leak" ? "The sample job isn’t counted. " : ""}The Dashboard shows the
          office’s totals, so it needs a connection.
        </Note>
      </Section>

      <Section kicker="Every job, found" title="The Jobs list">
        <p>
          The <Ui>Jobs</Ui> tab starts on <Ui>Open</Ui>, the work not yet done. The pills across the
          top change that: <Ui>Unscheduled</Ui>, <Ui>Scheduled</Ui>, <Ui>In Progress</Ui>,{" "}
          <Ui>Waiting on Customer</Ui>, <Ui>Paid</Ui>, <Ui>Done</Ui>, <Ui>Canceled</Ui> and{" "}
          <Ui>All</Ui>.
        </p>
        <Spread
          flip
          figure={
            <Phone
              src="02-jobs"
              alt="The Jobs tab: a Jobs and Reports control, filter chips Open, Unscheduled, Scheduled and In Progress, and rows with customer, job number, type and a status pill."
              caption="Each row: customer, number and type, and a status pill."
            />
          }
        >
          <p>
            <Ui>Waiting on Customer</Ui> is the one to look at on Friday. It holds everything where
            the next move is theirs: a report sent, a quote sent or accepted, an invoice out.
          </p>
          <p>
            <Ui>Type</Ui> narrows to the kinds of work your shop does.{" "}
            {edition === "pool"
              ? "Maintenance and Repair"
              : "Leak Detection, Repair and Pool Inspection"}
            . <Ui>Sort</Ui> orders by <Ui>Scheduled Date</Ui>, <Ui>Newest</Ui>, <Ui>Oldest</Ui>,{" "}
            <Ui>Customer</Ui> or <Ui>Job Number</Ui>. The three settings work together and stay in
            the page address, so a view can be bookmarked.
          </p>
          <p>
            Status words in the pills: Unscheduled, Scheduled, In progress, Report sent, Quote sent,
            Quote accepted, Invoiced, Paid, Canceled, Done.
          </p>
        </Spread>
        <Browser
          src="jobs"
          url="sundeckpro.com/jobs"
          alt="The website’s Jobs list: a Jobs and Reports control, status pills from Open to All, a search box, Type and Sort menus, and a table with Job, Customer and address, Status, When and Tech."
          caption="On a computer, the search box takes a customer name or a job number."
        />
        <Tip title="Swipe and hold">
          Swipe a row left for <Ui>Call</Ui> and <Ui>Directions</Ui>, right for{" "}
          <Ui>Mark Complete</Ui>. Touch and hold for <Ui>Open</Ui>, <Ui>Call</Ui>, <Ui>Message</Ui>,{" "}
          <Ui>Directions</Ui>, <Ui>Move…</Ui> and <Ui>Copy Job Number</Ui>.
        </Tip>
        <Sub>Reports</Sub>
        <p>
          The <Ui>Reports</Ui> segment beside <Ui>Jobs</Ui> lists every report. Filter by{" "}
          <Ui>All</Ui>, <Ui>Sent</Ui> or <Ui>Drafts</Ui>. Each row says its kind, a{" "}
          {edition === "pool"
            ? "Visit report or Monthly service report"
            : "Homeowner report or Pool inspection report"}
          , and “Sent Oct 22” or “Draft”. The menu has <Ui>Open</Ui>, <Ui>Copy Customer Link</Ui>{" "}
          and <Ui>Resend</Ui>.
        </p>
        <Browser
          src="jobs-reports"
          url="sundeckpro.com/jobs/reports"
          alt="The Reports list: filter pills All, Sent and Drafts, and rows with the customer, the job number, the report kind and when it was sent."
          caption="A customer says they never got it? Find it here and Resend."
        />
      </Section>

      <Section kicker="Who we serve" title="The customer list">
        <p>
          <Ui>Customers</Ui> is under <Ui>More</Ui>. It searches by name, phone or email, and has
          two menus that matter.
        </p>
        <Spread
          figure={
            <Phone
              src="44-customers"
              alt="The Customers list: a search field, rows with a name, phone and pool address, and toolbar icons for filter, sort and Email Customers."
              caption="Names with phones and addresses. The icons are filter, sort and email."
            />
          }
        >
          <p>
            <Ui>Show</Ui> narrows by kind, each with its count: <Ui>All Customers</Ui>
            {edition === "pool" ? (
              <>
                , <Ui>On a Plan</Ui> and <Ui>No Plan</Ui>
              </>
            ) : null}
            , <Ui>Homeowners</Ui>, <Ui>Pool Companies</Ui>, <Ui>Builders</Ui>, <Ui>Insurers</Ui>,{" "}
            <Ui>Property Managers</Ui> and <Ui>Other</Ui>.
          </p>
          <p>
            <Ui>Sort</Ui> orders by <Ui>Name A–Z</Ui>, <Ui>Name Z–A</Ui>, <Ui>Newest</Ui>,{" "}
            <Ui>Oldest</Ui>, <Ui>Last Visit</Ui> or <Ui>City</Ui>. The same <Ui>Show</Ui> choices
            drive <Ui>Email Customers</Ui>, so you can write to exactly the list you’re looking at.
          </p>
        </Spread>
        <Browser
          src="customers"
          url="sundeckpro.com/customers"
          alt="The website’s Customers list with search, Sort and Show menus, and the Email Customers button beside the title."
          caption="The same list on a computer, with the Email Customers button by the title."
        />
      </Section>

      <Section kicker="Without opening anything" title="The weekly summary">
        <p>
          On Monday morning, owners can get an email: last week’s jobs and money, and the quotes
          still waiting. Turn it on or off in <Path items={["More", "Notifications"]} />, under{" "}
          <Ui>Email</Ui> › <Ui>Weekly summary</Ui>. It’s on by default for owners and off for
          admins. Each email has a link to turn it off in one tap.
        </p>
        <Steps>
          <Step
            title={
              <>
                Open <Ui>More</Ui> › <Ui>Notifications</Ui>.
              </>
            }
          >
            It’s one of the account rows.
          </Step>
          <Step
            title={
              <>
                Switch <Ui>Weekly summary</Ui> on or off.
              </>
            }
          >
            It’s only there for owners and admins.
          </Step>
        </Steps>
      </Section>

      <Section kicker="What happened, and when" title="Activity, one more time">
        <p>
          The Dashboard tells you how things stand. <Ui>Activity</Ui> tells you what happened,{" "}
          <em>when</em>. Open it from <Ui>More</Ui>: the newest first, grouped by day, fifty at a
          time. Use its <Ui>Type</Ui> menu, as in Jobs, to look at only one kind of event.
        </p>
        <Browser
          src="activity"
          url="sundeckpro.com/activity"
          alt="The Activity page: a Type menu set to All Types, then a Today group of rows reading Job completed with a customer, the tech’s name and the time."
          caption="What happened, newest first. The Type menu narrows it to one kind."
        />
        <Note title="Online only">
          Activity and the Dashboard come from the office’s records, so they say “Activity shows
          when you’re online” if there’s no signal.
        </Note>
      </Section>

      <PullQuote>What happened this week? Open the Dashboard, then Activity.</PullQuote>

      <UseIt
        items={[
          {
            who: "Friday: who’s waiting on us?",
            text: (
              <>
                Jobs › <Ui>Waiting on Customer</Ui>. Everything in that pill is waiting on someone
                outside the shop.
              </>
            ),
          },
          {
            who: "Money check",
            text: "Dashboard › Owed to you › Open invoices, then send reminders from the invoice list.",
          },
          {
            who: "“Did you get my report?”",
            text: "Jobs › Reports › find the row. It says if it was sent, and when. Resend from its menu.",
          },
          {
            who: edition === "pool" ? "Spring mailing" : "Winter mailing",
            text: "Customers › Show, then Email Customers to just that group.",
          },
        ]}
      />

      <FromTheField title="From the field">
        Pick one day for the look back and keep it. A shop that checks Owed to you every Friday
        finds out about a problem invoice in days, not in the quarterly books.
      </FromTheField>

      <WhyItMatters>
        {edition === "pool"
          ? "Every number on the Dashboard is made from the work the techs did and the payments that came in. Nobody keyed it in a second time, so there is no second number to argue with."
          : "Every number on the Dashboard is made from the inspections, quotes and payments the shop already did. Nobody keyed it in a second time, so there is no second number to argue with."}
      </WhyItMatters>
    </>
  ),
};
