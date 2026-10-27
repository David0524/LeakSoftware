"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { DISCARD_PROMPT, fieldsOf, leavesPage, signature } from "@/lib/dirty";
import { onBack, pushEntry } from "@/lib/history-entry";
import { useConfirm } from "./sheet";

// Discard changes, everywhere (owner, 2026-10-20): a page form with unsaved changes (New Job, a
// settings page, a customer's details) asks "Discard changes?" before a link, a tab, or the
// browser's Back leaves the page, and the browser warns before a reload or closing the tab.
// Sheets ask by themselves (Sheet). Fields that save by themselves never count.

/** Forms that aren't editors: searches and filters, and any marked data-no-discard. */
function tracked(form: HTMLFormElement) {
  return (
    form.getAttribute("role") !== "search" &&
    form.getAttribute("method")?.toLowerCase() !== "get" &&
    !form.closest("[data-no-discard], [role=dialog], [role=alertdialog]")
  );
}

/** What each tracked form held when it was first touched, or last submitted. */
const baseline = new Map<HTMLFormElement, string>();
const formOf = (el: EventTarget | null) => (el instanceof Element ? el.closest("form") : null);

/** A form starts being watched the moment a field in it is first touched. */
function onFirstFocus(e: FocusEvent) {
  const form = formOf(e.target);
  if (form && tracked(form) && !baseline.has(form)) baseline.set(form, signature(fieldsOf(form)));
}

/**
 * Starts watching the forms in (or around) an element as they are now: a draft is about to be
 * put back into them, and that text must count as unsaved (components/draft-keeper.tsx).
 */
export function watchFormsIn(root: Element) {
  const forms = new Set<HTMLFormElement>(root.querySelectorAll("form"));
  const own = root.closest("form");
  if (own) forms.add(own);
  for (const form of forms)
    if (tracked(form) && !baseline.has(form)) baseline.set(form, signature(fieldsOf(form)));
}

/**
 * A form touched before anyone was listening (typed into while the page was still loading): its
 * starting point is what the page's HTML gave its typed fields. Holding focus, or a typed field
 * that differs from the HTML, marks such a form.
 */
function catchUp() {
  for (const form of document.querySelectorAll("form")) {
    if (baseline.has(form) || !tracked(form)) continue;
    const loaded = signature(fieldsOf(form, { loaded: true }));
    if (form.contains(document.activeElement) || signature(fieldsOf(form)) !== loaded)
      baseline.set(form, loaded);
  }
}

// Listening starts when this module loads, not when the guard mounts: the guard sits in its own
// Suspense boundary in the root layout, which can hydrate after the page, so a field tapped in
// between was never watched and a link left it without asking (e2e/company-save.spec.ts, flaky
// in CI run 40064153635).
const LISTENING = "__leakbookDiscardListening";
if (typeof document !== "undefined" && !(globalThis as Record<string, unknown>)[LISTENING]) {
  (globalThis as Record<string, unknown>)[LISTENING] = true;
  document.addEventListener("focusin", onFirstFocus, true);
  catchUp();
}

/** Watches every page form; mounted once, in the root layout. */
export function DiscardGuard() {
  const router = useRouter();
  const pathname = usePathname();
  const [confirm, confirmSheet] = useConfirm();
  const asking = useRef(false);
  // An entry of ours on top of this page's, so Back can be answered here. Another page
  // (a link, a save that moves on) leaves it behind as that page's way back.
  const entryRef = useRef(false);
  useEffect(() => {
    entryRef.current = false;
  }, [pathname]);

  useEffect(() => {
    const dirty = () => {
      for (const [form, before] of baseline) {
        if (!form.isConnected) baseline.delete(form);
        else if (signature(fieldsOf(form)) !== before) return true;
      }
      return false;
    };
    const forget = () => {
      baseline.clear();
      entryRef.current = false;
    };

    const onInput = (e: Event) => {
      const form = formOf(e.target);
      if (!form || !tracked(form)) return;
      if (!baseline.has(form)) return;
      if (!entryRef.current && dirty()) {
        pushEntry();
        entryRef.current = true;
      }
    };
    // Submitted: what it holds now is what was saved (or is being saved).
    const onSubmit = (e: SubmitEvent) => {
      const form = formOf(e.target);
      if (!form || !baseline.has(form)) return;
      // Not taking our entry off here: moving history while the save is in flight loses
      // the page it moves on to. Back from that page passes through this one once more.
      baseline.set(form, signature(fieldsOf(form)));
    };
    const ask = async () => {
      if (asking.current) return false;
      asking.current = true;
      const discard = await confirm(DISCARD_PROMPT);
      asking.current = false;
      return discard;
    };
    // A link or tab that leaves the page.
    const onClick = (e: MouseEvent) => {
      const link = e.target instanceof Element ? e.target.closest("a[href]") : null;
      if (!(link instanceof HTMLAnchorElement) || e.defaultPrevented) return;
      const leaving = leavesPage(
        { href: link.href, target: link.target, download: link.hasAttribute("download") },
        { button: e.button, meta: e.metaKey, ctrl: e.ctrlKey, shift: e.shiftKey, alt: e.altKey },
        location.href,
      );
      if (!leaving || (!entryRef.current && !dirty())) return;
      e.preventDefault();
      e.stopPropagation();
      const to = link.href;
      void (async () => {
        if (dirty() && !(await ask())) return;
        // Our entry gives way to the next page, so Back from it comes straight here.
        const replace = entryRef.current;
        forget();
        if (replace) router.replace(to);
        else router.push(to);
      })();
    };
    // Back onto the entry under ours.
    const stopBack = onBack(() => {
      // A sheet over the page answers Back for itself.
      if (!entryRef.current || document.querySelector("[role=dialog]")) return false;
      entryRef.current = false;
      if (!dirty()) {
        // Nothing to lose (saved since): carry on to where Back was going.
        history.back();
        return true;
      }
      pushEntry();
      entryRef.current = true;
      void ask().then((discard) => {
        if (!discard) return;
        forget();
        // Off our entry and on to where Back was going, in one step the router sees.
        history.go(-2);
      });
      return true;
    });
    const onUnload = (e: BeforeUnloadEvent) => {
      if (!dirty()) return;
      e.preventDefault();
      e.returnValue = "";
    };

    // Anything typed before now (the module loaded, or this boundary hydrated, late).
    catchUp();
    if (!entryRef.current && dirty()) {
      pushEntry();
      entryRef.current = true;
    }
    document.addEventListener("input", onInput);
    document.addEventListener("change", onInput);
    // A segmented control's choice lives in a hidden input, which fires no input event.
    document.addEventListener("click", onInput);
    document.addEventListener("submit", onSubmit, true);
    document.addEventListener("click", onClick, true);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      document.removeEventListener("input", onInput);
      document.removeEventListener("change", onInput);
      document.removeEventListener("click", onInput);
      document.removeEventListener("submit", onSubmit, true);
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("beforeunload", onUnload);
      stopBack();
    };
  }, [confirm, router]);

  return confirmSheet;
}
