import type { AddressSuggestion } from "@leakbook/core";
import { API_URL } from "./config";
import { getServices } from "./services";

export { suggestionPlace } from "./addressPlace";

// Real addresses for what's typed (owner, 2026-10-20: "an auto complete or something for the
// mapping because it's just too big of an issue if a address doesn't register"), from the
// website's POST /api/address/suggest, nearest the shop first. Empty when lookups aren't set
// up, under 4 characters, the day's allowance is used, or the phone is offline.

export const SUGGEST_MIN_CHARS = 4;
export const SUGGEST_PAUSE_MS = 300;
export const SUGGEST_MAX = 5;

/** Never throws: no answer is no suggestions. */
export async function suggestAddresses(companyId: string, q: string): Promise<AddressSuggestion[]> {
  if (!API_URL || q.trim().length < SUGGEST_MIN_CHARS) return [];
  try {
    const token = await getServices().sync.accessToken();
    if (!token) return [];
    const res = await fetch(`${API_URL}/api/address/suggest`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ company_id: companyId, q }),
    });
    if (!res.ok) return [];
    const data = (await res.json().catch(() => null)) as { suggestions?: unknown } | null;
    return Array.isArray(data?.suggestions)
      ? (data.suggestions as AddressSuggestion[])
          .filter((s) => s && typeof s.line1 === "string")
          .slice(0, SUGGEST_MAX)
      : [];
  } catch {
    return [];
  }
}
