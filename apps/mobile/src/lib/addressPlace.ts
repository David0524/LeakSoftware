import type { AddressSuggestion } from "@leakbook/core";

/** The list's second line: "City, ST ZIP". */
export function suggestionPlace(s: Pick<AddressSuggestion, "city" | "state" | "postal_code">) {
  return [s.city, [s.state, s.postal_code].filter(Boolean).join(" ")].filter(Boolean).join(", ");
}
