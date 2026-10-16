import type { ReactNode } from "react";

/** A plain legal page: title, a draft notice until the owner's final text is in, sections. */
export function LegalPage({
  title,
  updated,
  draft = true,
  children,
}: {
  title: string;
  updated: string;
  /** Legal pages say they're drafts until the owner's final text is in. */
  draft?: boolean;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <h1 className="font-display text-3xl font-extrabold">{title}</h1>
      <p className="mt-1 text-text-muted">Last updated {updated}</p>
      {draft ? (
        <p
          role="note"
          className="mt-4 rounded-2xl bg-status-warning/10 px-4 py-3 text-[0.9375rem]"
          data-testid="legal-draft"
        >
          Draft. This plain-language summary describes how Tidemark works today; the final legal
          text will replace it before launch.
        </p>
      ) : null}
      <div className="mt-6 space-y-6 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-bold [&_li]:ml-5 [&_li]:list-disc [&_p]:mt-2 [&_ul]:mt-2">
        {children}
      </div>
    </main>
  );
}
