import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { COMPANY, SUPPORT_EMAIL } from "@/lib/site";
import { sharePreview } from "@/lib/share-preview";

export const metadata: Metadata = {
  title: "Privacy Policy · Sundeck Pro",
  ...sharePreview(
    "Privacy Policy · Sundeck Pro",
    "What Sundeck Pro collects, why, and how shops and their customers stay in control.",
  ),
};

const Mail = () => (
  <a className="text-link underline" href={`mailto:${SUPPORT_EMAIL}`}>
    {SUPPORT_EMAIL}
  </a>
);

/**
 * Privacy policy: the App Store and Google Play listings and the apps' More screens link here.
 * Written from what the code does (2026-10-24); keep it in step with the services the server,
 * the website and the apps call, and with docs/release/APP_STORE.md's App Privacy answers.
 */
export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="October 24, 2026">
      <section>
        <h2>Who we are</h2>
        <p>
          Sundeck Pro is made by {COMPANY.legalName}, a {COMPANY.state} limited liability company
          (“Sundeck Pro”, “we”), at {COMPANY.mailingAddress}. Sundeck Pro is software for pool
          service and pool leak detection shops: a website for the office and an app for iPhone and
          Android. Shops use it to schedule and route their techs, run service visits and
          inspections, send reports, quotes, invoices, and receipts, and text and call their
          customers.
        </p>
        <p>
          This policy covers the people on a shop’s team (owners, admins, and techs), people who
          visit our website or start signing up, and the shop’s customers whose information the shop
          keeps in Sundeck Pro.
        </p>
      </section>
      <section>
        <h2>What we collect</h2>
        <ul>
          <li>
            <strong>Your account:</strong> your name, email, password (stored only in a form that
            can’t be read back), and, if you add them, your mobile number, where you start your day
            (the shop or a home address), and a two-step sign-in code app.
          </li>
          <li>
            <strong>Signing up:</strong> what you enter (name, company, email, phone, the services
            you offer, and how you heard about us), even if you don’t finish, so we can follow up.
            Ask us to delete it at any time.
          </li>
          <li>
            <strong>The shop’s records:</strong> what the shop’s team enters about its customers and
            its work: customers’ names, phone numbers, emails, and pool addresses; jobs, schedules,
            and routes; service checklists, water readings, and chemicals added; inspection
            checklists, tests, findings, and pool drawings; photos, videos, voice notes and their
            transcripts, markup, and signatures; reports, quotes, invoices, receipts, and the
            payments recorded against them.
          </li>
          <li>
            <strong>Texts and calls:</strong> when a shop uses a Sundeck Pro company number, the
            texts and pictures sent to and from its customers, call times and lengths, and
            voicemails with their transcripts.
          </li>
          <li>
            <strong>Location:</strong> only when you allow it on your phone, the place a photo,
            video, voice note, or signature is taken on a job, so the report shows the work was done
            at the pool. The app looks your location up at those moments only, never in the
            background, and never tracks where you drive.
          </li>
          <li>
            <strong>Usage and errors:</strong> which screens each person opens and for how long
            (only while the app or website is open in front of them), the device’s platform and app
            version, and errors they run into. Changes to records are logged with who made them and
            when. We use this to support shops and improve Sundeck Pro.
          </li>
          <li>
            <strong>Notifications:</strong> if you turn them on, your phone’s push notification
            token and which notifications you want.
          </li>
          <li>
            <strong>Billing:</strong> the shop’s Sundeck Pro subscription: its plan, team size,
            trial, and payment status. Stripe keeps the card, and Sundeck Pro never stores card
            details.
          </li>
          <li>
            <strong>Messages to us:</strong> feature requests and emails you send us.
          </li>
        </ul>
      </section>
      <section>
        <h2>How we use it</h2>
        <ul>
          <li>
            To run Sundeck Pro for the shop: sync its records to its team, send what it sends.
          </li>
          <li>To sign you in, keep accounts secure, and limit repeated attempts.</li>
          <li>To bill the shop for its subscription.</li>
          <li>To answer questions, help the shop’s team, and fix problems.</li>
          <li>
            To send service emails, such as confirming your email, resetting a password, and notices
            about the shop’s account or these policies.
          </li>
          <li>To understand how Sundeck Pro is used and make it better.</li>
          <li>To meet legal duties and protect Sundeck Pro, shops, and their customers.</li>
        </ul>
        <p>
          We don’t sell or share personal information, we don’t use it for advertising, and we don’t
          track people across other companies’ apps or websites. The apps have no advertising or
          tracking code. The website uses only the cookies it needs to keep you signed in and
          remember your settings.
        </p>
      </section>
      <section>
        <h2>The shop’s records belong to the shop</h2>
        <p>
          Each shop owns the records it keeps in Sundeck Pro, and other shops can’t see them. For
          those records we act as the shop’s service provider: we store and process them for the
          shop, only to run the service. If you’re a customer of a shop, the shop decides what it
          keeps about you and is the one to ask first. Our staff look at a shop’s records only to
          help the shop, to keep the service safe and working, or when the law requires it.
        </p>
      </section>
      <section>
        <h2>Services we use</h2>
        <p>
          These companies process data for us, each only for its part, and may use it only to
          provide that service to us. Sundeck Pro’s database and files are kept in the United
          States.
        </p>
        <ul>
          <li>Supabase: the database, sign-in, and file storage.</li>
          <li>Vercel: hosting the website and its servers.</li>
          <li>
            Stripe: the shop’s Sundeck Pro subscription, and, through Stripe Connect, card and bank
            payments from the shop’s customers to the shop’s own Stripe account. Card and bank
            numbers go to Stripe and never reach Sundeck Pro.
          </li>
          <li>
            Resend: sending emails (reports, quotes, invoices, receipts, reminders, the shop’s
            emails to its customers, and account emails).
          </li>
          <li>
            Twilio: company phone numbers, texts and pictures, calls, voicemail, and voicemail
            transcripts.
          </li>
          <li>Deepgram: turning voice notes into text.</li>
          <li>
            Apple: maps, map images, address suggestions, and road directions (Apple Maps), and
            notifications to iPhones (Apple Push Notification service).
          </li>
          <li>
            Mapbox: drive times between stops, address suggestions, and maps when Apple Maps isn’t
            available.
          </li>
          <li>Expo and Google (Firebase Cloud Messaging): notifications to Android phones.</li>
          <li>Sentry: error reports, without customer details.</li>
          <li>Google Workspace: our own email, including {SUPPORT_EMAIL}.</li>
        </ul>
        <p>
          To place pools on the map and show the weather, we also send addresses or the shop’s ZIP
          code, never names, to free public services: the U.S. Census Bureau’s and OpenStreetMap’s
          address lookups, the National Weather Service, and Zippopotam.us.
        </p>
        <p>
          When you choose to, the app opens a customer’s address in Apple Maps or Google Maps, or a
          message in your phone’s own Messages or Mail app; those apps’ own privacy policies apply
          there.
        </p>
      </section>
      <section>
        <h2>How we protect it</h2>
        <p>
          Each shop’s records are walled off in the database itself, everything travels over
          encrypted connections, phones keep their copy encrypted, customer links can’t be guessed
          and expire, and anyone can add two-step sign-in. The details are on our{" "}
          <a className="text-link underline" href="/security">
            Security
          </a>{" "}
          page. No system is perfectly secure; if a breach affects your information, we’ll tell you
          as the law requires.
        </p>
      </section>
      <section>
        <h2>How long we keep it</h2>
        <ul>
          <li>The shop’s records: while the shop uses Sundeck Pro, and as described below.</li>
          <li>
            Sent reports and original photos aren’t changed after the fact, so the record stays
            trustworthy.
          </li>
          <li>
            Links sent to customers stop working after 180 days, or sooner if the shop turns one
            off.
          </li>
          <li>Usage and screen-time records: 180 days.</li>
          <li>Sign-in attempts and password reset requests: one day.</li>
          <li>
            When a shop cancels, its owner keeps read-only access to its records. The owner can ask
            us to delete the shop’s data, and we do so within 30 days; backups are overwritten
            within a further 30 days.
          </li>
          <li>We keep what the law requires us to keep, such as billing records.</li>
        </ul>
      </section>
      <section>
        <h2>Deleting your account</h2>
        <p>
          Anyone can delete their own account in the app or on the website: More › Delete My
          Account. A tech’s, admin’s, or second owner’s account is deleted at once; the jobs and
          reports they worked on stay with the shop. If you’re the shop’s only owner, deleting your
          account also asks us to delete the shop’s data, which we do within 30 days and confirm by
          email. You can also write to <Mail />.
        </p>
      </section>
      <section>
        <h2>Your choices and rights</h2>
        <ul>
          <li>
            You can see and correct your own account details in the app and on the website, and
            delete your account as described above.
          </li>
          <li>
            Location, camera, microphone, and notifications are each your choice in your phone’s
            settings; Sundeck Pro keeps working without them.
          </li>
          <li>
            Customers can stop a shop’s emails with the unsubscribe link in any of them, and stop
            its texts by replying STOP.
          </li>
          <li>
            Depending on where you live, you may have the right to know, get a copy of, correct, or
            delete the personal information we hold about you. Write to <Mail />; we’ll answer
            within 30 days and won’t treat you differently for asking. If you’re a shop’s customer,
            we’ll pass your request to the shop, since the records are the shop’s.
          </li>
        </ul>
      </section>
      <section>
        <h2>Children</h2>
        <p>
          Sundeck Pro is for businesses and isn’t meant for anyone under 16. We don’t knowingly
          collect personal information from children; if you believe we have, write to <Mail /> and
          we’ll delete it.
        </p>
      </section>
      <section>
        <h2>Changes</h2>
        <p>
          If we change this policy, we update the date above, and we email shop owners before a
          change that affects how their records are used.
        </p>
      </section>
      <section>
        <h2>Contact</h2>
        <p>
          Questions about privacy: <Mail />, or by mail to {COMPANY.legalName},{" "}
          {COMPANY.mailingAddress}.
        </p>
      </section>
    </LegalPage>
  );
}
