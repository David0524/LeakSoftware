// Weather on Today (owner request, 2026-10-13). The National Weather Service gives a short
// forecast in words ("Mostly Sunny", "Chance Showers And Thunderstorms"); this picks the
// icon for it. Pure, no network.

export type WeatherKind =
  "clear" | "partly" | "cloudy" | "rain" | "storm" | "snow" | "fog" | "wind" | "dust";

/** The icon for a short forecast. Order matters: the most important word wins. */
export function weatherKind(text: string): WeatherKind {
  const t = text.toLowerCase();
  if (/thunder|t-storm/.test(t)) return "storm";
  if (/snow|sleet|ice|flurr|freezing/.test(t)) return "snow";
  if (/rain|shower|drizzle/.test(t)) return "rain";
  if (/dust|sand|smoke|haze/.test(t)) return "dust";
  if (/fog|mist/.test(t)) return "fog";
  if (/wind|breez|gust/.test(t)) return "wind";
  if (/partly|mostly sunny|mostly clear|few clouds/.test(t)) return "partly";
  if (/cloud|overcast/.test(t)) return "cloudy";
  return "clear";
}

export interface Weather {
  /** Now, °F. */
  tempF: number;
  /** "Mostly Sunny" */
  conditions: string;
  kind: WeatherKind;
  isDaytime: boolean;
  /** Today's high, °F, while there's daytime left. */
  highF: number | null;
}
