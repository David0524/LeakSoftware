import Link from "next/link";
import { Fragment } from "react";
import "./manual.css";
import { Chapter, ChapterOpener } from "./kit";
import { chaptersOf, EDITIONS, type EditionInfo } from "./editions";
import type { Edition } from "./kit";
import { pick } from "./types";
import { ManualMotion } from "./motion";
import { ManualNav, ScreenZoom } from "./manual-nav";
import { HowToIndex } from "./howto-index";
import { howToFor } from "./howto";

const UPDATED = "November 2026";

/**
 * A whole manual: the cover, the contents, the parts and their chapters. The website shows it
 * with a contents rail; printed (scripts/build-manuals.mjs) it is the PDF.
 */
export function Manual({ edition }: { edition: Edition }) {
  const info = EDITIONS[edition];
  const all = chaptersOf(info);
  const other = EDITIONS[edition === "pool" ? "leak" : "pool"];
  return (
    <div className="manual">
      <ManualMotion />
      <ManualNav
        chapters={all.map((c) => ({
          id: c.def.id,
          number: c.number,
          title: pick(c.def.title, edition),
          subtitle: pick(c.def.subtitle, edition),
          part: c.part.label ? `${c.part.label} · ${c.part.title}` : c.part.title,
        }))}
      />
      <ScreenZoom />
      {/* The PDF's running footer names the edition (margin boxes can't read the page). */}
      <style>{`@page { size: Letter; margin: 0.7in 0.75in 0.8in;
        @bottom-left { content: "Sundeck Pro · ${info.name} Manual"; font: 8.5pt system-ui, sans-serif; color: #5A6875; }
        @bottom-right { content: counter(page); font: 600 8.5pt system-ui, sans-serif; color: #5A6875; } }
        @page cover { @bottom-left { content: none; } @bottom-right { content: none; } }
        @page part { @bottom-left { content: none; } @bottom-right { content: none; } }`}</style>
      <div className="m-shell">
        <nav className="m-rail" aria-label="Chapters">
          <a href="#contents" className="font-semibold">
            Contents
          </a>
          <a href="#how-do-i" className="font-semibold">
            How do I…?
          </a>
          {info.parts.map((part) => (
            <Fragment key={part.title}>
              <p className="m-rail-part">
                {part.label ? `${part.label} · ${part.title}` : part.title}
              </p>
              {all
                .filter((c) => c.part === part)
                .map((c) => (
                  <a key={c.def.id} href={`#${c.def.id}`}>
                    <span className="m-rail-n">{c.number}</span>
                    <span>
                      {pick(c.def.title, edition)}
                      <span className="m-sub"> · {pick(c.def.subtitle, edition)}</span>
                    </span>
                  </a>
                ))}
            </Fragment>
          ))}
        </nav>
        <main className="m-main">
          <Cover info={info} otherName={other.name} otherSlug={other.slug} />
          <Contents info={info} />
          <HowToIndex groups={howToFor(edition)} />
          {info.parts.map((part) => {
            const chapters = all.filter((c) => c.part === part);
            return (
              <Fragment key={part.title}>
                {part.label ? (
                  <section className="m-part" aria-labelledby={`part-${part.label}`}>
                    <p className="m-part-n">{part.label}</p>
                    <h2 id={`part-${part.label}`} className="m-part-title">
                      {part.title}
                    </h2>
                    {part.intro ? <p className="m-part-intro">{part.intro}</p> : null}
                    <ol className="m-part-list">
                      {chapters.map((c) => (
                        <li key={c.def.id}>
                          <span>{c.number}</span>
                          <span>
                            {pick(c.def.title, edition)}
                            <span className="m-part-sub"> · {pick(c.def.subtitle, edition)}</span>
                          </span>
                          {c.def.moment ? <em>{pick(c.def.moment, edition)}</em> : null}
                        </li>
                      ))}
                    </ol>
                  </section>
                ) : null}
                {chapters.map((c) => {
                  const Body = c.def.Body;
                  return (
                    <Chapter key={c.def.id} id={c.def.id}>
                      <ChapterOpener
                        id={c.def.id}
                        number={c.number || "Prologue"}
                        moment={c.def.moment ? pick(c.def.moment, edition) : undefined}
                        title={pick(c.def.title, edition)}
                        lede={pick(c.def.lede, edition)}
                        learn={c.def.learn ? pick(c.def.learn, edition) : undefined}
                      />
                      <Body edition={edition} />
                    </Chapter>
                  );
                })}
              </Fragment>
            );
          })}
          <p className="m-web-only mt-16 text-center text-[0.9375rem] text-text-muted">
            Questions this manual didn’t answer? See the <Link href="/faq">FAQ</Link> or write to
            us. Running a {other.name.toLowerCase()} shop?{" "}
            <Link href={`/manual/${other.slug}`}>Read the {other.name} manual</Link>.
          </p>
        </main>
      </div>
    </div>
  );
}

