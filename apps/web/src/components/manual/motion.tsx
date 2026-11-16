"use client";

import { useEffect } from "react";

/**
 * The manual page's motion (owner, 2026-11-16: "animated and kind of fun … smooth, premium").
 * Everything is decoration on a page that already reads without it: blocks rise in once as they
 * reach the screen, chapter numbers fill with water, step lines draw, big figures count up, a
 * water line under the bar shows how far you've read, and the contents rail follows along.
 * Nothing hides until this has run, and Reduce Motion, no script and print show the plain page.
 */

const REVEAL = [
  ".m-opener",
  ".m-scene",
  ".m-fig",
  ".m-aside",
  ".m-why",
  ".m-useit",
  ".m-flow",
  ".m-steps",
  ".m-pull",
  ".m-bigfig",
  ".m-table-wrap",
  ".m-gallery-wrap",
  ".m-part",
  ".m-legend",
  ".m-faq-item",
  ".m-glossary > div",
].join(",");

/** "$33,929.00" → [prefix "$", 33929, decimals 2, suffix ""]; null when it isn't a number. */
function parseFigure(text: string) {
  const m = /^(\D{0,2}?)(\d[\d,]*)(\.\d+)?(\s?\D{0,12})$/.exec(text.trim());
  if (!m) return null;
  const value = Number((m[2] + (m[3] ?? "")).replace(/,/g, ""));
  if (!Number.isFinite(value) || value === 0) return null;
  return {
    prefix: m[1],
    value,
    decimals: m[3] ? m[3].length - 1 : 0,
    suffix: m[4],
    comma: m[2].includes(","),
  };
}

function countUp(el: HTMLElement) {
  const original = el.textContent ?? "";
  const f = parseFigure(original);
  if (!f) return;
  const start = performance.now();
  const duration = 1100;
  const format = (v: number) =>
    f.prefix +
    (f.comma
      ? v.toLocaleString("en-US", {
          minimumFractionDigits: f.decimals,
          maximumFractionDigits: f.decimals,
        })
      : v.toFixed(f.decimals)) +
    f.suffix;
  const tick = (now: number) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = t < 1 ? format(f.value * eased) : original;
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

export function ManualMotion() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".manual");
    if (!root) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const cleanups: (() => void)[] = [];

    // The reading line under the bar.
    const bar = document.querySelector<HTMLElement>(".m-progress i");
    if (bar) {
      let frame = 0;
      const update = () => {
        frame = 0;
        const max = document.documentElement.scrollHeight - window.innerHeight;
        bar.style.transform = `scaleX(${max > 0 ? Math.min(1, window.scrollY / max) : 0})`;
      };
      const onScroll = () => {
        if (!frame) frame = requestAnimationFrame(update);
      };
      update();
      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", onScroll);
      cleanups.push(() => {
        window.removeEventListener("scroll", onScroll);
        window.removeEventListener("resize", onScroll);
        cancelAnimationFrame(frame);
      });
    }

    // The contents rail follows the chapter on screen.
    const links = new Map<string, HTMLAnchorElement>();
    document
      .querySelectorAll<HTMLAnchorElement>(".m-rail a[href^='#']")
      .forEach((a) => links.set(a.hash.slice(1), a));
    const chapters = [...document.querySelectorAll<HTMLElement>(".m-chapter[id]")];
    if (links.size && chapters.length) {
      const spy = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (!e.isIntersecting) continue;
            links.forEach((a, id) => {
              if (id === e.target.id) {
                a.setAttribute("aria-current", "true");
                a.scrollIntoView({ block: "nearest" });
              } else a.removeAttribute("aria-current");
            });
          }
        },
        { rootMargin: "-35% 0px -60% 0px" },
      );
      chapters.forEach((c) => spy.observe(c));
      cleanups.push(() => spy.disconnect());
    }

    if (reduce) return () => cleanups.forEach((c) => c());

    // Reveals: what's already on screen shows at once; the rest waits for its turn.
    const targets = [...root.querySelectorAll<HTMLElement>(REVEAL)];
    const fold = window.innerHeight;
    for (const t of targets) {
      if (t.getBoundingClientRect().top < fold) t.classList.add("is-in");
    }
    root.classList.add("m-anim");
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const el = e.target as HTMLElement;
          el.classList.add("is-in");
          el.querySelectorAll<HTMLElement>(".m-why-figures dd, .m-bigfig-value").forEach(countUp);
          io.unobserve(el);
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.08 },
    );
    targets.filter((t) => !t.classList.contains("is-in")).forEach((t) => io.observe(t));
    cleanups.push(() => io.disconnect());

    return () => cleanups.forEach((c) => c());
  }, []);

  return (
    <div className="m-progress m-web-only" aria-hidden="true">
      <i />
    </div>
  );
}
