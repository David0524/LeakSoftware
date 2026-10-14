import type { ReactNode } from "react";

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
    <main className="flex flex-1 items-start justify-center px-4 py-12">
      <div className="w-full max-w-md card p-6 sm:p-8">
        <h1 className="font-display text-3xl font-extrabold">{title}</h1>
        {intro ? <div className="mt-2 text-text-muted">{intro}</div> : null}
        <div className="mt-6">{children}</div>
      </div>
    </main>
  );
}

export function FormSkeleton() {
  return (
    <div
      className="h-64 animate-pulse motion-reduce:animate-none rounded-md bg-bg"
      aria-label="Loading"
    />
  );
}
