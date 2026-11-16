import type { ChapterDef } from "../types";
import {
  BigFigure,
  Flow,
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
  Tip,
  Ui,
  UseIt,
  Watch,
  WhyItMatters,
  FromTheField,
  Browser,
} from "../kit";

export const routeOver: ChapterDef = {
  id: "route-over",
  title: "Bringing the route over",
  moment: "Saturday · 8:20 p.m.",
  lede: "Canyon State’s customers have lived in a spreadsheet for years. Dana moves them in one file, then gives each pool a day, a price and a plan.",
  learn: [
    "Import a customer list from a CSV file",
    "Read the preview before you commit",
    "Add a pool by hand and set a maintenance plan",
    "Use “On a Plan” to see who’s covered and who isn’t",
  ],
  Body: () => (
    <>
      <Scene time="Saturday, 8:20 p.m.">
        <p>
          The spreadsheet has a tab for each tech and a column for each day. Luis’s route runs down
          the first one: names, streets, a gate code in the notes, and a price that’s been the same
          since 2022.
        </p>
        <p>
          Dana doesn’t retype it. She saves the sheet as a CSV file, opens Settings, and looks for
          the line she’s been told about: <Ui>Import Customers</Ui>.
        </p>
      </Scene>

      <Section kicker="The big move" title="Import from a spreadsheet">
        <Meta who={["Owner", "Admin"]} where={["Website"]} />
        <p>
          Export your list as a CSV file from whatever you use now: Skimmer, Pool Brain, Jobber,
          QuickBooks, Excel or Google Sheets. Each row becomes a customer, their pool, and their
          visit plan. Importing happens on the website only; on a phone, the app tells you to do it
          from a computer.
        </p>
        <Steps>
          <Step title="Choose CSV File">
            <p>
              <Path items={["Settings", "Import Customers"]} />. A spreadsheet file isn’t read
              directly: save it as CSV first (File › Save As in Excel, Download › CSV in Google
              Sheets). The file has to be under 5 MB. <Ui>Download a template</Ui> gives you a CSV
              with the right headings to fill in.
            </p>
          </Step>
          <Step title="Match the columns">
            <p>
              Sundeck Pro matches columns by their headings. Check each one, set anything wrong, and
              choose <Ui>Don’t import</Ui> for what you don’t need. The customer’s name column is
              the one you must pick.
            </p>
          </Step>
          <Step title="Check File">
            <p>
              A preview counts the <Ui>Customers</Ui>, <Ui>Pools</Ui> and <Ui>Visit plans</Ui> it
              would make, flags rows <Ui>Worth a look</Ui>, and shows <Ui>The first few</Ui>.
              Nothing has been added yet.
            </p>
          </Step>
          <Step title="Import">
            <p>
              Press <Ui>Import N Customers</Ui>. It reports “Imported N customers and N pools, with
              N visit plans on the schedule.” Then <Ui>See Customers</Ui> or{" "}
              <Ui>See the Schedule</Ui>.
            </p>
          </Step>
        </Steps>
        <Flow
          stages={[
            { title: "Export", text: "A CSV from your old tool or sheet." },
            { title: "Match", text: "Headings line up with Sundeck Pro’s fields." },
            { title: "Preview", text: "Counts, and rows worth a look." },
            { title: "Import", text: "Customers, pools and plans appear on the schedule." },
          ]}
        />
        <Browser
          src="settings-import"
          url="sundeckpro.com/settings/import"
          alt="The website’s Import Customers page: a note about exporting a CSV file from the software or spreadsheet you use now, a Choose CSV File button, and a Download a template link."
          caption="Import Customers: choose the file, or download the template and fill it in."
        />
        <Note title="What it understands">
          Customer name (or First and Last name), company, email, phone, a full address or street,
          unit, city, state and ZIP, pool gallons and type, gate code or access, notes, service day,
          how often, price per visit or monthly price, and tech. A price per visit becomes a monthly
          price, worked out from how often the pool is visited. A plan with several service days
          uses the first.
        </Note>
        <Tip title="Safe to run twice">
          Customers already in Sundeck Pro, matched by email, phone, or name and address, are left
          out. If the file is a mess, run it again after cleaning it up. It also goes all or
          nothing, in one piece, so a bad file never leaves half a route behind.
        </Tip>
        <Watch title="Two limits">
          A single import reads the first 2,000 rows. A tech named in the file who hasn’t joined
          Sundeck Pro yet shows as a row worth a look; invite your team first (Chapter 3) and the
          names will match.
        </Watch>
      </Section>

      <Section kicker="One at a time" title="Customers and their pools">
        <p>
          Not everyone comes through a file. A new customer calls on Tuesday, or the import left out
          a pool. The customer page holds what you need.
        </p>
        <Spread
          figure={
            <Phone
              src="45-customer"
              alt="A customer page on the iPhone: Homeowner label, round call, message and email buttons, Contact, Pool with access notes and a Chemical row, Maintenance, and a repairs group."
              caption="A customer: contact, pool, maintenance, repairs. Everything one house needs."
            />
          }
        >
          <p>
            The top shows the name, the kind of customer and three round buttons: call, text, email.
            Under it, groups: <Ui>Contact</Ui>, <Ui>Pool</Ui> (address, access notes, a{" "}
            <Ui>Chemical</Ui> row, <Ui>Get Directions</Ui>) and <Ui>Maintenance</Ui>, where the plan
            lives. Repairs get their own group below.
          </p>
          <p>
            A customer with two pools shows <Ui>Pool 1</Ui> and <Ui>Pool 2</Ui>, each with its own
            Maintenance group.
          </p>
        </Spread>
        <Spread
          flip
          figure={
            <Phone
              src="45-pool-details"
              alt="The Pool Details sheet: street, unit, city, state, ZIP, Pool type, Gallons, a Has a spa switch, and Access notes, with a Save button."
              caption="Pool Details. Gallons and access notes earn their keep at the pool."
            />
          }
        >
          <p>
            Tap the address row, then <Ui>Edit</Ui>, to open <Ui>Pool Details</Ui>. Fill in{" "}
            <Ui>Pool type</Ui> (Gunite / plaster, Vinyl, Fiberglass, Other), <Ui>Gallons</Ui> and{" "}
            <Ui>Access notes</Ui>: “Gate code, dog, where to park.”
          </p>
          <p>
            Gallons fill in the chemical calculator on every visit, and the access notes sit right
            where a tech at the gate will look for them.
          </p>
        </Spread>
        <Note title="Kinds of customer">
          Each customer has a kind: Homeowner, Pool Company, Builder, Insurer, Property Manager or
          Other. The customer list’s <Ui>Show</Ui> menu filters by them.
        </Note>
      </Section>

      <Scene time="8:55 p.m.">
        <p>
          Dana scrolls the imported list. Two hundred and some names, each with a pool, and none
          with a plan she trusts. The spreadsheet had a day and a price, and the import brought them
          over, but she wants to see each one with her own eyes, and she wants to add a customer she
          signed this morning.
        </p>
      </Scene>

      <Section kicker="The plan" title="A day, how often, how much">
        <p>
          A <strong>maintenance plan</strong> is what makes a pool part of the route: a service day,
          a repeat, a price per month and a tech. Sundeck Pro makes the visits from it, some weeks
          ahead, and again every morning, so the schedule fills itself.
        </p>
        <Steps>
          <Step title="Open New Job and choose Service">
            <p>
              The <Ui>Job</Ui> control offers <Ui>Service</Ui> and <Ui>Repair</Ui>. Pick the
              customer (<Ui>New</Ui> or <Ui>Existing</Ui>) and their pool.
            </p>
          </Step>
          <Step title="Set Repeats">
            <p>
              <Ui>Just once</Ui>, <Ui>2+ a Week</Ui>, <Ui>Weekly</Ui>, <Ui>Biweekly</Ui> or{" "}
              <Ui>Monthly</Ui>. Anything but Just once turns the button into <Ui>Start Plan</Ui>.
              For 2+ a Week, tap the days.
            </p>
          </Step>
          <Step title="Fill in the plan">
            <p>
              <Ui>First visit</Ui> (its weekday is the service day), an optional <Ui>Time</Ui> that
              route planning fills in if you leave it blank, <Ui>Visit length</Ui>, a <Ui>Tech</Ui>,{" "}
              <Ui>Price per month ($)</Ui> and <Ui>Invoice day</Ui>.
            </p>
          </Step>
          <Step title="Start Plan">
            <p>
              Only owners and admins start plans. On a phone, starting a plan needs a signal,
              because the office makes the visits; the button is off while the phone is offline.
            </p>
          </Step>
        </Steps>
        <Gallery caption="Left: starting a plan. Right: the same plan after it exists, as a sheet you can pause or end.">
          <Phone
            src="51-new-plan"
            alt="New Job with Service selected: Repeats set to 2+ a Week, day toggles, First visit, Time, Visit length, Tech, Price per month, Invoice day, and a Start Plan button."
            caption="Start Plan"
          />
          <Phone
            src="50-plan-sheet"
            alt="The Maintenance Plan sheet: Repeats Weekly, First visit, Tech, Time, Visit length, Price per month, Invoice day, Notes, with Save Plan, Pause and End Plan."
            caption="Maintenance Plan"
          />
        </Gallery>
        <p>
          Once it’s running, the plan sums itself up on the customer’s page: “Every Monday · 10:00
          AM · 45 min · $180.00 a month”, the tech, the next three dates, and how many visits are
          done. Individual maintenance visits aren’t listed on the customer page; the plan stands
          for them.
        </p>
        <Phone
          src="49-customer-plans"
          size="sm"
          alt="A customer’s Maintenance group showing one plan: Every Monday, 10 AM, 45 min, $180 a month, the tech, the next dates and zero done."
          caption="The plan as it shows on the customer."
        />
        <UseIt
          title="Plans in practice"
          items={[
            {
              who: "A weekly customer, $180 a month",
              text: "Mondays at 10 a.m., 45 minutes, Tony. First visit set; the next dates fill the schedule.",
            },
            {
              who: "A biweekly pool, quieter yard",
              text: "Biweekly on Tuesdays. The price is still per month, so one number covers the whole plan.",
            },
            {
              who: "A pause for the summer away",
              text: "Pause on the plan. Its coming visits leave the schedule; the customer still counts as On a Plan.",
            },
          ]}
        />
        <Watch title="Regular cleanings are set on the website">
          Filter and salt cell cleanings, the things done every few months rather than every visit,
          are set in the plan’s <Ui>Regular Cleanings</Ui> section on the website. The phone’s plan
          sheet says so: “Regular cleanings, like a filter every 3 months, are set on the website.”
        </Watch>
        <FromTheField title="Changing a day moves the visits">
          Change the first visit’s date, or drag a customer to another day on the Schedule, and the
          coming visits are made again to match.
        </FromTheField>
      </Section>

      <Section kicker="Checking your work" title="Who is on a plan, and who isn’t">
        <p>
          On <Ui>Customers</Ui>, the <Ui>Show</Ui> menu counts people: <Ui>All Customers</Ui>,{" "}
          <Ui>On a Plan</Ui>, <Ui>No Plan</Ui>, then each kind. A customer is On a Plan if they have
          a plan that hasn’t ended, and a paused plan still counts. <Ui>Sort</Ui> by name, newest,
          last visit or city.
        </p>
        <Browser
          src="customers-filter"
          url="sundeckpro.com/customers"
          alt="The Customers page with the Show menu open: All Customers (248), On a Plan (150), No Plan (98), Homeowners (236), Pool Companies (6), Builders (2), Insurers (0), Property Managers (4) and Other (0), beside the Sort menu set to Name A–Z."
          caption="The Show menu counts everyone: On a Plan and No Plan sit right under All Customers."
        />
        <BigFigure
          value="No Plan"
          label="The list of customers with a pool and no regular service. Every name on it is someone you could call."
        />
        <WhyItMatters title="Why the import is worth an evening">
          The old spreadsheet could tell Dana where a pool was. It couldn’t tell her which customers
          had no plan, who was paused, or what Luis’s Monday would be worth. Once the route is in,
          those are filters, and the schedule for Monday is already built.
        </WhyItMatters>
      </Section>
    </>
  ),
};
