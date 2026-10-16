import Link from "next/link";
import { formatPhone } from "@leakbook/core";
import type { ConversationRow, Line, ThreadItem } from "@/lib/messages";
import { InboxRow } from "./conversation-row";
import { PhoneIcon, VoicemailIcon } from "./icons";
import { Empty, Notice, SEGMENT_TRACK, cx, segmentClass } from "./ui";

// The Messages inbox (company texting, owner 2026-10-16): conversations on the left, the
// thread on the right (one at a time on phones).

export const conversationName = (c: ConversationRow) => c.customer?.name ?? formatPhone(c.phone);

function when(iso: string, timeZone: string, now = new Date()) {
  const at = new Date(iso);
  const day = (d: Date) => d.toLocaleDateString("en-US", { timeZone });
  if (day(at) === day(now)) {
    return at.toLocaleTimeString("en-US", { timeZone, hour: "numeric", minute: "2-digit" });
  }
  return at.toLocaleDateString("en-US", { timeZone, month: "short", day: "numeric" });
}

/**
 * Messages and Customers share a tab, Messages first (owner, 2026-10-16): this switch sits at
 * the top of both, as a segmented control of links, with the unread count on Messages.
 */
export function PeopleSwitch({
  current,
  unread,
}: {
  current: "customers" | "messages";
  unread: number;
}) {
  return (
    <nav aria-label="Messages and Customers" className={cx(SEGMENT_TRACK, "mb-5 flex-nowrap")}>
      {(
        [
          { key: "messages", href: "/messages", label: "Messages" },
          { key: "customers", href: "/customers", label: "Customers" },
        ] as const
      ).map((o) => (
        <Link
          key={o.key}
          href={o.href}
          aria-current={o.key === current ? "page" : undefined}
          className={segmentClass(o.key === current, "min-w-32")}
        >
          {o.label}
          {o.key === "messages" && unread ? (
            <>
              {" "}
              <span className="tabular-nums">({unread})</span>
              <span className="sr-only"> unread</span>
            </>
          ) : null}
        </Link>
      ))}
    </nav>
  );
}

export function ConversationList({
  conversations,
  current,
  timeZone,
}: {
  conversations: ConversationRow[];
  current?: string;
  timeZone: string;
}) {
  if (conversations.length === 0) {
    return <Empty>No messages yet. Texts and calls to the company number show up here.</Empty>;
  }
  return (
    <ul className="grouped" aria-label="Conversations">
      {conversations.map((c) => (
        <InboxRow
          key={c.id}
          id={c.id}
          name={conversationName(c)}
          when={when(c.last_at, timeZone)}
          preview={c.last_preview ?? ""}
          unread={c.unread}
          current={c.id === current}
        />
      ))}
    </ul>
  );
}

/** No working number yet: what to do about it. */
export function LineNotice({ line, isOwner }: { line: Line | null; isOwner: boolean }) {
  if (line?.status === "active") return null;
  if (line?.status === "pending") {
    return (
      <Notice tone="info">
        {formatPhone(line.number)} is being set up for texting. It usually takes a few days; texts
        and calls will appear here once it’s ready.
      </Notice>
    );
  }
  return (
    <Notice tone="info">
      Text and call customers from one company number the whole team shares.{" "}
      {isOwner ? (
        <Link href="/settings/phone" className="font-semibold text-link underline">
          Set Up a Number
        </Link>
      ) : (
        "Ask an owner to set up a company number."
      )}
    </Notice>
  );
}

const STATUS_LABEL: Record<string, string> = {
  queued: "Sending",
  sent: "Sent",
  delivered: "Delivered",
  undelivered: "Not delivered",
  failed: "Not sent",
};

const minutes = (s: number | null) =>
  s == null ? "" : s < 60 ? `${s} sec` : `${Math.round(s / 60)} min`;

