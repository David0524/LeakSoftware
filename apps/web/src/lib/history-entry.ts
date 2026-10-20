// An extra history entry for the page itself, so the browser's Back can be answered here
// (close a sheet, ask before discarding changes) instead of leaving the page. Next's router
// never sees these steps: they don't change the URL, and their popstate events stop here.

/** Add an entry for this same page (no URL change, so the router isn't told). */
export function pushEntry() {
  history.pushState(history.state, "");
}

/**
 * Listen for Back, ahead of the router. `handler` answers true when the step was off our entry
 * (it's handled here and the router never sees it), false to leave it to the router.
 */
export function onBack(handler: () => boolean): () => void {
  const listener = (e: PopStateEvent) => {
    if (handler()) e.stopImmediatePropagation();
  };
  window.addEventListener("popstate", listener, { capture: true });
  return () => window.removeEventListener("popstate", listener, { capture: true });
}

/** Take our entry off again without the router noticing. */
export function backQuietly() {
  const swallow = (e: PopStateEvent) => e.stopImmediatePropagation();
  window.addEventListener("popstate", swallow, { capture: true, once: true });
  history.back();
}
