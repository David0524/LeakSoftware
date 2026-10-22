import { API_URL } from "../lib/config";

// Forgot Password? (owner, 2026-10-22): the account's email, posted signed out to the website,
// which emails a link to choose a new password there. Port of the website's ForgotPasswordForm
// (apps/web/src/components/auth-forms.tsx), with its words; the iPhone app's PasswordResetForm.

export const RESET_TITLE = "Reset Password";
export const RESET_INTRO =
  "Enter your account’s email. We’ll send a link to choose a new password.";
export const RESET_EMPTY = "Enter your email.";

/** The address to send, trimmed, or null when it isn't one (the website's EMAIL_PATTERN). */
export function resetAddress(text: string): string | null {
  const trimmed = text.trim();
  return /^\S+@\S+\.\S+$/.test(trimmed) ? trimmed : null;
}

/** What to show: the server's answer (the same whether or not the address has an account). */
export async function requestPasswordReset(
  email: string,
  base: string | null = API_URL,
  fetchImpl: typeof fetch = fetch,
): Promise<{ message: string } | { error: string }> {
  const address = resetAddress(email);
  if (!address) return { error: RESET_EMPTY };
  if (!base) return { error: "This app isn’t connected to the Sundeck Pro server." };
  let res: Response;
  try {
    res = await fetchImpl(`${base}/api/auth/password-reset`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: address }),
    });
  } catch {
    return { error: "No connection. Try again when you have signal." };
  }
  const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
  if (!res.ok) return { error: data.error ?? `The server said ${res.status}.` };
  return {
    message: data.message ?? `If ${address} has a Sundeck Pro account, a reset link is on its way.`,
  };
}
