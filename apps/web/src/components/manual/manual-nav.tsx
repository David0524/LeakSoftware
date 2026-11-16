"use client";

import { useEffect, useRef, useState } from "react";

export type NavChapter = {
  id: string;
  number: string;
  title: string;
  subtitle: string;
  part: string;
};

/**
 * Phones and small windows, where the contents rail doesn't fit (owner, 2026-11-16: "more
 * mobile friendly"): a slim bar under the site's bar names the chapter you're in, and a tap
 * opens every chapter in a sheet, as Apple Books does. Hidden in print and on wide screens.
 */
export function ManualNav({ chapters }: { chapters: NavChapter[] }) {
  const [current, setCurrent] = useState<NavChapter | null>(null);
  const [shown, setShown] = useState(false);
  const sheet = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const byId = new Map(chapters.map((c) => [c.id, c]));
    const spy = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setCurrent(byId.get(e.target.id) ?? null);
      },
      { rootMargin: "-30% 0px -65% 0px" },
    );
    chapters.forEach((c) => {
      const el = document.getElementById(c.id);
      if (el) spy.observe(el);
    });
    // The bar appears once the cover has scrolled away.
    const cover = document.querySelector(".m-cover");
    const show = new IntersectionObserver(([e]) => setShown(!e?.isIntersecting), {
      rootMargin: "-60px 0px 0px 0px",
    });
    if (cover) show.observe(cover);
    return () => {
      spy.disconnect();
      show.disconnect();
    };
  }, [chapters]);

  const open = () => sheet.current?.showModal();
  const close = () => sheet.current?.close();
  const go = (id: string) => {
    close();
    document.getElementById(id)?.scrollIntoView();
  };

  const parts = [...new Set(chapters.map((c) => c.part))];
  return (
    <>
      <div className={`m-navbar m-web-only${shown ? " is-shown" : ""}`} aria-hidden={!shown}>
        <button type="button" onClick={open} tabIndex={shown ? 0 : -1}>
          <span className="m-navbar-n">{current?.number || "·"}</span>
          <span className="m-navbar-title">{current?.title ?? "Contents"}</span>
          <span className="m-navbar-all">
            Chapters
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <path
                d="M6 9l6 6 6-6"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </button>
      </div>
      <dialog
        ref={sheet}
        className="m-sheet"
        aria-label="Chapters"
        onClick={(e) => {
          if (e.target === sheet.current) close();
        }}
      >
        <div className="m-sheet-head">
          <span className="m-sheet-grabber" aria-hidden="true" />
          <p className="m-sheet-title">Chapters</p>
          <button type="button" className="m-sheet-done" onClick={close}>
            Done
          </button>
        </div>
        <div className="m-sheet-body">
          <ul className="m-sheet-list">
            <li>
              <button type="button" onClick={() => go("contents")}>
                <span className="m-sheet-n" />
                <span className="m-sheet-name">Contents</span>
              </button>
            </li>
            <li>
              <button type="button" onClick={() => go("how-do-i")}>
                <span className="m-sheet-n" />
                <span className="m-sheet-name">How do I…?</span>
              </button>
            </li>
          </ul>
          {parts.map((part) => (
            <div key={part}>
              <p className="m-sheet-part">{part}</p>
              <ul className="m-sheet-list">
                {chapters
                  .filter((c) => c.part === part)
                  .map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        aria-current={current?.id === c.id ? "true" : undefined}
                        onClick={() => go(c.id)}
                      >
                        <span className="m-sheet-n">{c.number}</span>
                        <span className="m-sheet-name">
                          {c.title}
                          <span className="m-sub"> · {c.subtitle}</span>
                        </span>
                      </button>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
      </dialog>
    </>
  );
}

/**
 * Tap a screenshot to see it full size: on a phone the website's screens are too small to read
 * in the page. The picture opens in a sheet where it can be pinched and scrolled.
 */
export function ScreenZoom() {
  const box = useRef<HTMLDialogElement>(null);
  const [src, setSrc] = useState<{ url: string; alt: string } | null>(null);
  useEffect(() => {
    const click = (e: MouseEvent) => {
      const img = (e.target as HTMLElement).closest<HTMLImageElement>(
        ".m-phone-screen img, .m-browser-screen img",
      );
      if (!img) return;
      setSrc({ url: img.currentSrc || img.src, alt: img.alt });
      box.current?.showModal();
    };
    document.addEventListener("click", click);
    return () => document.removeEventListener("click", click);
  }, []);
  return (
    <dialog
      ref={box}
      className="m-zoom"
      aria-label={src?.alt ?? "Screenshot"}
      onClick={() => box.current?.close()}
      onClose={() => setSrc(null)}
    >
      <button type="button" className="m-zoom-done" onClick={() => box.current?.close()}>
        Done
      </button>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- the screenshot already on the page
        <img src={src.url} alt={src.alt} />
      ) : null}
    </dialog>
  );
}
