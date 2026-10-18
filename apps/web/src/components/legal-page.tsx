import type { ReactNode } from "react";

/** A plain legal page: title, when it last changed, and its sections. */
export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <h1 className="font-display text-3xl font-extrabold">{title}</h1>
      <p className="mt-1 text-text-muted">Last updated {updated}</p>
      <div className="mt-6 space-y-6 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-bold [&_li]:ml-5 [&_li]:list-disc [&_p]:mt-2 [&_ul]:mt-2">
        {children}
      </div>
    </main>
  );
}
