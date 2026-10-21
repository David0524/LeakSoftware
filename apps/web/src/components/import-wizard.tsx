"use client";

import Link from "next/link";
import { useState, type ChangeEvent } from "react";
import {
  guessMapping,
  IMPORT_FIELDS,
  IMPORT_MAX_ROWS,
  parseCsv,
  type ImportField,
  type Services,
} from "@leakbook/core";
import { checkImport, runImport } from "@/app/actions/import";
import type { ImportSummary } from "@/server/import";
import { Banner } from "./doc-ui";
import { Button, Grouped, Notice, Row } from "./ui";
import { NO_CONNECTION, whenOffline } from "@/lib/offline";

// Import Customers (owner, 2026-10-16: "build the importer"): choose a CSV, match its
// columns, see what will be made, import. The file is read here; the server checks it again.

const TEMPLATE = [
  "Customer Name,Email,Phone,Service Address,City,State,Zip,Gallons,Pool Type,Gate Code,Service Day,Frequency,Price Per Visit,Tech,Notes",
  'Ana Rivera,ana@example.com,(480) 555-0101,1 Palm Ln,Mesa,AZ,85201,18000,Plaster,4512,Tuesday,Weekly,40,Jake,"Dog in yard, use side gate"',
].join("\n");

type Step = "file" | "map" | "check" | "done";

