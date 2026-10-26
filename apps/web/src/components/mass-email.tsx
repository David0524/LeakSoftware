"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  ANY_CITY,
  LAST_JOB_CHOICES,
  MASS_EMAIL_HISTORY_EMPTY,
  MASS_EMAIL_LIMITS,
  MASS_EMAIL_MESSAGE_NOTE,
  MASS_EMAIL_NO_ADDRESS,
  massEmailConfirm,
  massEmailCountText,
  massEmailErrors,
  massEmailHistoryText,
  massEmailLimitText,
  massEmailSendLabel,
  type MassEmailCount,
} from "@leakbook/core";
import {
  countMassEmail,
  sendMassEmailAction,
  testMassEmail,
  type MassEmailState,
} from "@/app/actions/mass-email";
import type { MassEmailSetup } from "@/server/mass-email";
import { NO_CONNECTION, whenOffline } from "@/lib/offline";
import { useConfirm } from "./sheet";
import {
  Button,
  FieldGroup,
  Grouped,
  GroupedField,
  GroupedSelect,
  GroupedTextArea,
  Notice,
  Row,
  SectionTitle,
} from "./ui";

const FOOTER = "mt-2 px-4 text-[0.8125rem] text-text-muted sm:px-0";

/**
 * Email Customers (owner, 2026-10-22): To (Show, City, Last Job) with the live count, the
 * subject and message, Send to N Customers (after an alert) and Send Test to Me, then the
 * mass emails sent before. Design: docs/design/2026-10-22-mass-email.md.
 */
