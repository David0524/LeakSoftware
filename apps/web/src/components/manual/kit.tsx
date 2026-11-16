import type { ReactNode } from "react";
import { cx } from "@/components/ui";

/**
 * The building blocks of the Sundeck Pro manuals (owner, 2026-11-16;
 * docs/plans/2026-11-16-manuals.md). Each manual is told as a story: a chapter opens on a moment
 * in the shop's day (`Scene`), then teaches what that moment needs (`Steps`, screens, asides).
 * The same markup is the web page and, printed by Chromium, the PDF (manual.css has both).
 */

export type Edition = "pool" | "leak";
export type Role = "Owner" | "Admin" | "Tech" | "Customer";
export type Place = "Website" | "iPhone" | "Android" | "Phone website";

/** Opens a chapter: its number, the moment it starts on, its title and the promise. */
export function ChapterOpener({
  id,
  number,
  moment,
  title,
  lede,
  learn,
}: {
  id: string;
  number: string;
  /** When the story is: "Monday · 6:52 a.m." */
  moment?: string;
  title: string;
  lede: ReactNode;
  /** "In this chapter": what the reader will be able to do. */
  learn?: string[];
}) {
  return (
    <header className="m-opener">
      <p className="m-opener-number" aria-hidden="true">
        {number}
      </p>
      <p className="m-eyebrow">
        {/^\d+$/.test(number) ? `Chapter ${number}` : number}
        {moment ? <span className="m-moment"> · {moment}</span> : null}
      </p>
      <h2 id={`${id}-title`} className="m-chapter-title">
        {title}
      </h2>
      <p className="m-lede">{lede}</p>
      {learn?.length ? (
        <div className="m-learn">
          <p className="m-learn-title">In this chapter</p>
          <ul>
            {learn.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </header>
  );
}

/** A chapter: starts a new page in print. Links point at its `id`. */
export function Chapter({ id, children }: { id: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="m-chapter">
      {children}
    </section>
  );
}

/** The story: a moment in the shop's day, told in a larger, quieter voice. */
export function Scene({ time, children }: { time?: string; children: ReactNode }) {
  return (
    <div className="m-scene">
      {time ? <p className="m-scene-time">{time}</p> : null}
      <div className="m-scene-body">{children}</div>
    </div>
  );
}

/** A section heading inside a chapter. */
export function Section({
  title,
  kicker,
  children,
}: {
  title: string;
  kicker?: string;
  children: ReactNode;
}) {
  return (
    <section className="m-section">
      {kicker ? <p className="m-kicker">{kicker}</p> : null}
      <h3 className="m-h3">{title}</h3>
      {children}
    </section>
  );
}

/** A smaller heading. */
export function Sub({ children }: { children: ReactNode }) {
  return <h4 className="m-h4">{children}</h4>;
}

/** Numbered steps. */
export function Steps({ children }: { children: ReactNode }) {
  return <ol className="m-steps">{children}</ol>;
}

export function Step({ title, children }: { title?: ReactNode; children?: ReactNode }) {
  return (
    <li className="m-step">
      {title ? <p className="m-step-title">{title}</p> : null}
      {children ? <div className="m-step-body">{children}</div> : null}
    </li>
  );
}

/** A button, tab, or setting name exactly as it appears on screen. */
export function Ui({ children }: { children: ReactNode }) {
  return <strong className="m-ui">{children}</strong>;
}

/** A path through menus: <Path items={["More", "Settings", "Team"]} />. */
export function Path({ items }: { items: string[] }) {
  return (
    <span className="m-path">
      {items.map((item, i) => (
        <span key={item + i}>
          {i > 0 ? <span className="m-path-sep"> › </span> : null}
          <strong className="m-ui">{item}</strong>
        </span>
      ))}
    </span>
  );
}

const ASIDE = {
  tip: { label: "Tip", className: "m-aside-tip" },
  note: { label: "Good to know", className: "m-aside-note" },
  watch: { label: "Watch out", className: "m-aside-watch" },
  pro: { label: "From the field", className: "m-aside-pro" },
} as const;

function Aside({
  kind,
  title,
  children,
}: {
  kind: keyof typeof ASIDE;
  title?: string;
  children: ReactNode;
}) {
  const a = ASIDE[kind];
  return (
    <aside className={cx("m-aside", a.className)}>
      <p className="m-aside-label">{a.label}</p>
      {title ? <p className="m-aside-title">{title}</p> : null}
      <div className="m-aside-body">{children}</div>
    </aside>
  );
}

/** A shortcut or better way to do something. */
export const Tip = (p: { title?: string; children: ReactNode }) => <Aside kind="tip" {...p} />;
/** A rule or detail worth knowing. */
export const Note = (p: { title?: string; children: ReactNode }) => <Aside kind="note" {...p} />;
/** Something that can't be undone or often trips people up. */
export const Watch = (p: { title?: string; children: ReactNode }) => <Aside kind="watch" {...p} />;
/** How a working shop uses it. */
export const FromTheField = (p: { title?: string; children: ReactNode }) => (
  <Aside kind="pro" {...p} />
);

/** "Put it to work": short scenarios of what a feature is for. */
export function UseIt({
  title = "Put it to work",
  items,
}: {
  title?: string;
  items: { who: string; text: ReactNode }[];
}) {
  return (
    <div className="m-useit">
      <p className="m-useit-title">{title}</p>
      <div className="m-useit-grid">
        {items.map((it, i) => (
          <div key={i} className="m-useit-card">
            <p className="m-useit-who">{it.who}</p>
            <p>{it.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/** "Why it matters": what it changes for the shop, with optional big figures. */
export function WhyItMatters({
  title = "Why it matters",
  figures,
  children,
}: {
  title?: string;
  figures?: { value: string; label: string }[];
  children: ReactNode;
}) {
  return (
    <div className="m-why">
      <p className="m-why-label">{title}</p>
      <div className="m-why-body">{children}</div>
      {figures?.length ? (
        <dl className="m-why-figures">
          {figures.map((f) => (
            <div key={f.label}>
              <dt>{f.label}</dt>
              <dd>{f.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}

/** A large line that changes the rhythm of the page. */
export function PullQuote({ children, by }: { children: ReactNode; by?: string }) {
  return (
    <figure className="m-pull">
      <blockquote>{children}</blockquote>
      {by ? <figcaption>{by}</figcaption> : null}
    </figure>
  );
}

/** One big number with a label. */
export function BigFigure({ value, label }: { value: string; label: ReactNode }) {
  return (
    <div className="m-bigfig">
      <p className="m-bigfig-value">{value}</p>
      <p className="m-bigfig-label">{label}</p>
    </div>
  );
}

/** Who can do this, and where. */
export function Meta({ who, where }: { who?: Role[]; where?: Place[] }) {
  return (
    <p className="m-meta">
      {who?.length ? (
        <span className="m-meta-group">
          <span className="m-meta-key">Who</span>
          {who.map((w) => (
            <span key={w} className="m-chip">
              {w}
            </span>
          ))}
        </span>
      ) : null}
      {where?.length ? (
        <span className="m-meta-group">
          <span className="m-meta-key">Where</span>
          {where.map((w) => (
            <span key={w} className="m-chip m-chip-place">
              {w}
            </span>
          ))}
        </span>
      ) : null}
    </p>
  );
}

type Mark = { x: number; y: number; n: number };

function Marks({ marks }: { marks?: Mark[] }) {
  if (!marks?.length) return null;
  return (
    <>
      {marks.map((m) => (
        <span
          key={m.n}
          className="m-mark"
          style={{ left: `${m.x}%`, top: `${m.y}%` }}
          aria-hidden="true"
        >
          {m.n}
        </span>
      ))}
    </>
  );
}

/**
 * An iPhone screen in a phone frame. `src` is a file in /public/manual/ios (no extension).
 * `full` shows the whole scrolled screen instead of the first screenful.
 */
export function Phone({
  src,
  alt,
  caption,
  full = false,
  marks,
  size = "md",
}: {
  src: string;
  alt: string;
  caption?: ReactNode;
  full?: boolean;
  marks?: Mark[];
  size?: "sm" | "md" | "lg";
}) {
  return (
    <figure className={cx("m-fig m-phone-fig", `m-phone-${size}`)}>
      <div className={cx("m-phone", full && "m-phone-full")}>
        <div className="m-phone-screen">
          {/* eslint-disable-next-line @next/next/no-img-element -- static screenshot, printed to PDF */}
          <img src={`/manual/ios/${src}.webp`} alt={alt} loading="lazy" decoding="async" />
          <Marks marks={marks} />
        </div>
      </div>
      {caption ? <figcaption className="m-caption">{caption}</figcaption> : null}
    </figure>
  );
}

/** A website screen in a browser window. `src` is a file in /public/manual/web (no extension). */
export function Browser({
  src,
  alt,
  url,
  caption,
  marks,
  phone = false,
}: {
  src: string;
  alt: string;
  /** The address shown in the bar, e.g. "sundeckpro.com/schedule". */
  url?: string;
  caption?: ReactNode;
  marks?: Mark[];
  /** A phone-size capture of the website, shown in a phone frame. */
  phone?: boolean;
}) {
  if (phone) {
    return (
      <figure className="m-fig m-phone-fig m-phone-md">
        <div className="m-phone">
          <div className="m-phone-screen">
            {/* eslint-disable-next-line @next/next/no-img-element -- static screenshot */}
            <img src={`/manual/web/${src}.webp`} alt={alt} loading="lazy" decoding="async" />
            <Marks marks={marks} />
          </div>
        </div>
        {caption ? <figcaption className="m-caption">{caption}</figcaption> : null}
      </figure>
    );
  }
  return (
    <figure className="m-fig m-browser-fig">
      <div className="m-browser">
        <div className="m-browser-bar" aria-hidden="true">
          <span className="m-dots">
            <i />
            <i />
            <i />
          </span>
          <span className="m-url">{url ?? "sundeckpro.com"}</span>
        </div>
        <div className="m-browser-screen">
          {/* eslint-disable-next-line @next/next/no-img-element -- static screenshot */}
          <img src={`/manual/web/${src}.webp`} alt={alt} loading="lazy" decoding="async" />
          <Marks marks={marks} />
        </div>
      </div>
      {caption ? <figcaption className="m-caption">{caption}</figcaption> : null}
    </figure>
  );
}

/** Text beside a screen. `flip` puts the screen on the left. */
export function Spread({
  figure,
  children,
  flip = false,
}: {
  figure: ReactNode;
  children: ReactNode;
  flip?: boolean;
}) {
  return (
    <div className={cx("m-spread", flip && "m-spread-flip")}>
      <div className="m-spread-text">{children}</div>
      <div className="m-spread-fig">{figure}</div>
    </div>
  );
}

/** Two or three screens side by side. */
export function Gallery({ children, caption }: { children: ReactNode; caption?: ReactNode }) {
  return (
    <div className="m-gallery-wrap">
      <div className="m-gallery">{children}</div>
      {caption ? <p className="m-caption m-gallery-caption">{caption}</p> : null}
    </div>
  );
}

/** A numbered legend for the marks on a screen. */
export function Legend({ items }: { items: ReactNode[] }) {
  return (
    <ol className="m-legend">
      {items.map((it, i) => (
        <li key={i}>
          <span className="m-legend-n">{i + 1}</span>
          <span>{it}</span>
        </li>
      ))}
    </ol>
  );
}

/** A plain two-column table: term and meaning. */
export function Table({
  head,
  rows,
}: {
  head?: [string, string] | [string, string, string];
  rows: ReactNode[][];
}) {
  return (
    <div className="m-table-wrap">
      <table className="m-table">
        {head ? (
          <thead>
            <tr>
              {head.map((h) => (
                <th key={h} scope="col">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
        ) : null}
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) =>
                j === 0 ? (
                  <th key={j} scope="row">
                    {c}
                  </th>
                ) : (
                  <td key={j}>{c}</td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A horizontal timeline of a process: each stage with a short line. */
export function Flow({ stages }: { stages: { title: string; text: ReactNode }[] }) {
  return (
    <ol className="m-flow">
      {stages.map((s, i) => (
        <li key={s.title}>
          <span className="m-flow-n">{i + 1}</span>
          <p className="m-flow-title">{s.title}</p>
          <p className="m-flow-text">{s.text}</p>
        </li>
      ))}
    </ol>
  );
}