function callLabel(c: Extract<ThreadItem, { kind: "call" }>, names: Map<string, string>) {
  const who = c.userId ? names.get(c.userId) : null;
  if (c.voicemail || c.status === "voicemail") return `Voicemail · ${minutes(c.seconds)}`;
  if (c.status === "missed") return "Missed call";
  if (c.status === "failed") return c.direction === "out" ? "Call didn’t connect" : "Missed call";
  if (c.status === "ringing") return c.direction === "out" ? "Calling…" : "Incoming call";
  const verb = c.direction === "out" ? `${who ?? "Team"} called` : "Incoming call";
  return `${verb}${c.seconds ? ` · ${minutes(c.seconds)}` : ""}`;
}

export function Thread({
  items,
  names,
  timeZone,
}: {
  items: ThreadItem[];
  names: Map<string, string>;
  timeZone: string;
}) {
  if (items.length === 0) return <Empty>No messages yet. Send the first text below.</Empty>;
  const dayOf = (iso: string) =>
    new Date(iso).toLocaleDateString("en-US", {
      timeZone,
      weekday: "long",
      month: "short",
      day: "numeric",
    });
  return (
    <ol className="space-y-2" aria-label="Messages">
      {items.map((item, i) => {
        const at = new Date(item.at);
        const dayLabel = dayOf(item.at);
        // A day's first message gets the date above it.
        const showDay = i === 0 || dayOf(items[i - 1]!.at) !== dayLabel;
        const time = at.toLocaleTimeString("en-US", {
          timeZone,
          hour: "numeric",
          minute: "2-digit",
        });
        return (
          <li key={`${item.kind}-${item.id}`}>
            {showDay ? (
              <p className="pt-3 pb-1 text-center text-[0.8125rem] text-text-muted">{dayLabel}</p>
            ) : null}
            {item.kind === "call" ? (
              <div className="mx-auto max-w-md rounded-2xl bg-text/[0.04] px-4 py-2.5 text-[0.9375rem]">
                <p className="flex items-center justify-center gap-2 text-text-muted">
                  {item.voicemail ? (
                    <VoicemailIcon className="size-4" />
                  ) : (
                    <PhoneIcon className="size-4" />
                  )}
                  <span>
                    {callLabel(item, names)} · {time}
                  </span>
                </p>
                {item.voicemail ? (
                  <audio
                    controls
                    preload="none"
                    src={`/api/calls/${item.id}/recording`}
                    className="mt-2 w-full"
                    aria-label={`Voicemail from ${time}`}
                  />
                ) : null}
                {item.transcript ? <p className="mt-2 text-text">“{item.transcript}”</p> : null}
              </div>
            ) : (
              <div
                className={cx(
                  "flex flex-col",
                  item.direction === "out" ? "items-end" : "items-start",
                )}
              >
                {item.pictures.length ? (
                  <div className="mb-1 flex max-w-[80%] flex-wrap gap-1">
                    {item.pictures.map((p) => (
                      <a key={p.url} href={p.url} target="_blank" rel="noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element -- signed, short-lived links */}
                        <img
                          src={p.url}
                          alt="Photo in a text"
                          className="max-h-56 rounded-2xl object-cover"
                        />
                      </a>
                    ))}
                  </div>
                ) : null}
                {item.body ? (
                  <p
                    className={cx(
                      "max-w-[80%] rounded-[1.25rem] px-4 py-2 break-words whitespace-pre-wrap",
                      item.direction === "out" ? "bg-primary text-on-primary" : "bg-fill text-text",
                    )}
                  >
                    {item.body}
                  </p>
                ) : null}
                <p
                  className={cx(
                    "mt-0.5 px-2 text-[0.8125rem]",
                    item.status === "failed" || item.status === "undelivered"
                      ? "text-status-fail"
                      : "text-text-muted",
                  )}
                >
                  {item.direction === "out"
                    ? [
                        item.sentBy ? names.get(item.sentBy) : null,
                        STATUS_LABEL[item.status] ?? item.status,
                        time,
                      ]
                        .filter(Boolean)
                        .join(" · ")
                    : time}
                  {item.error ? ` (${item.error})` : null}
                </p>
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
