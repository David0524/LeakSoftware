// Website appearance: Light (the default) or Dark, switched with the sun/moon button and
// kept in this browser (localStorage). The device's own setting is not followed (owner,
// 2026-10-13). The script below runs in <head> before the page paints, so there is no flash
// of the wrong theme; it sets data-theme, which the tokens and Tailwind's dark: variant read.

export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "lb-theme";
export const THEME_EVENT = "lb-theme-change";

export const THEME_SCRIPT = `(function(){try{
var d=document.documentElement;
function apply(){d.dataset.theme=localStorage.getItem("${THEME_STORAGE_KEY}")==="dark"?"dark":"light";}
apply();addEventListener("${THEME_EVENT}",apply);addEventListener("storage",apply);
}catch(e){document.documentElement.dataset.theme="light";}})()`;