function Cover({
  info,
  otherName,
  otherSlug,
}: {
  info: EditionInfo;
  otherName: string;
  otherSlug: string;
}) {
  return (
    <header className="m-cover">
      <p className="m-cover-kicker">Sundeck Pro Manual · {info.name}</p>
      <h1 className="m-cover-title">
        {info.story.split(" ").map((word, i, words) => (
          <Fragment key={i}>
            <span className="m-word" style={{ animationDelay: `${120 + i * 70}ms` }}>
              {word}
            </span>
            {i < words.length - 1 ? " " : null}
          </Fragment>
        ))}
        <span
          className="m-cover-dot"
          aria-hidden="true"
          style={{ animationDelay: `${260 + info.story.split(" ").length * 70}ms` }}
        />
      </h1>
      <p className="m-cover-sub">{info.promise}</p>
      <div className="m-cover-actions">
        <a className="m-cover-btn" href={info.pdf} download>
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M12 3v12m0 0-5-5m5 5 5-5M5 21h14"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Download PDF
        </a>
        <Link className="m-cover-btn m-cover-btn-ghost" href={`/manual/${otherSlug}`}>
          {otherName} Manual
        </Link>
      </div>
      <div className="m-cover-print">
        {/* eslint-disable-next-line @next/next/no-img-element -- static SVG, printed */}
        <img src="/sundeck-logo-reverse.svg" alt="Sundeck Pro" width={205} height={48} />
      </div>
      <Sea />
      <p className="m-cover-meta">
        For the website, the iPhone app and the Android app · Updated {UPDATED} · sundeckpro.com
      </p>
    </header>
  );
}

function Contents({ info }: { info: EditionInfo }) {
  const all = chaptersOf(info);
  return (
    <section id="contents" className="m-contents" aria-labelledby="contents-title">
      <h2 id="contents-title" className="m-contents-title">
        Contents
      </h2>
      {info.parts.map((part) => (
        <Fragment key={part.title}>
          <p className="m-contents-part">
            {part.label ? `${part.label} · ${part.title}` : part.title}
          </p>
          <ol>
            {all
              .filter((c) => c.part === part)
              .map((c) => (
                <li key={c.def.id}>
                  <a href={`#${c.def.id}`}>
                    <span className="m-contents-n">{c.number}</span>
                    <span className="m-contents-name">
                      {pick(c.def.title, info.edition)}
                      <span className="m-sub"> · {pick(c.def.subtitle, info.edition)}</span>
                      {c.def.moment ? (
                        <span className="m-contents-moment">
                          {pick(c.def.moment, info.edition)}
                        </span>
                      ) : null}
                    </span>
                    <span className="m-contents-page" data-toc-page={c.def.id} />
                  </a>
                </li>
              ))}
          </ol>
        </Fragment>
      ))}
    </section>
  );
}

/** Two slow swells along the bottom of the cover, drawn twice side by side so they loop. */
function Sea() {
  const wave = (y: number, amp: number) => {
    let d = `M0 ${y}`;
    for (let x = 0; x < 2400; x += 300) {
      d += ` C${x + 100} ${y - amp} ${x + 200} ${y + amp} ${x + 300} ${y}`;
    }
    return `${d} V200 H0 Z`;
  };
  return (
    <div className="m-sea" aria-hidden="true">
      <svg className="m-sea-back" viewBox="0 0 2400 200" preserveAspectRatio="none">
        <path d={wave(90, 26)} />
      </svg>
      <svg className="m-sea-front" viewBox="0 0 2400 200" preserveAspectRatio="none">
        <path d={wave(120, 18)} />
      </svg>
    </div>
  );
}