export function MassEmailForm({
  setup,
  initialCount,
  me,
  timeZone,
}: {
  setup: MassEmailSetup;
  /** All Customers' count, from the server with the page (no "Counting…" on first load). */
  initialCount: MassEmailCount | null;
  me: string;
  timeZone: string;
}) {
  const [show, setShow] = useState("all");
  const [city, setCity] = useState("");
  const [days, setDays] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [count, setCount] = useState<MassEmailCount | null>(initialCount);
  const [counting, setCounting] = useState(false);
  const [result, setResult] = useState<MassEmailState>({});
  const [history, setHistory] = useState(setup.history);
  const [left, setLeft] = useState(setup.left);
  const [pending, startTransition] = useTransition();
  const [confirm, confirmSheet] = useConfirm();
  const asked = useRef(0);
  const audienceKey = `${show}|${city}|${days}`;
  const countedFor = useRef(initialCount ? "all||" : "");

  // The live count: asked again whenever the filter changes; only the newest answer shows.
  useEffect(() => {
    if (countedFor.current === audienceKey) return;
    countedFor.current = audienceKey;
    const ask = ++asked.current;
    setCounting(true);
    const audience = { show, city: city || null, days: days ? Number(days) : null };
    void whenOffline(countMassEmail(audience), null).then((c) => {
      if (ask !== asked.current) return;
      setCount(c);
      setCounting(false);
    });
  }, [show, city, days, audienceKey]);

  const blocked = !setup.shop.address || !setup.configured;
  const recipients = count?.recipients ?? 0;
  const overLimit = recipients > left;
  const words = count ? massEmailCountText(count) : null;

  function checkFields(): boolean {
    const errors = massEmailErrors(subject, body);
    if (Object.keys(errors).length) {
      setResult({ fields: errors as Record<string, string> });
      return false;
    }
    return true;
  }

  function sendTest() {
    if (!checkFields()) return;
    setResult({});
    startTransition(async () => {
      setResult(await whenOffline(testMassEmail({ subject, body }), { error: NO_CONNECTION }));
    });
  }

  async function send() {
    if (!checkFields() || !count) return;
    const ask = massEmailConfirm(recipients, subject, setup.shop.name);
    if (!(await confirm({ ...ask, alert: true }))) return;
    setResult({});
    startTransition(async () => {
      const r = await whenOffline(
        sendMassEmailAction({
          subject,
          body,
          audience: { show, city: city || null, days: days ? Number(days) : null },
          expected: recipients,
        }),
        { error: NO_CONNECTION },
      );
      setResult(r);
      if (r.sent) {
        setSubject("");
        setBody("");
        setLeft((n) => Math.max(0, n - recipients));
        if (r.history) setHistory(r.history);
      }
    });
  }

  const thisYear = new Date().getFullYear();
  const day = (iso: string) =>
    new Date(iso).toLocaleDateString("en-US", {
      timeZone,
      month: "short",
      day: "numeric",
      ...(new Date(iso).getFullYear() !== thisYear ? { year: "numeric" } : {}),
    });

  return (
    <div className="max-w-2xl space-y-8">
      {!setup.shop.address ? (
        <Notice tone="warning">
          {MASS_EMAIL_NO_ADDRESS}{" "}
          <Link href="/settings/company" className="text-link underline-offset-4 hover:underline">
            Open Company Settings
          </Link>
        </Notice>
      ) : null}
      {!setup.configured ? (
        <Notice tone="warning">Email isn’t set up yet. Try again later.</Notice>
      ) : null}

      <section aria-labelledby="mass-email-to">
        <SectionTitle>
          <span id="mass-email-to">To</span>
        </SectionTitle>
        <FieldGroup labelWidth="6.5rem" className="sm:grid sm:grid-cols-3 sm:gap-4">
          <GroupedSelect
            label="Show"
            name="show"
            value={show}
            onChange={(e) => setShow(e.target.value)}
            options={setup.shows}
          />
          <GroupedSelect
            label="City"
            name="city"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            options={[
              { value: "", label: ANY_CITY },
              ...setup.cities.map((c) => ({ value: c, label: c })),
            ]}
          />
          <GroupedSelect
            label="Last Job"
            name="days"
            value={days}
            onChange={(e) => setDays(e.target.value)}
            options={LAST_JOB_CHOICES.map((c) => ({
              value: c.days ? String(c.days) : "",
              label: c.label,
            }))}
          />
        </FieldGroup>
        <p className={FOOTER} aria-live="polite" data-testid="mass-email-count">
          {words ? (
            <>
              <span className="font-semibold text-text">{words.count}</span>
              {words.skipped ? ` ${words.skipped}` : null}
            </>
          ) : counting ? (
            "Counting…"
          ) : (
            "Couldn’t count. Check your connection."
          )}
          {count && overLimit ? (
            <span className="mt-1 block text-status-fail">{massEmailLimitText(left)}</span>
          ) : null}
        </p>
      </section>

      {/* A form, so leaving with a message typed asks "Discard changes?" (DiscardGuard), and a
          message that was sent (fields cleared) asks nothing. Enter sends nothing. */}
      <form onSubmit={(e) => e.preventDefault()} noValidate>
        <section aria-labelledby="mass-email-message">
          <SectionTitle>
            <span id="mass-email-message">Message</span>
          </SectionTitle>
          <FieldGroup labelWidth="6.5rem">
            <GroupedField
              label="Subject"
              name="subject"
              value={subject}
              maxLength={MASS_EMAIL_LIMITS.subject}
              onChange={(e) => setSubject(e.target.value)}
              error={result.fields?.subject}
              autoComplete="off"
            />
            <GroupedTextArea
              label="Message"
              name="body"
              value={body}
              rows={8}
              maxLength={MASS_EMAIL_LIMITS.body}
              onChange={(e) => setBody(e.target.value)}
              error={result.fields?.body}
              placeholder="Hi {first name},"
            />
          </FieldGroup>
          <p className={FOOTER}>{MASS_EMAIL_MESSAGE_NOTE}</p>
        </section>
      </form>

      <div className="space-y-3">
        {result.error ? <Notice tone="error">{result.error}</Notice> : null}
        {result.message ? <Notice tone="success">{result.message}</Notice> : null}
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button
            type="button"
            onClick={() => void send()}
            disabled={pending || counting || blocked || !count || recipients === 0 || overLimit}
            className="max-sm:w-full"
          >
            {pending ? "Sending…" : massEmailSendLabel(recipients)}
          </Button>
          <Button
            type="button"
            kind="secondary"
            onClick={sendTest}
            disabled={pending || blocked}
            className="max-sm:w-full"
            title={`Sends it to ${me}`}
          >
            Send Test to Me
          </Button>
        </div>
      </div>

      <Grouped title="Sent">
        {history.length === 0 ? (
          <li className="px-4 py-2.5 text-text-muted">{MASS_EMAIL_HISTORY_EMPTY}</li>
        ) : (
          history.map((c) => (
            <Row
              key={c.id}
              label={<span className="font-semibold">{c.subject}</span>}
              detail={`${day(c.created_at)} · ${massEmailHistoryText(c)}`}
            />
          ))
        )}
      </Grouped>
      {confirmSheet}
    </div>
  );
}
