import type { ChapterDef } from "../types";
import {
  Browser,
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
  Gallery,
  BigFigure,
} from "../kit";

// WANT: messages — /messages (desktop, latest conversation open beside the list)
// WANT: search-open — any page with Ctrl+K search open and results showing

export const office: ChapterDef = {
  id: "office",
  title: "Meanwhile, at the office",
  moment: { pool: "Monday · 10:20 a.m.", leak: "Wednesday · 11:10 a.m." },
  lede: {
    pool: "While the trucks are out, the office is working too: texts from customers, a call that went to voicemail, a quote someone just accepted. Here’s the other half of the day.",
    leak: "While Jake is on a deck in Gilbert, the office is working too: a homeowner’s text, a voicemail, a quote that just got accepted. Here’s the other half of the day.",
  },
  learn: [
    "Text and call customers from the shop’s number",
    "Know when something happens without checking",
    "Find any customer, pool or job in seconds",
    "Add a job from any screen",
    "Email many customers at once, within the rules",
  ],
  Body: ({ edition }) => (
    <>
      {edition === "pool" ? (
        <Scene time="Monday, 10:20 a.m.">
          <p>
            Priya is three pools into her Monday. Luis is in Chandler. Tony’s phone says he’s two
            stops from lunch.
          </p>
          <p>
            Dana is at her desk with the website open. A customer texted at 10:05 to say the gate
            code changed. Another left a voicemail. A third wants to know if Thursday still works.
            None of them called Dana’s cell phone. They all reached the shop.
          </p>
        </Scene>
      ) : (
        <Scene time="Wednesday, 11:10 a.m.">
          <p>
            Jake is on a deck in Gilbert with a pressure gauge and a hose. Dana is at the shop with
            the website open and a short list.
          </p>
          <p>
            Maria Alvarez texted at 10:50 to ask whether she should keep the pool pump running. A
            second homeowner left a voicemail. A quote Dana sent on Monday has just been accepted.
            Nobody phoned Dana’s cell. Everybody reached the shop.
          </p>
        </Scene>
      )}

      <Section kicker="One number" title="Messages">
        <Meta who={["Owner", "Admin", "Tech"]} where={["Website", "iPhone", "Android"]} />
        <p>
          The <Ui>Messages</Ui> tab is a shared inbox of texts and calls on the shop’s{" "}
          <strong>company number</strong>. The line under the title says what it is: “Your company
          number: (480) 555-0100”. Customers text that number, not anyone’s personal phone. Dana,
          Jake and the techs see the same thread, so a customer never has to say it twice.
        </p>
        <Spread
          figure={
            <Phone
              src="40-messages"
              alt="The Messages tab: the company number at the top, a conversation row with the latest text, and a voicemail row from an unknown number."
              caption="The inbox: a conversation and a voicemail, with the company number on top."
            />
          }
        >
          <p>
            Each row shows the last message and whether it’s unread. On a phone, swipe left on a row
            for <Ui>Read</Ui> or <Ui>Unread</Ui>, and right to <Ui>Call</Ui>. Touch and hold for{" "}
            <Ui>Open</Ui>, <Ui>Call</Ui>, <Ui>Mark Read</Ui> and <Ui>Open Customer</Ui>. On a
            computer the latest conversation opens beside the list.
          </p>
          <p>
            Unread conversations add a count to the tab. The website refreshes on its own every few
            seconds.
          </p>
          <Note title="If the tab says “Set Up a Number”">
            An owner turns the number on in <Path items={["Settings", "Phone and Texting"]} />. A
            new number can take a few days to be ready for texting; the inbox says so while it
            waits.
          </Note>
        </Spread>
        <Browser
          src="messages"
          url="sundeckpro.com/messages"
          alt="The website’s Messages page: the inbox on the left and the latest conversation open on the right, with a panel showing the customer’s pools and latest jobs."
          caption="On a computer, the conversation sits beside the list. A side panel shows the customer’s pools and latest jobs."
        />

        <Sub>A conversation</Sub>
        <Spread
          flip
          figure={
            <Phone
              src="41-conversation"
              alt="A conversation with a customer: blue bubbles from the shop, a Play Voicemail row, a red Not sent status on one message, and a text box with a camera button."
              caption="Blue is the shop, gray is the customer. A red status means it didn’t go."
            />
          }
        >
          <p>
            Tap a row and you’re in the thread. At the top: the customer’s name,{" "}
            <Ui>Customer Details</Ui>, <Ui>Mark as Unread</Ui> and a round phone button. Your
            messages are labeled with your name and a status: Sending, Sent, Delivered, or red Not
            delivered.
          </p>
          <Steps>
            <Step title="Type in the “Text message” box.">
              Return sends on a computer; Shift and Return starts a new line. Your draft is kept for
              each conversation.
            </Step>
            <Step
              title={
                <>
                  Tap the camera to <Ui>Add Photos</Ui>.
                </>
              }
            >
              Photos are shrunk before they go. The camera only appears if your shop allows
              pictures.
            </Step>
            <Step
              title={
                <>
                  Tap <Ui>Send</Ui>.
                </>
              }
            >
              It goes out from the shop’s number.
            </Step>
          </Steps>
        </Spread>
        <p>
          Calls live in the same thread: “Incoming call”, “Missed call”, “Dana called · 2 min”.
          Voicemails show as <Ui>Voicemail · 42 sec</Ui> with <Ui>Play Voicemail</Ui> and a written
          transcript, so you can read it before you listen.
        </p>
        <Sub>Calling</Sub>
        <p>
          Tap the phone button and <em>your</em> phone rings first. Answer, and it connects you to
          the customer, who sees the shop’s number. Incoming calls to the company number ring the
          phones chosen in Phone and Texting (the owners, if nobody is chosen) for 20 seconds, then
          go to voicemail with the shop’s greeting.
        </p>
        <Sub>Texting someone new</Sub>
        <Gallery caption="New Message: pick a customer or type a mobile number, then write.">
          <Phone
            src="42-new-message"
            alt="New Message: a To field for a mobile number, a text box with a camera button and a disabled Send, and a list of customers underneath."
            caption="Start from the customer list, or type a number."
          />
        </Gallery>
        <p>
          Use <Ui>New Message</Ui> (the plus on a phone), or the <Ui>Text</Ui> button on a
          customer’s page, which opens their thread already addressed.
        </p>
        <Watch title="Texts can’t go to someone who said STOP">
          If a customer replies STOP, Sundeck Pro stops texting them and the thread says so: “This
          customer replied STOP. They can text START to get texts again.” Reports, quotes and
          invoices still reach them by email.
        </Watch>
        <Tip title="Texts need a signal">
          Texting needs a connection. Offline, the apps say they can’t send, and nothing is queued,
          so you’ll never wonder whether it went.
        </Tip>
      </Section>

      <Section kicker="So you don’t have to look" title="Notifications">
        <p>
          Most of the day, you shouldn’t have to open anything to know what happened. Sundeck Pro
          tells your phone. In <Path items={["More", "Notifications"]} /> every switch is on to
          start with, and you turn off what you don’t want:
        </p>
        <Table
          head={["Switch", "What it tells you"]}
          rows={[
            [<Ui key="a">Customer texts</Ui>, "Who texted, and what they said."],
            [
              <Ui key="b">New and moved jobs</Ui>,
              "“New stop Tue 9:30 AM”, or “Stop moved to…” with the customer and address.",
            ],
            [<Ui key="c">Accepted quotes</Ui>, "“Smith accepted the $1,250.00 quote.”"],
            [<Ui key="d">Payments</Ui>, "“Smith paid $657.30”, for owners and admins, shop-wide."],
            [<Ui key="e">Signed reports</Ui>, "A customer signed the report."],
            [
              <Ui key="f">Opened reports</Ui>,
              "A customer opened a report link for the first time.",
            ],
            [
              <Ui key="g">Live Activity</Ui>,
              "Your current stop on the Lock Screen during the workday.",
            ],
            [<Ui key="h">Start of the day</Ui>, "Your first stop, when your workday starts."],
          ]}
        />
        <p>
          Techs get what’s about their own jobs. Owners and admins get the shop. Owners also have a{" "}
          <Ui>Weekly summary</Ui> under <Ui>Email</Ui>: on Monday morning, last week’s jobs and
          money and the quotes still waiting.
        </p>
        <Note title="If nothing arrives">
          The phone itself has to allow notifications for Sundeck Pro. If it doesn’t, the page shows
          a notice with an <Ui>Open Settings</Ui> row that takes you there.
        </Note>
      </Section>

      <Section kicker="Looking at what happened" title="Activity">
        <p>
          <Ui>Activity</Ui> is the shop’s running log: newest first, grouped by Today and Yesterday.
          It lives under <Ui>More</Ui> and shows a blue dot when something new has landed.
        </p>
        <Spread
          figure={
            <Phone
              src="70-dashboard-activity"
              alt="The Activity sheet: Payment received, Job completed and Quote accepted rows with names, amounts and times, and a See All link."
              caption="The Dashboard’s Activity sheet: the latest three, then See All."
            />
          }
        >
          <p>
            Each row has a symbol, a title, a line of detail and a time: Quote accepted, Payment
            received, Report signed, Report sent, Report opened, Job completed (“by Tony”), a job
            assigned or moved, a text from a customer, a receipt sent. Tap a row and you’re on the
            job or in the conversation.
          </p>
          <p>
            Owners also have an <Ui>Activity</Ui> button beside the Dashboard’s title that opens the
            latest three, with <Ui>See All</Ui>. Everyone sees only the events about jobs they can
            see.
          </p>
        </Spread>
      </Section>

      <Section kicker="Finding anything" title="Search, and New Job from anywhere">
        <p>
          A customer calls. Dana doesn’t scroll a list. On a computer she presses <Ui>Ctrl+K</Ui> (
          <Ui>⌘K</Ui> on a Mac) on any office page, or clicks the Search field in the header, and
          types the last four digits of the number.
        </p>
        <Browser
          src="search-open"
          url="sundeckpro.com/dashboard"
          alt="The website with the search box open: results grouped under Customers, Pools, Jobs, Quotes and Invoices, with See All links."
          caption="One search over customers, pools, jobs, quotes and invoices. Up to five of each, then See All."
        />
        <Table
          head={["Search for", "Finds"]}
          rows={[
            ["A name, phone or email", "Customers. A phone needs at least four digits."],
            ["A street or city", "Pools."],
            ["1038, #1038 or Job 1038", "That job. Or type the customer’s name."],
            ["A number or a name", "Quotes and invoices."],
          ]}
        />
        <p>
          Results update as you type, with two characters or more. Words can come in any order and
          match the start of a word, so “och” finds Ochoa. Before you type, <Ui>Recent</Ui> lists
          the last eight records you opened on this device, with <Ui>Clear</Ui>. The arrow keys move
          through results, Return opens one and Escape closes it.
        </p>
        <Note title="On a phone">
          The search field sits under the large title at the top of <Ui>Jobs</Ui>: “Search
          customers, jobs, addresses”. In the apps, search runs on the phone’s own data, so it works
          with no signal. The website needs a connection.
        </Note>
        <Sub>New Job, wherever you are</Sub>
        <p>
          The blue <Ui>New Job</Ui> button sits in the header on every office page (a round plus on
          a phone and in narrow windows). A call comes in while Dana is in Invoices, and she doesn’t
          go looking. Owners and admins can always add a job; a tech can only if the owner allows
          it.{" "}
          {edition === "pool"
            ? "What goes in the form is covered in the chapter on bringing the route over."
            : "What goes in the form is covered in “We’re losing an inch a day”."}
        </p>
      </Section>

      <Section kicker="Everyone, once" title="Email Customers">
        <Meta who={["Owner", "Admin"]} where={["Website", "iPhone", "Android"]} />
        <p>
          {edition === "pool"
            ? "In September, Dana wants to tell every customer in Mesa that fall openings are booking. She could text two hundred people. Or she could do this."
            : "In October, Dana wants to tell last year’s customers that she now has openings for pre-winter pressure checks. She could call forty of them. Or she could do this."}
        </p>
        <Spread
          flip
          figure={
            <Phone
              src="80-email-customers"
              alt="Email Customers: filters for Show, City and Last Job, a line reading 42 customers with an email, a Subject field, a message box, a Send to 42 Customers button, Send Test to Me, and a Sent history."
              caption="Pick who, write it, send yourself a test, then send."
            />
          }
        >
          <p>
            <Ui>Email Customers</Ui> is a button on the <Ui>Customers</Ui> page: a pill beside the
            title on a computer, an envelope in the bar on the apps. Owners and admins only.
          </p>
          <Steps>
            <Step
              title={
                <>
                  Choose <Ui>Show</Ui>, <Ui>City</Ui> and <Ui>Last Job</Ui>.
                </>
              }
            >
              A live line counts who’s included: “42 customers with an email. 5 left out: 3 without
              an email, 2 unsubscribed.”
            </Step>
            <Step
              title={
                <>
                  Write the <Ui>Subject</Ui> and the <Ui>Message</Ui>.
                </>
              }
            >
              Type {"{first name}"} anywhere to use each customer’s first name.
            </Step>
            <Step
              title={
                <>
                  Tap <Ui>Send Test to Me</Ui>.
                </>
              }
            >
              It comes to your own address, with “Test:” in front of the subject.
            </Step>
            <Step
              title={
                <>
                  Tap <Ui>Send to 42 Customers</Ui>, then <Ui>Send</Ui>.
                </>
              }
            >
              It asks first: “It can’t be unsent.”
            </Step>
          </Steps>
        </Spread>
        <Sub>The rules built in</Sub>
        <Table
          head={["Rule", "What it means for you"]}
          rows={[
            [
              "Mailing address",
              "Add your shop’s address in Settings › Company first. The law asks for it in every email like this.",
            ],
            [
              "Unsubscribe",
              "Every email ends with your shop’s name, address and a one-tap unsubscribe link. Anyone who unsubscribes is skipped from then on.",
            ],
            [
              "Daily limit",
              "A shop can email 2,000 customers a day this way. If the list is longer, it says how many you can still send today and offers to resume tomorrow.",
            ],
            [
              "Still gets the important mail",
              "Reports, quotes, invoices and receipts still go to a customer who unsubscribed.",
            ],
          ]}
        />
        <p>
          Emails come from “{"<"}Your shop{">"} via Sundeck Pro”, and replies go to your shop’s
          email. Each send is listed under <Ui>Sent</Ui> with its date and a count: “Oct 20 · Sent
          to 40 · 2 didn’t go.”
        </p>
        <Watch title="Check the count before you send">
          The line above the button is the audience. A wrong filter is the one mistake that can’t be
          unsent, so read it every time.
        </Watch>
      </Section>

      <UseIt
        items={
          edition === "pool"
            ? [
                {
                  who: "The gate code changed",
                  text: "The text lands in the shared inbox, so whoever is at a desk can answer it and add the code to the pool’s access notes before Priya arrives.",
                },
                {
                  who: "Opening season",
                  text: "Email Customers with Show set to On a Plan and City set to Mesa.",
                },
                {
                  who: "A missed call at 5:55",
                  text: "The voicemail and its transcript are in the thread. Nobody has to hunt for a sticky note.",
                },
              ]
            : [
                {
                  who: "A homeowner asks a quick question",
                  text: "Dana answers from the thread, and a photo goes both ways. Jake never leaves the deck.",
                },
                {
                  who: "The accepted quote",
                  text: "A push says the quote was accepted. One tap opens the job, and the repair can be booked the same afternoon.",
                },
                {
                  who: "Off-season",
                  text: "Email Customers with Last Job set to Last Year: a short note about winter checks.",
                },
              ]
        }
      />

      <FromTheField title="From the field">
        Keep the company number in your email signature and on the truck. Customers text it instead
        of a tech’s cell, and the next person who picks up the thread knows the whole story.
      </FromTheField>

      <BigFigure
        value="1 number"
        label="Every tech and the office see the same thread. The customer sees the shop’s number, never a personal phone."
      />

      <WhyItMatters>
        When a customer’s message lands on one shared thread, nobody is the only one who knows. A
        tech who’s out sick doesn’t take the conversation with him. And Dana learns a quote was
        accepted when it happens, not Friday afternoon.
      </WhyItMatters>
    </>
  ),
};
