import type { Metadata } from "next";
import Link from "next/link";
import { FaqList } from "@/components/faq-list";
import { FAQ_TOPICS } from "@/lib/faq";
import { sharePreview } from "@/lib/share-preview";
import { CONTACT_EMAIL, CONTACT_PHONE, CONTACT_PHONE_URL } from "@/lib/site";

export const metadata: Metadata = {
  alternates: { canonical: "/faq" },
  title: "FAQ · Sundeck Pro",
  ...sharePreview(
    "FAQ · Sundeck Pro",
    "Answers to the questions pool service and leak detection shops ask about Sundeck Pro: the apps, offline work, customers, payments, the team and your data.",
  ),
};

/** Every question, for search engines (schema.org FAQPage). */
const STRUCTURED = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ_TOPICS.flatMap((t) =>
    t.items.map((i) => ({
      "@type": "Question",
      name: i.q,
      acceptedAnswer: { "@type": "Answer", text: i.a },
    })),
  ),
};

/** The full FAQ (owner, 2026-11-16); the manuals' FAQ chapter reads the same list. */
export default function FaqPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-14 sm:py-20">
      <p className="font-display text-[0.9375rem] font-bold tracking-widest text-link uppercase">
        Questions
      </p>
      <h1 className="mt-2 font-display text-4xl leading-[1.02] font-extrabold tracking-tight text-balance sm:text-[3.25rem]">
        Frequently asked questions
      </h1>
      <p className="mt-4 mb-8 text-[1.1875rem] text-text-muted">
        Short answers about the apps, working without signal, your customers, getting paid, your
        team, and your data. For the whole story, read the{" "}
        <Link href="/manual" className="text-link underline">
          manuals
        </Link>
        .
      </p>
      <FaqList topics={FAQ_TOPICS} />
      <p className="mt-14 text-center text-[1.0625rem]">
        Still have a question? Contact us at{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-link underline">
          {CONTACT_EMAIL}
        </a>{" "}
        or call{" "}
        <a href={CONTACT_PHONE_URL} className="font-semibold whitespace-nowrap text-link underline">
          {CONTACT_PHONE}
        </a>
        .
      </p>
      <script
        type="application/ld+json"
        // JSON-LD from our own constants.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED).replace(/</g, "\\u003c") }}
      />
    </main>
  );
}
