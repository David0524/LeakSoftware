import type { ReactNode } from "react";

/**
 * Sign In, Sign Up, setup, and invite. Phones: an iOS form straight on the grouped gray page,
 * under the Tidemark mark (the brand moment), with the fields as one inset grouped block.
 * Wider screens: the same form on a centered card.
 */
export function AuthCard({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="flex flex-1 items-start justify-center px-4 pt-8 pb-12 sm:py-12">
      <div className="card w-full max-w-md p-6 max-sm:rounded-none max-sm:border-0 max-sm:bg-transparent max-sm:p-0 max-sm:shadow-none sm:p-8">
        {/* eslint-disable-next-line @next/next/no-img-element -- static SVG */}
        <img
          src="/tidemark-mark.svg"
          alt=""
          width={48}
          height={70}
          className="mx-auto mb-4 sm:hidden"
        />
        <h1 className="font-display text-[2.125rem] leading-tight font-extrabold max-sm:text-center sm:text-3xl">
          {title}
        </h1>
        {intro ? (
          <div className="mt-2 text-text-muted max-sm:px-2 max-sm:text-center">{intro}</div>
        ) : null}
        <div className="mt-6">{children}</div>
      </div>
    </main>
  );
}

export function FormSkeleton() {
  return (
    <div
      className="h-64 animate-pulse rounded-xl bg-bg motion-reduce:animate-none max-sm:bg-surface"
      aria-label="Loading"
    />
  );
}
