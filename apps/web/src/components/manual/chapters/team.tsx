// WANT (website shots, once the catalog exists): settings-team — /settings/team (list, roles, What
// techs can do); settings-team-invite — the Invite Someone sheet.
import type { ChapterDef } from "../types";
import {
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
  Sub,
  Table,
  Tip,
  Ui,
  UseIt,
  Watch,
  WhyItMatters,
} from "../kit";

export const team: ChapterDef = {
  id: "team",
  title: "The team",
  moment: { pool: "Sunday · 9:15 p.m.", leak: "Sunday · 9:15 p.m." },
  lede: {
    pool: "Luis, Priya and Tony need a way in, and each needs the right amount of it. Dana invites them, gives them roles, and decides what a tech can see.",
    leak: "Jake needs a way in, with the right amount of it. Dana invites him, gives him a role, and decides what a tech can see.",
  },
  learn: [
    "Invite people and send the link yourself",
    "What an owner, an admin and a tech can each do",
    "Decide what techs see, and whether they can make jobs",
    "Turn someone off without losing their jobs",
  ],
  Body: ({ edition }) => (
    <>
      <Scene time="Sunday, 9:15 p.m.">
        <p>
          {edition === "pool"
            ? "The shop is set up. Dana has three names to add and a Monday morning to get them ready for. She opens Settings, then Team, and finds just one row: hers."
            : "The shop is set up. Dana has one name to add, and a detection with Jake riding along tomorrow. She opens Settings, then Team, and finds just one row: hers."}
        </p>
        <p>
          Her row says <Ui>Owner</Ui>. Below it, a heading she hasn’t seen yet:{" "}
          <Ui>What techs can do</Ui>.
        </p>
      </Scene>

      <Section kicker="Inviting" title="A link, sent by you">
        <Meta who={["Owner", "Admin"]} where={["Website"]} />
        <p>
          Sundeck Pro doesn’t email invitations. It makes a link, and you send it the way you
          already talk to your people: a text, an email, a message. The link works once and expires
          in 14 days.
        </p>
        <Steps>
          <Step title="Open the Team page">
            <p>
              <Path items={["Settings", "Team"]} />. People are listed under <Ui>Active</Ui>, with{" "}
              <Ui>Turned off</Ui> and <Ui>Open invites</Ui> below.
            </p>
          </Step>
          <Step title="Press Invite Someone">
            <p>
              Type their <Ui>Email</Ui> and pick a role: <Ui>Owner</Ui>, <Ui>Admin</Ui> or{" "}
              <Ui>Tech</Ui>. Tech is the default, and an admin can only invite techs.
            </p>
          </Step>
          <Step title="Create Invite, then Copy Link">
            <p>
              Paste the link into a text. Press <Ui>Revoke Invite</Ui> if you sent it to the wrong
              person.
            </p>
          </Step>
          <Step title="They open it">
            <p>
              A new person taps <Ui>Create Account and Join</Ui>, types a name and a password, and
              is in. Someone who already has an account taps <Ui>I Already Have an Account</Ui>. The
              email on the invite must match the email they sign in with.
            </p>
          </Step>
        </Steps>
        <Note title="Inviting from a phone">
          The Team page in the apps lists people and edits them, but it says “Invite people from the
          website” and offers <Ui>Open Team on the Website</Ui>. Invites are made on the website.
        </Note>
      </Section>

      <Section kicker="Roles" title="Three roles, three jobs">
        <Table
          head={["Role", "What the app says", "In practice"]}
          rows={[
            [
              "Owner",
              "Everything, including Sundeck Pro billing, payments setup, and who has which role.",
              "Dana. Only an owner can subscribe or change billing, connect the Stripe account, delete the shop, change anyone’s role, or turn an owner off. A shop always keeps one active owner.",
            ],
            [
              "Admin",
              "Office staff: schedule, customers, jobs, quotes, invoices, and settings.",
              edition === "pool"
                ? "The person at the desk. Runs the schedule, maintenance plans, the price book and monthly billing, and can invite and turn off techs. Sees every job."
                : "The person at the desk. Runs the schedule, customers, quotes and invoices, and can invite and turn off techs. Sees every job.",
            ],
            [
              "Tech",
              "Runs jobs on the phone.",
              "Works the route or the deck. No Settings and no Dashboard; the rest depends on the two controls below.",
            ],
          ]}
        />
        <Spread
          flip
          figure={
            <Phone
              src="49-settings-team"
              alt="The Team page on the iPhone: Active with Dana (you) as Owner, Without the app, Completing a job with two switches, and a button to open Team on the website."
              caption="Team on the phone. People who aren’t on the app get a row too."
            />
          }
        >
          <p>
            Tap a person to open their profile: name, phone, email, address, an emergency contact
            and notes, plus <Ui>Start My Day From</Ui> (the shop or home, so their drive times begin
            where they really start), their role, a <Ui>Color</Ui> and an <Ui>On</Ui> switch.
          </p>
          <p>
            <strong>Color</strong> is how a tech shows up on the Schedule. Ten are on offer, from
            Blue to Slate, and a new person gets the first one nobody is using. It saves when you
            tap it.
          </p>
          <p>
            <Ui>Add Person</Ui>, under <Ui>Without the app</Ui>, makes a profile for someone who
            won’t sign in, such as a helper. Only owners and admins see these.
          </p>
        </Spread>
      </Section>

      <Section kicker="Decisions" title="What techs see">
        <p>
          At the bottom of the Team page, owners set the rules for every tech at once. Admins can
          read them but not change them.
        </p>
        <Sub>Techs see</Sub>
        <p>
          A segmented control, <Ui>Every Job</Ui> or <Ui>Only Their Own</Ui>. Every Job is the
          default. With <Ui>Only Their Own</Ui>, a tech sees only jobs where they are the tech or
          the second tech. Customers stay visible to everyone either way, so a tech can still look
          up a gate code or call a homeowner.
        </p>
        <Sub>Techs can make new jobs</Sub>
        <p>A switch, on by default. Turn it off if jobs should only be booked from the office.</p>
        <Sub>Completing a job</Sub>
        <p>
          Two more switches, both off at first, for owners and admins:{" "}
          <Ui>Finish the checklist first</Ui> holds <Ui>Complete Job</Ui> until every checklist item
          has an answer, and <Ui>Take a pool photo first</Ui> asks for a photo of the pool before a
          job can finish.
        </p>
        <Watch title="A photo rule is not a report rule">
          “Take a pool photo first” is about finishing the job. A separate setting,{" "}
          <Ui>Require a Photo</Ui>, controls whether a visit report can go out.{" "}
          {edition === "pool"
            ? "Chapter 4 covers it."
            : "Reports need a photo too, as the hint on the switch says."}
        </Watch>
        <FromTheField title="Why Dana leaves it on Every Job">
          {edition === "pool"
            ? "When Priya is out, Tony can open any of her stops without asking Dana for the gate code. Dana turns on Finish the checklist first, because a customer’s report is only as good as the list behind it."
            : "When Jake is on a job that started as Dana’s, he can open it and see the checklist, tests and photos she already has. Dana turns on Finish the checklist first so a job can’t close with items still unmarked."}
        </FromTheField>
      </Section>

      <Section kicker="Staying safe" title="Turn off, don’t delete">
        <p>
          When someone leaves, flip the switch at the end of their row. The app asks “Turn off{" "}
          <em>Name</em>?” and says they can’t sign in and their coming jobs stay as they are. Press{" "}
          <Ui>Turn Off</Ui>. Turning back on asks nothing.
        </p>
        <p>
          You can’t turn yourself off, and an admin can’t turn off an owner. Because the price
          follows the number of active people, turning someone off lowers it, prorated.
        </p>
        <Tip title="Two-step for everyone">
          Two-step sign-in is per person and optional; there is no shop-wide switch. Ask each person
          to turn it on in <Path items={["More", "Two-Step Sign-In"]} />. It matters most for owners
          and admins, whose accounts can see billing and every customer.
        </Tip>
      </Section>

      <Section kicker="Staying informed" title="Notifications, each person’s own">
        <p>
          Everyone chooses what pings them, in <Path items={["More", "Notifications"]} />. All of
          them start on: <Ui>Customer texts</Ui>, <Ui>New and moved jobs</Ui>,{" "}
          <Ui>Accepted quotes</Ui>, <Ui>Payments</Ui>, <Ui>Signed reports</Ui>,{" "}
          <Ui>Opened reports</Ui>, <Ui>Live Activity</Ui> (the current stop on the Lock Screen) and{" "}
          <Ui>Start of the day</Ui>. Owners and admins also get a <Ui>Weekly summary</Ui> email on
          Monday morning, which is on for owners and off for admins.
        </p>
        <UseIt
          items={[
            {
              who: "Dana, at a stop",
              text: "Keeps Payments on, so a homeowner’s card payment buzzes her phone before she’s back in the truck.",
            },
            {
              who: edition === "pool" ? "Priya, on her route" : "Jake, on the deck",
              text: "Keeps New and moved jobs on, so a change to tomorrow’s stops reaches her tonight.",
            },
          ]}
        />
        <Note title="Phone permission comes first">
          Notifications also need to be allowed in the iPhone’s own settings. If they’re off there,
          the Sundeck Pro page says so and offers <Ui>Open Settings</Ui>.
        </Note>
      </Section>

      <WhyItMatters title="Why roles matter on day one">
        Office staff can run the schedule and send invoices without being able to change billing or
        who owns the shop. Techs get a phone that opens on their work. Nobody’s access is more than
        their job needs, and nobody’s job is hidden from them by accident.
      </WhyItMatters>
    </>
  ),
};
