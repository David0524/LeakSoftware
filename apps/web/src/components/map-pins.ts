import { tokens } from "@leakbook/tokens";
import type { LatLng, PinTone } from "@leakbook/core";

// The live maps' pins, the same on Apple (MapKit JS) and Mapbox GL: numbers in their colors,
// the shop as a house, 44 pt to tap, and a ring on the selected stop. Client-safe.

export interface LivePin {
  label: string;
  at: LatLng;
  tone: PinTone;
}

export const TONE_COLOR: Record<PinTone, string> = {
  shop: tokens.color.brand.navy,
  todo: tokens.color.brand.water,
  current: tokens.color.brand.safety,
  done: tokens.color.status.pass,
};

const HOUSE =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 11l8-7 8 7"/><path d="M6 10v10h12V10"/></svg>';

export function pinElement(pin: LivePin, onSelect: () => void): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button";
  el.dataset.label = pin.label;
  el.setAttribute("aria-label", pin.tone === "shop" ? "The shop" : `Stop ${pin.label}`);
  // 44 pt to tap; the visible dot inside is 28.
  el.style.cssText =
    "width:44px;height:44px;display:grid;place-items:center;background:none;border:0;padding:0;cursor:pointer";
  const dot = document.createElement("span");
  dot.style.cssText = `width:28px;height:28px;border-radius:9999px;display:grid;place-items:center;background:${TONE_COLOR[pin.tone]};color:#fff;font:700 13px/1 system-ui,-apple-system,sans-serif;border:2px solid #fff;box-shadow:0 1px 4px rgb(0 0 0/.35);transition:transform .15s ease`;
  if (pin.tone === "shop") dot.innerHTML = HOUSE;
  else dot.textContent = pin.label;
  el.appendChild(dot);
  el.addEventListener("click", (e) => {
    e.stopPropagation();
    onSelect();
  });
  return el;
}

/** Marks the selected stop's pin: larger, with a ring. */
export function markSelected(pins: HTMLElement[], selected: string | null) {
  for (const el of pins) {
    const dot = el.firstElementChild as HTMLElement | null;
    const on = el.dataset.label === selected && selected !== "";
    el.setAttribute("aria-pressed", String(on));
    if (dot) {
      dot.style.transform = on ? "scale(1.25)" : "";
      dot.style.outline = on ? `3px solid ${tokens.color.brand.water}` : "";
      dot.style.outlineOffset = on ? "2px" : "";
    }
    el.style.zIndex = on ? "2" : "";
  }
}

/** The route's line: the shop, the stops in order, and back to the shop. */
export function routeLine(pins: LivePin[]): LivePin[] {
  const shop = pins.find((p) => p.tone === "shop");
  const stops = pins.filter((p) => p.tone !== "shop");
  return [...(shop ? [shop] : []), ...stops, ...(shop && stops.length ? [shop] : [])];
}
