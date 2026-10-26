// Website appearance: Light (the default) or Dark, switched with the sun/moon button and
// kept in this browser (localStorage). The device's own setting is not followed (owner,
// 2026-10-13). The script below runs in <head> before the page paints, so there is no flash
// of the wrong theme; it sets data-theme, which the tokens and Tailwind's dark: variant read.
//
// The public site (the landing page, terms, sign-in: the (public) pages) is always light
// (owner, 2026-10-22: "remove dark mode on the landing page"). Its layout marks the page with
// data-light-only (components/light-only.tsx); the script marks it too on a first load of those
// paths, so a visitor who chose Dark in the office never sees the landing page flash dark.

export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "lb-theme";
export const THEME_EVENT = "lb-theme-change";

/**
 * The (public) pages and the pages for the shop's customers (a quote, invoice or report link,
 * the sign-off, unsubscribe and weekly-summary pages), which are always light.
 */
export const LIGHT_ONLY_PATHS =
  /^\/(?:privacy|terms|security|status|sign-in|sign-up|setup|invite|forgot-password|reset-password|q|i|r|stop|unsubscribe|weekly-summary|sign-off|in-app)?(?:\/|$)/;

export const THEME_SCRIPT = `(function(){try{
var d=document.documentElement;
if(${LIGHT_ONLY_PATHS}.test(location.pathname))d.dataset.lightOnly="";
function apply(){d.dataset.theme=d.dataset.lightOnly===undefined&&localStorage.getItem("${THEME_STORAGE_KEY}")==="dark"?"dark":"light";}
apply();addEventListener("${THEME_EVENT}",apply);addEventListener("storage",apply);
if(localStorage.getItem("sundeck.schedule.dayMapOpen")==="0")d.dataset.mapsFolded="";
}catch(e){document.documentElement.dataset.theme="light";}})()`;
