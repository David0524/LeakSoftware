import { API_URL } from "../lib/config";

import { friendlyError } from "@leakbook/core";
// Create an Account (owner, 2026-10-24): through the website's POST /api/auth/sign-up, which
// checks the password rules, limits sign-ups, and sends the confirmation email whose link
// works on any phone or computer. Port of SundeckApp's Auth.signUp.

export interface SignUpRequest {
  name: string;
  email: string;
  password: string;
  heard_from: string | null;
  heard_from_other: string | null;
  /** The screen shows "By creating an account, you agree to the Terms and Privacy Policy." */
  accepted_terms: true;
}

/** `confirmEmail`: the account waits on its email; false: sign in with the password now. */
export async function signUpOnServer(
  request: SignUpRequest,
  base: string | null = API_URL,
  fetchImpl: typeof fetch = fetch,
): Promise<{ confirmEmail: boolean } | { error: string }> {
  if (!base) return { error: "This app isn’t connected to the Sundeck Pro server." };
  let res: Response;
  try {
    res = await fetchImpl(`${base}/api/auth/sign-up`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    });
  } catch {
    return { error: "No connection. Connect to the internet to sign up." };
  }
  const data = (await res.json().catch(() => ({}))) as { confirmEmail?: boolean; error?: string };
  if (!res.ok) return { error: friendlyError(data.error ?? `The server said ${res.status}.`) };
  return { confirmEmail: data.confirmEmail !== false };
}
