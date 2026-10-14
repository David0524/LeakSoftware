import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { SUPPORT_EMAIL } from "@/lib/site";
import { checkHealth } from "@/server/health";

export const metadata: Metadata = { title: "System Status · Tidemark" };

/** Is Tidemark working right now? (M11). The field app keeps working offline either way. */
export default function StatusPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <h1 className="font-display text-3xl font-extrabold">System Status</h1>
      <Suspense fallback={<p className="mt-4 text-text-muted">Checking…</p>}>
        <Checks />
      </Suspense>
      <p className="mt-8 text-[15px] text-text-muted">
        The field app keeps working without a connection and syncs when Tidemark is back. Questions:{" "}
        <a className="text-link underline" href={`mailto:${SUPPORT_EMAIL}`}>
          {SUPPORT_EMAIL}
        </a>
      </p>
    </main>
  );
}

async function Checks() {
  await connection();
  const health = await checkHealth();
  return (
    <>
      <p className="mt-2 text-[17px] font-semibold" role="status">
        {health.ok
          ? "Everything is working."
          : "Some parts of Tidemark aren’t reachable right now."}
      </p>
      <ul className="mt-6 divide-y divide-border card">
        {health.checks.map((c) => (
          <li key={c.name} className="flex min-h-14 items-center justify-between gap-3 px-4">
            <span className="font-medium">{c.name}</span>
            <span className={c.ok ? "text-status-pass" : "font-semibold text-status-fail"}>
              {c.ok ? "✓ " : "✕ "}
              {c.detail}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[15px] text-text-muted">
        Checked{" "}
        {new Date(health.checkedAt).toLocaleString("en-US", {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone: "America/Phoenix",
        })}{" "}
        (Arizona time)
      </p>
    </>
  );
}
