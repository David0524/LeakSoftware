import type { WeatherKind } from "@leakbook/core";
import { weatherForZip } from "@/server/weather";

const SUN = (
  <>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </>
);
const MOON = <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />;
const CLOUD = <path d="M7 18h10a4 4 0 0 0 .6-8A6 6 0 0 0 6 9.5 4.3 4.3 0 0 0 7 18z" />;
const SMALL_CLOUD = (
  <path d="M9 20h8a3.2 3.2 0 0 0 .5-6.4A4.8 4.8 0 0 0 8.3 13 3.5 3.5 0 0 0 9 20z" />
);

const ICONS: Record<WeatherKind, { day: React.ReactNode; night?: React.ReactNode }> = {
  clear: { day: SUN, night: MOON },
  partly: {
    day: (
      <>
        <circle cx="9" cy="9" r="3.2" />
        <path d="M9 2.5v1.5M3.5 9H2M4.4 4.4l1 1M13.6 4.4l-1 1" />
        {SMALL_CLOUD}
      </>
    ),
    night: (
      <>
        <path d="M14 8.5A5.5 5.5 0 1 1 7 2.5a4.5 4.5 0 0 0 7 6z" />
        {SMALL_CLOUD}
      </>
    ),
  },
  cloudy: { day: CLOUD },
  rain: {
    day: (
      <>
        <path d="M7 15h10a4 4 0 0 0 .6-8A6 6 0 0 0 6 6.5 4.3 4.3 0 0 0 7 15z" />
        <path d="M8 18l-1 3M12 18l-1 3M16 18l-1 3" />
      </>
    ),
  },
  storm: {
    day: (
      <>
        <path d="M7 15h10a4 4 0 0 0 .6-8A6 6 0 0 0 6 6.5 4.3 4.3 0 0 0 7 15z" />
        <path d="M13 15l-2.5 4h3L11 23" />
      </>
    ),
  },
  snow: {
    day: (
      <>
        <path d="M7 15h10a4 4 0 0 0 .6-8A6 6 0 0 0 6 6.5 4.3 4.3 0 0 0 7 15z" />
        <path d="M8 19h.01M12 19h.01M16 19h.01M10 22h.01M14 22h.01" strokeWidth="2.5" />
      </>
    ),
  },
  fog: { day: <path d="M4 9h16M3 13h18M5 17h14" /> },
  wind: { day: <path d="M3 8h11a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h8" /> },
  dust: { day: <path d="M4 8h12M2 12h18M6 16h12M18 8h.01M22 16h.01" /> },
};

/**
 * The weather at the shop's zip code: an icon, the temperature now, the conditions, and
 * today's high. Shows nothing without a zip code or when the weather service doesn't answer.
 */
export async function WeatherBadge({ zip }: { zip: string | null }) {
  const w = await weatherForZip(zip);
  if (!w) return null;
  const icon = ICONS[w.kind];
  const label = `${w.tempF}°F, ${w.conditions}${w.highF != null ? `, high ${w.highF}°` : ""}`;
  return (
    <span
      role="img"
      aria-label={`Weather: ${label}`}
      data-testid="weather"
      className="inline-flex items-center gap-1.5 text-text"
    >
      <svg
        viewBox="0 0 24 24"
        className="size-6 shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {(!w.isDaytime && icon.night) || icon.day}
      </svg>
      <span aria-hidden="true">
        <span className="font-semibold">{w.tempF}°</span> {w.conditions}
        {w.highF != null ? <span className="text-text-muted"> · High {w.highF}°</span> : null}
      </span>
    </span>
  );
}