export function ImportWizard({
  companyId = null,
  services,
}: {
  /** Staff importing for a shop; null for an owner's own shop. */
  companyId?: string | null;
  services: Services;
}) {
  const [step, setStep] = useState<Step>("file");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<ImportField[]>([]);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [done, setDone] = useState<{
    customers: number;
    pools: number;
    plans: number;
    skipped: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fields = (Object.keys(IMPORT_FIELDS) as ImportField[]).filter(
    (f) =>
      services !== "leak" ||
      !["visit_day", "frequency", "price", "monthly_price", "tech"].includes(f),
  );

  async function choose(e: ChangeEvent<HTMLInputElement>) {
    setError(null);
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 5_000_000) return setError("That file is over 5 MB. Split it into two files.");
    if (/\.(xlsx?|numbers)$/i.test(file.name))
      return setError(
        "That’s a spreadsheet file. Save it as CSV first (File › Save As or Download › CSV), then choose it here.",
      );
    const all = parseCsv(await file.text());
    if (all.length < 2) return setError("That file has no customers in it.");
    const [head, ...body] = all;
    setHeaders(head!.map((h) => h.trim()));
    setRows(body);
    setMapping(guessMapping(head!));
    setStep("map");
  }

  const has = (f: ImportField) => mapping.includes(f);
  const named = has("name") || has("first_name") || has("last_name") || has("company_name");

  async function check() {
    setBusy(true);
    setError(null);
    const r = await whenOffline(checkImport(companyId, mapping, rows), { error: NO_CONNECTION });
    setBusy(false);
    if (r.error || !r.summary) return setError(r.error ?? "Couldn’t check the file.");
    setSummary(r.summary);
    setStep("check");
  }

  async function run() {
    setBusy(true);
    setError(null);
    const r = await whenOffline(runImport(companyId, mapping, rows), { error: NO_CONNECTION });
    setBusy(false);
    if (r.error || !r.done) return setError(r.error ?? "The import didn’t go through.");
    setDone(r.done);
    setStep("done");
  }

  const sample = (i: number) => rows.find((r) => (r[i] ?? "").trim())?.[i]?.trim() ?? "";

  return (
    <div className="max-w-2xl space-y-6" data-testid="import">
      {error ? <Banner tone="error">{error}</Banner> : null}

      {step === "file" ? (
        <>
          <section className="card space-y-3 p-5">
            <p>
              Export your customer list as a CSV file from the software or spreadsheet you use now
              (Skimmer, Pool Brain, Jobber, QuickBooks, Excel, Google Sheets). Each row becomes a
              customer
              {services === "leak" ? " and their pool" : ", their pool, and their visit plan"}.
            </p>
            <p className="text-[0.9375rem] text-text-muted">
              Customers already in Sundeck Pro (same email, phone, or name and address) are left
              out, so importing the same file twice doesn’t make doubles.
            </p>
            <label className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-full bg-primary px-5 text-[1.0625rem] font-semibold text-on-primary focus-within:outline-3 focus-within:outline-offset-2 focus-within:outline-focus">
              Choose CSV File
              <input
                type="file"
                accept=".csv,text/csv,.txt"
                onChange={choose}
                className="sr-only"
                aria-label="Choose CSV File"
              />
            </label>
          </section>
          <p className="text-[0.9375rem] text-text-muted">
            Starting from scratch?{" "}
            <a
              href={`data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE)}`}
              download="sundeck-customers.csv"
              className="text-link underline"
            >
              Download a template
            </a>
            , fill it in, and import it.
          </p>
        </>
      ) : null}

      {step === "map" ? (
        <>
          <p>
            {rows.length.toLocaleString()} {rows.length === 1 ? "row" : "rows"} found
            {rows.length > IMPORT_MAX_ROWS
              ? `; the first ${IMPORT_MAX_ROWS.toLocaleString()} are imported this time`
              : ""}
            . Check what each column holds.
          </p>
          <Grouped title="Match the columns">
            {headers.map((h, i) => (
              <li key={i} className="flex min-h-11 items-center gap-3 px-4 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{h || `Column ${i + 1}`}</span>
                  <span className="block truncate text-[0.9375rem] text-text-muted">
                    {sample(i) || "Empty"}
                  </span>
                </span>
                <select
                  aria-label={`Column: ${h || `Column ${i + 1}`}`}
                  value={mapping[i] ?? "skip"}
                  onChange={(e) =>
                    setMapping(
                      mapping.map((m, j) => (j === i ? (e.target.value as ImportField) : m)),
                    )
                  }
                  className="min-h-11 max-w-[12rem] rounded-[10px] border border-control-border bg-surface px-2"
                >
                  {fields.map((f) => (
                    <option key={f} value={f}>
                      {IMPORT_FIELDS[f]}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </Grouped>
          {named ? null : <Notice tone="warning">Pick the column with the customer’s name.</Notice>}
          <div className="flex flex-wrap gap-3">
            <Button onClick={check} disabled={busy || !named}>
              {busy ? "Checking…" : "Check File"}
            </Button>
            <Button kind="quiet" onClick={() => setStep("file")}>
              Choose a Different File
            </Button>
          </div>
        </>
      ) : null}

      {step === "check" && summary ? (
        <>
          <dl className="grid grid-cols-3 gap-3" data-testid="import-summary">
            {[
              ["Customers", summary.customers],
              ["Pools", summary.pools],
              ...(services === "leak" ? [] : [["Visit plans", summary.plans] as const]),
            ].map(([label, n]) => (
              <div key={label} className="card p-4">
                <dt className="text-[0.9375rem] text-text-muted">{label}</dt>
                <dd className="font-display text-3xl font-extrabold tabular-nums">
                  {Number(n).toLocaleString()}
                </dd>
              </div>
            ))}
          </dl>
          {summary.existing.length ? (
            <Notice>
              {summary.existing.length} already in Sundeck Pro (or twice in the file) will be left
              out:{" "}
              {summary.existing
                .slice(0, 5)
                .map((e) => e.name)
                .join(", ")}
              {summary.existing.length > 5 ? ", and more" : ""}.
            </Notice>
          ) : null}
          {summary.problems.length || summary.warnings.length ? (
            <Grouped
              title="Worth a look"
              footer="Rows are counted from the first one after the column names."
            >
              {[...summary.problems, ...summary.warnings].slice(0, 30).map((p, i) => (
                <Row key={i} label={p.message} value={`Row ${p.row}`} />
              ))}
            </Grouped>
          ) : null}
          <Grouped title="The first few">
            {summary.sample.map((s) => (
              <li key={s.row} className="px-4 py-2.5">
                <span className="block">{s.name}</span>
                {s.address || s.contact ? (
                  <span className="block text-[0.9375rem] text-text-muted">
                    {[s.address, s.contact].filter(Boolean).join(" · ")}
                  </span>
                ) : null}
                {s.plan ? <span className="block text-[0.9375rem]">{s.plan}</span> : null}
              </li>
            ))}
          </Grouped>
          <div className="flex flex-wrap gap-3">
            <Button onClick={run} disabled={busy || summary.customers === 0}>
              {busy
                ? "Importing…"
                : `Import ${summary.customers.toLocaleString()} ${summary.customers === 1 ? "Customer" : "Customers"}`}
            </Button>
            <Button kind="quiet" onClick={() => setStep("map")}>
              Back
            </Button>
          </div>
        </>
      ) : null}

      {step === "done" && done ? (
        <>
          <Banner tone="success">
            Imported {done.customers.toLocaleString()} customers and {done.pools.toLocaleString()}{" "}
            pools
            {services === "leak"
              ? ""
              : `, with ${done.plans.toLocaleString()} visit plans on the schedule`}
            .{done.skipped ? ` ${done.skipped} already in Sundeck Pro were left out.` : ""}
          </Banner>
          <div className="flex flex-wrap gap-3">
            {companyId ? null : (
              <Link href="/customers" className="min-h-11 content-center text-link underline">
                See Customers
              </Link>
            )}
            {companyId || services === "leak" ? null : (
              <Link href="/schedule" className="min-h-11 content-center text-link underline">
                See the Schedule
              </Link>
            )}
            <Button kind="quiet" onClick={() => setStep("file")}>
              Import Another File
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}
