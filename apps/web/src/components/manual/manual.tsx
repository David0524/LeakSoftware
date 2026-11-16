import Link from "next/link";
import { Fragment } from "react";
import "./manual.css";
import { Chapter, ChapterOpener } from "./kit";
import { chaptersOf, EDITIONS, type EditionInfo } from "./editions";
import type { Edition } from "./kit";
import { pick } from "./types";

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
                    <span>{pick(c.def.title, edition)}</span>
                  </a>
                ))}
            </Fragment>
          ))}
        </nav>
        <main className="m-main">
          <Cover info={info} otherName={other.name} otherSlug={other.slug} />
          <Contents info={info} />
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
                          <span>{pick(c.def.title, edition)}</span>
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
        {info.story}
        <span className="m-cover-dot" aria-hidden="true" />
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
