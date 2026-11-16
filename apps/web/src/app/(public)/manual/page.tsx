import type { Metadata } from "next";
import Link from "next/link";
import { EDITIONS } from "@/components/manual/editions";
import { sharePreview } from "@/lib/share-preview";
import { buttonClass } from "@/components/ui";

export const metadata: Metadata = {
  alternates: { canonical: "/manual" },
  title: "Manuals · Sundeck Pro",
  ...sharePreview(
    "Manuals · Sundeck Pro",
    "The Sundeck Pro manuals for pool service shops and leak detection shops, on the web and as PDFs.",
  ),
};

/** Picks a manual: one for pool service shops, one for leak detection shops (owner, 2026-11-16). */
export default function ManualsPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-14 sm:py-20">
      <p className="font-display text-[0.9375rem] font-bold tracking-widest text-link uppercase">
        Manuals
      </p>
      <h1 className="mt-2 font-display text-4xl leading-[1.02] font-extrabold tracking-tight text-balance sm:text-[3.25rem]">
        Two shops. Two stories.
      </h1>
      <p className="mt-4 max-w-2xl text-[1.1875rem] text-text-muted">
        Each manual follows one shop through its real work, in the order it happens, with the
        screens you’ll see on the website and the phone. Read it here, or download the PDF.
      </p>
      <div className="mt-10 grid gap-5 md:grid-cols-2">
        {(["pool", "leak"] as const).map((e) => {
          const info = EDITIONS[e];
          return (
            <article key={e} className="card flex flex-col p-6 sm:p-8">
              <p className="text-[0.8125rem] font-bold tracking-wider text-text-muted uppercase">
                {info.name} shops
              </p>
              <h2 className="mt-1 font-display text-3xl font-extrabold">{info.story}</h2>
              <p className="mt-3 flex-1 text-text-muted">{info.promise}</p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link href={`/manual/${info.slug}`} className={buttonClass("primary")}>
                  Read the {info.name} Manual
                </Link>
                <a href={info.pdf} download className={buttonClass("secondary")}>
                  Download PDF
                </a>
              </div>
            </article>
          );
        })}
      </div>
      <p className="mt-10 text-text-muted">
        Looking for a quick answer?{" "}
        <Link href="/faq" className="text-link">
          Read the FAQ
        </Link>
        .
      </p>
    </main>
  );
}
