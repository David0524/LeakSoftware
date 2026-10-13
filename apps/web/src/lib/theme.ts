// Website appearance: System (follow the device), Light, or Dark. The choice is kept in
// this browser (localStorage). The script below runs in <head> before the page paints, so
// there is no flash of the wrong theme; it always sets data-theme to "light" or "dark",
// which the tokens and Tailwind's dark: variant read.

export type ThemePreference = "system" | "light" | "dark";

export const THEME_STORAGE_KEY = "lb-theme";
export const THEME_EVENT = "lb-theme-change";

export const THEME_SCRIPT = `(function(){try{
var d=document.documentElement,m=matchMedia("(prefers-color-scheme: dark)");
function apply(){var p=localStorage.getItem("${THEME_STORAGE_KEY}");
if(p!=="light"&&p!=="dark")p="system";
d.dataset.themePref=p;d.dataset.theme=p==="system"?(m.matches?"dark":"light"):p;}
apply();m.addEventListener("change",apply);addEventListener("${THEME_EVENT}",apply);
addEventListener("storage",apply);
}catch(e){}})()`;
