import type { ChapterDef } from "../types";
import {
  Browser,
  Flow,
  FromTheField,
  Meta,
  Note,
  Path,
  Phone,
  Scene,
  Section,
  Spread,
  Steps,
  Step,
  Sub,
  Table,
  Tip,
  Ui,
  UseIt,
  Watch,
  WhyItMatters,
  Gallery,
  PullQuote,
} from "../kit";

export const weekAhead: ChapterDef = {
  id: "week-ahead",
  title: { pool: "Sunday night: the week ahead", leak: "Booking it" },
  moment: { pool: "Sunday · 8:15 p.m.", leak: "Tuesday · 4:40 p.m." },
  lede: {
    pool: "The week is built on Sunday night, in one sitting, on one screen. See every route, fix what’s lopsided, and let the trucks leave Monday with the stops in a sensible order.",
    leak: "A detection is booked once the right tech, the right day and the right time line up. See how a new job finds its place in Dana’s day without a phone call to anyone.",
  },
  learn: {
    pool: [
      "Read the schedule by day, week and month",
      "See every tech’s route at once",
      "Move a stop, and keep a customer on their day",
      "Optimize a day or a whole week",
      "Place a new customer on a route",
    ],
    leak: [
      "Find the job that still needs a time",
      "Pick a time that adds no driving",
      "Read the day’s route and drive times",
      "Move a stop without losing a promised time",
    ],
  },
  Body: ({ edition }) => (
    <>
      {edition === "pool" ? (
        <Scene time="Sunday, 8:15 p.m.">
          <p>
            The dishes are done. Dana opens the laptop at the kitchen table and goes to{" "}
            <Ui>Schedule</Ui>. The week is already on the screen: three techs, five days, a few
            hundred stops in colored rows.
          </p>
          <p>
            Last winter this was a whiteboard and a lot of erasing. Tonight she’s looking for three
            things: a day that’s too heavy, a customer with no day at all, and a truck driving back
            and forth across Mesa when it doesn’t have to.
          </p>
        </Scene>
      ) : (
        <Scene time="Tuesday, 4:40 p.m.">
          <p>
            Maria Alvarez’s call ended ten minutes ago. Dana typed the job in while they talked:
            Maria’s name, the Mesa address, “losing an inch a day.” Now the job exists, but it isn’t
            on anyone’s route.
          </p>
          <p>
            She opens <Ui>Schedule</Ui>. Maria can do Wednesday and will be home all day. Dana’s
            Wednesday already has a detection and a spa line test, both in the afternoon, so the
            question is only where Maria fits with the least driving.
          </p>
        </Scene>
      )}

      <Section kicker="One board" title="Day, Week, Month">
        <Meta who={["Owner", "Admin", "Tech"]} where={["Website", "iPhone", "Android"]} />
        <p>
          The <Ui>Schedule</Ui> tab is the whole shop’s calendar. A segmented control at the top
          switches between three views of it: <Ui>Day</Ui>, <Ui>Week</Ui> and <Ui>Month</Ui>. Use
          the ‹ and › arrows, or the date in the middle, to move around. In <Ui>Day</Ui>, a swipe
          left or right does the same.
        </p>
        <Spread
          figure={
            <Phone
              src="31-schedule-day"
              alt="The Schedule tab in Day view: Day, Week and Month control, a week strip, tech pills, a Map section with Optimize and Maps buttons, a Needs a Time row with a count, and a tech’s numbered stops."
              caption="Day: the map, the buttons, the unplaced work, then each tech’s stops in order."
            />
          }
        >
          <Sub>Day</Sub>
          <p>
            One day, stop by stop. At the top is the <Ui>Map</Ui> with a line like “3 stops · 1 hr
            45 min driving”, and two buttons: <Ui>Optimize</Ui> and <Ui>Maps</Ui>, which opens the
            day’s route in your maps app. Below it, each tech gets a block: a numbered tile for
            every stop, the drive time to it, the time, and the street.
          </p>
          <Sub>Week</Sub>
          <p>
            Every day of the week in rows, with each tech’s stops and total driving. Today is
            highlighted. This is the view for Sunday night.
          </p>
          <Sub>Month</Sub>
          <p>
            A calendar with each day’s job count. Tap a day and it opens that day’s route. Good for
            answering “how booked are we the week of the 23rd?” in a glance.
          </p>
        </Spread>
        <Browser
          src="schedule-day"
          url="sundeckpro.com/schedule"
          alt="The website’s Schedule in Day view for Tuesday, Nov 10: a Day, Week, Month control, a week strip, Needs a Time with four jobs, and a column for each tech with a Maps button, a route map, numbered stops and the driving time."
          caption="Day on a computer: Needs a Time on the left, then a column for each tech with their own route map."
        />
        <Note title="Who sees what">
          Owners and admins see everyone and can plan. A tech sees their own work, and can move
          their own stops. <Ui>Needs a Time</Ui> and the planning buttons belong to the office.
        </Note>
      </Section>

      <Section
        kicker={edition === "pool" ? "Everyone at once" : "Whose day"}
        title={edition === "pool" ? "The team week" : "Seeing both trucks"}
      >
        <p>
          Under the Day, Week and Month control is a row of pills: <Ui>Me</Ui>, each tech with a
          color dot, and <Ui>Everyone</Ui>. Pick <Ui>Everyone</Ui> in <Ui>Week</Ui> and every tech’s
          row shows for every day, each in their own color. The color is just a cue; the name is
          always there too.
        </p>
        <Browser
          src="schedule-week"
          url="sundeckpro.com/schedule?view=week"
          alt="The website’s Schedule in Week view: Needs a Time on the left, a Maps row with a pill for each tech and Optimize Week, a small route map with an Optimize button for each day, and a grid of each tech’s stops under each day."
          caption="Week on a computer: Needs a Time stays on the left, a map for each day sits on top, each tech’s stops below."
        />
        <p>
          {edition === "pool"
            ? "Watch the stop counts and the driving totals. If Luis has twelve stops on Thursday and Priya has seven, that’s the thing to fix tonight."
            : "With Dana and Jake both on detections, a quick look tells you who has the lighter afternoon. The board refreshes by itself as stops are finished."}
        </p>
        <Tip title="The board stays current">
          On the website the schedule checks for changes every few seconds, and the apps sync about
          every 15 seconds while Schedule is open. When a tech finishes a stop, you see it.
        </Tip>
        <Sub>Put the techs in your order</Sub>
        <p>
          The columns and rows follow one saved order for the whole shop. To change it, tap the up
          and down arrows at the end of the pills.
        </p>
        <Steps>
          <Step
            title={
              <>
                Tap <Ui>Reorder Techs</Ui> (the ↑↓ icon).
              </>
            }
          >
            It appears once you have two or more active techs.
          </Step>
          <Step title="Drag each tech by the grip into place.">
            Or use <Ui>Move Up</Ui> and <Ui>Move Down</Ui>.
          </Step>
          <Step
            title={
              <>
                Tap <Ui>Done</Ui>.
              </>
            }
          >
            “Order saved.” The same order shows on the pills, the Move sheet and Today.
          </Step>
        </Steps>
      </Section>

      {edition === "pool" ? (
        <>
          <Section kicker="Every customer has a day" title="Customers to Add">
            <p>
              Dana signed a new weekly customer on Friday. They have a plan but no service day yet,
              so they’re waiting in <Ui>Customers to Add</Ui>, on the left in <Ui>Week</Ui>. When
              every plan has a day, the box says “Every customer has a day.”
            </p>
            <Steps>
              <Step title="Drag the customer’s tile onto a day and a tech.">
                The whole tile drags.
              </Step>
              <Step
                title={
                  <>
                    Or tap <Ui>Suggest Days</Ui>.
                  </>
                }
              >
                It proposes days that group the customer near stops you already have.
              </Step>
              <Step title="Check the driving total on that row.">
                If it jumped, try another day.
              </Step>
            </Steps>
            <Note title="Pool care shops only">
              Customers to Add appears when your shop does maintenance. The plan itself, with its
              day, price and tech, is set on the customer’s page (see “Bringing the route over”).
            </Note>
          </Section>
        </>
      ) : null}

      <Section kicker="The part that never falls through" title="Needs a Time">
        <p>
          {edition === "pool"
            ? "A customer calls Saturday about a pump that hums. Dana adds a repair job. It’s real work, but nobody has been told when. It goes into "
            : "Maria’s job is waiting in "}
          <Ui>Needs a Time</Ui>, with every other job that isn’t on a route: no time yet, or a time
          but no tech. On a phone it’s one row with a blue count that opens a list. On a computer
          it’s the sidebar.
        </p>
        <Spread
          flip
          figure={
            <Phone
              src="32-schedule-week"
              alt="The Schedule tab in Week view: Needs a Time with a count of 2, Customers to Add reading Every customer has a day, an Optimize Week button, and the week’s rows."
              caption="Week on a phone. The Needs a Time row is the to-do list for the whole schedule."
            />
          }
        >
          <p>Each card in the list has two ways out:</p>
          <Steps>
            <Step
              title={
                <>
                  Tap <Ui>…</Ui> then <Ui>Suggest Times</Ui>.
                </>
              }
            >
              Sundeck Pro lists open slots, and says which ones <Ui>Adds no driving</Ui> or would be
              the <Ui>First stop</Ui> of someone’s day.
            </Step>
            <Step
              title={
                <>
                  Or tap <Ui>Move…</Ui>, or drag the card.
                </>
              }
            >
              On a computer, drop the card on a day and a tech. On a phone, <Ui>Move…</Ui> picks the
              day and tech for you.
            </Step>
          </Steps>
          <p>
            Drag a stop back onto the box to take it off its day, the same as{" "}
            <Ui>Take Off Schedule</Ui> in the tile’s menu. Jobs already in progress stay put.
          </p>
        </Spread>
      </Section>

      <Section kicker="Moving things" title="Drag it, and know what it keeps">
        <p>
          Everything on the board moves by hand. On a phone, touch and hold a tile for a moment
          until it lifts, then drag. A quick tap only opens the job, and swiping up and down just
          scrolls. On a computer, press on the tile (not the customer’s name) and drag. The other
          tiles slide aside so you see where it will land, and it saves when you let go.
        </p>
        <p>
          Drop a stop onto another day or another tech’s block and it moves there. The ordinary{" "}
          <Ui>…</Ui> menu on each tile is the alternative: <Ui>Open</Ui>, <Ui>Move…</Ui>,{" "}
          <Ui>Lock Day</Ui>, <Ui>Lock Time</Ui>, <Ui>Take Off Schedule</Ui> and <Ui>Directions</Ui>.
        </p>
        <Sub>Locks</Sub>
        <p>
          Some stops were promised. Set a lock on the job and the schedule respects it. A lock icon
          on the tile shows which kind.
        </p>
        <Table
          head={["Lock", "What it keeps"]}
          rows={[
            [<Ui key="d">Day</Ui>, "The stop stays on its day. Optimize won’t move it to another."],
            [<Ui key="t">Time</Ui>, "The customer was given a time. It never moves on its own."],
            [<Ui key="b">Both</Ui>, "Same day and same time."],
          ]}
        />
        <Note title="Two techs, one job">
          A job with two techs moves for both. The banner says so: “Moved. Jake Turner’s visit moved
          too.”
        </Note>
        {edition === "pool" ? (
          <>
            <Sub>A weekly customer is different</Sub>
            <p>
              Move a stop that belongs to a weekly plan and Sundeck Pro asks what you mean. Weekly
              customers keep their day and their tech unless you say otherwise.
            </p>
            <Table
              head={["Choice", "What happens"]}
              rows={[
                [
                  <Ui key="c">Change Schedule</Ui>,
                  "Every coming visit moves to the new weekday and tech. The banner says “Ochoa is now on Thursdays with Luis,” with Undo.",
                ],
                [
                  <Ui key="j">Just This Visit</Ui>,
                  "Only this one moves. “Moved this visit only,” with Undo.",
                ],
              ]}
            />
            <Watch title="Check which one you picked">
              The two choices look alike and do very different things. When a customer says “we’re
              away this Friday,” that’s Just This Visit. When they say “can you come Thursdays from
              now on,” it’s Change Schedule. Both have Undo, but only right away.
            </Watch>
          </>
        ) : null}
      </Section>

      <Section kicker="Less windshield time" title="Optimize">
        <p>
          {edition === "pool"
            ? "Dana can see Tony’s Wednesday zigzags: Gilbert, Mesa, back to Gilbert. One tap fixes it."
            : "Dana has Wednesday’s stops in the order the jobs came in. Optimize puts them in the order that drives least."}
        </p>
        <Sub>One day</Sub>
        <p>
          In <Ui>Day</Ui>, tap <Ui>Optimize</Ui>. The stops slide into the new order at once and a
          banner reports the result: “Optimized · 42 min less driving,” with <Ui>Undo</Ui>. If the
          order was already right, it says “Already the best order.”
        </p>
        <p>
          Optimize won’t touch what it shouldn’t. If nothing could move it says why: “No change: 3
          stops stayed: 1 started, 1 time promised to the customer, 1 shared with Jake Turner.”
        </p>
        <Sub>A whole week</Sub>
        <p>
          In <Ui>Week</Ui>, <Ui>Optimize Week</Ui> builds the routes for several days at once. It
          opens a sheet:
        </p>
        <Steps>
          <Step
            title={
              <>
                Under <Ui>Plan for</Ui>, choose <Ui>Everyone</Ui> or specific techs.
              </>
            }
          >
            At least one is required.
          </Step>
          <Step
            title={
              <>
                Leave <Ui>Place Jobs from Needs a Time</Ui> on to fill the week from the waiting
                list.
              </>
            }
          >
            It shows how many are waiting.
          </Step>
          <Step
            title={
              <>
                Tap <Ui>Optimize Week</Ui>.
              </>
            }
          >
            A banner reports: “Moved 9 jobs · 3 hr 10 min less driving.” Jobs that didn’t fit stay
            in Needs a Time.
          </Step>
        </Steps>
        <p>
          With two or more techs the open jobs are split evenly by minutes of work. <Ui>Undo</Ui>{" "}
          puts the week back: “The week is as it was.” It works on today and later days, up to 150
          jobs per run.
        </p>
        <Note title="What Optimize leaves alone">
          Locked times and days, jobs already started or finished, two-tech jobs, and a job that’s
          already been given to a tech.
          {edition === "pool"
            ? " Weekly plan visits stay on their day and with their tech, too. Optimize Week reorders around them; it doesn’t move a customer’s day."
            : ""}
        </Note>
        <Sub>Where each day starts</Sub>
        <p>
          Routes and drive times start and end at the shop, unless a tech starts from home. A tech
          sets that in <Path items={["More", "My Profile"]} /> with <Ui>Start My Day From</Ui>:{" "}
          <Ui>The Shop</Ui> or <Ui>Home</Ui>. An owner can set it for anyone in{" "}
          <Path items={["Settings", "Team"]} />. Maps show “Home,” never the street.
        </p>
      </Section>

      {edition === "pool" ? (
        <>
          <Section kicker="Sunday, 9:05 p.m." title="Putting the week together">
            <Scene time="9:05 p.m.">
              <p>
                Dana starts with Customers to Add: the Friday signup goes onto Thursday with Luis,
                where a street of three other customers already waits. She drags a repair job from
                Needs a Time onto Wednesday afternoon. Then one tap on <Ui>Optimize Week</Ui>:
                “Moved 9 jobs.” She scrolls the week once. Nobody has more than ten.
              </p>
              <p>She closes the laptop. Monday’s problem is no longer a problem.</p>
            </Scene>
            <Flow
              stages={[
                { title: "Look", text: "Week, Everyone: counts and driving." },
                { title: "Place", text: "Customers to Add, Needs a Time." },
                { title: "Optimize", text: "Optimize Week for the whole crew." },
                { title: "Adjust", text: "Drag, lock, undo what you don’t like." },
              ]}
            />
          </Section>
        </>
      ) : (
        <>
          <Section kicker="Tuesday, 4:52 p.m." title="Where Maria’s detection goes">
            <Steps>
              <Step
                title={
                  <>
                    Open <Ui>Needs a Time</Ui> and find Maria Alvarez.
                  </>
                }
              >
                It’s the card with the Mesa address.
              </Step>
              <Step
                title={
                  <>
                    Tap <Ui>…</Ui> then <Ui>Suggest Times</Ui>.
                  </>
                }
              >
                Wednesday 9:00 a.m. is listed as <Ui>First stop</Ui>. A 1:30 p.m. slot is listed as{" "}
                <Ui>Adds no driving</Ui>, because Dana’s spa line test is a few minutes down the
                road.
              </Step>
              <Step title="Pick the time.">
                Dana takes 9:00, so the long job gets the cool of the morning. It lands on Dana’s
                Wednesday route, with Jake on it as second tech and a drive chip on the tile, such
                as “22 min”.
              </Step>
              <Step title="Look at the day.">
                The Map section shows the route and the total, such as “3 stops · 1 hr 45 min
                driving”, and the last line says how long the trip back to the shop is.
              </Step>
            </Steps>
            <Tip title="Lock a promised time">
              If Maria wants an exact hour and Dana tells her yes, set <Ui>Lock Time</Ui> on the
              job. Optimize and Optimize Week will plan around it from then on.
            </Tip>
            <Gallery caption="Left: the month at a glance. Right: the settings that shape drive times.">
              <Phone
                src="33-schedule-month"
                alt="The Schedule tab in Month view: a November calendar with today outlined and its job count."
                caption="Month: today outlined, with its count."
              />
              <Phone
                src="68-settings-scheduling"
                alt="Scheduling and Routes settings: the working day, usual job length, arrival time customers are told, shop location and drive times."
                caption="Scheduling and Routes: the working day and how arrival times read."
              />
            </Gallery>
            <Note title="Drive times need a map location">
              Drive times come from each pool’s place on the map. If a job’s address hasn’t been
              found yet, the tile shows a warning triangle and Scheduling and Routes says how many
              pools have no map location. Fix the address and the time appears.
            </Note>
          </Section>
        </>
      )}

      <UseIt
        title="Put it to work"
        items={
          edition === "pool"
            ? [
                {
                  who: "A customer asks to switch days",
                  text: (
                    <>
                      Drag their stop to the new day and choose <Ui>Change Schedule</Ui>. Every
                      coming visit follows.
                    </>
                  ),
                },
                {
                  who: "A tech is out Wednesday",
                  text: "Open Week with Everyone, and drag that day’s stops onto the other techs’ rows. Then Optimize the day.",
                },
                {
                  who: "A busy June",
                  text: "Use Month to see which weeks are heavy before you promise a pool opening.",
                },
              ]
            : [
                {
                  who: "Two bookings, one neighborhood",
                  text: "Suggest Times puts a second detection right next to the first, so the day has one drive across town, not two.",
                },
                {
                  who: "A customer needs an exact hour",
                  text: "Lock Time on the job, then Optimize. Everything else arranges itself around it.",
                },
                {
                  who: "Rain on Thursday",
                  text: "Drag the day’s stops to Friday, or drop them back on Needs a Time and pick new times later.",
                },
              ]
        }
      />

      <FromTheField title="From the field">
        {edition === "pool"
          ? "Shops with weekly routes tend to build the week on Sunday and leave Monday for the exceptions. A weekly customer’s tile never moves unless you choose Change Schedule."
          : "Book the call while the customer is still on the phone if you can. A job that’s in Needs a Time is a job that nobody has been told about."}
      </FromTheField>

      <WhyItMatters>
        {edition === "pool"
          ? "The routes are decided once, in one place, and the techs open the same plan in the morning. Dana didn’t text anyone a schedule, and no customer lost their day by accident."
          : "From Maria’s call to a time on the route, nobody was phoned and nothing was written twice. The job on Maria’s schedule is the same job on Dana’s phone Wednesday morning."}
      </WhyItMatters>
      {edition === "leak" ? null : (
        <PullQuote>Build the week once. Let the trucks follow it.</PullQuote>
      )}
    </>
  ),
};
