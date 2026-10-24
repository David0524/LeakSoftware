// Password rules (owner, 2026-10-24: "Stronger passwords"): at least 10 characters with an
// uppercase letter, a lowercase letter, a number and a symbol, wherever a password is set (sign
// up, a new password after a reset, joining from an invite). Signing in never checks them, so
// passwords set before keep working. Supabase enforces the same rule on its side
// (password_min_length 10, password_required_characters lower:upper:digits:symbols), so the
// letters, numbers and symbols here are exactly its sets. Swift port: apps/ios/Sources/
// SundeckCore/Password.swift; shared cases: apps/ios/fixtures/cases/password.ts.

export const PASSWORD_MIN_LENGTH = 10;
/** bcrypt reads only the first 72 bytes; Supabase refuses longer passwords. */
export const PASSWORD_MAX_LENGTH = 72;

/** Supabase's symbol set for `password_required_characters`, backslash and colon included. */
export const PASSWORD_SYMBOLS = "!@#$%^&*()_+-=[]{};'\\:\"|<>?,./`~";

export type PasswordRule = "length" | "upper" | "lower" | "number" | "symbol";

/** The checklist under the field, in order. */
export const PASSWORD_RULES: readonly { id: PasswordRule; label: string }[] = [
  { id: "length", label: "At least 10 characters" },
  { id: "upper", label: "An uppercase letter" },
  { id: "lower", label: "A lowercase letter" },
  { id: "number", label: "A number" },
  { id: "symbol", label: "A symbol, like ! ? # or %" },
];

/** The hint beside a new-password field. */
export const PASSWORD_HINT =
  "At least 10 characters, with an uppercase letter, a lowercase letter, a number and a symbol.";

/** Which rules a password meets. Length counts characters as typed (emoji count once). */
export function passwordChecks(password: string): Record<PasswordRule, boolean> {
  const chars = [...password];
  return {
    length: chars.length >= PASSWORD_MIN_LENGTH,
    upper: chars.some((c) => c >= "A" && c <= "Z"),
    lower: chars.some((c) => c >= "a" && c <= "z"),
    number: chars.some((c) => c >= "0" && c <= "9"),
    symbol: chars.some((c) => PASSWORD_SYMBOLS.includes(c)),
  };
}

/** How many of the five rules are met (the meter's bar). */
export function passwordScore(password: string): number {
  return Object.values(passwordChecks(password)).filter(Boolean).length;
}

const MISSING: Record<Exclude<PasswordRule, "length">, string> = {
  upper: "an uppercase letter",
  lower: "a lowercase letter",
  number: "a number",
  symbol: "a symbol",
};

/** A sentence for the first thing wrong with a new password, or null when it's fine. */
export function passwordProblem(password: string): string | null {
  const checks = passwordChecks(password);
  if (!checks.length) return "Use at least 10 characters.";
  if (new TextEncoder().encode(password).length > PASSWORD_MAX_LENGTH)
    return "Use 72 characters or fewer.";
  const missing = (Object.keys(MISSING) as (keyof typeof MISSING)[])
    .filter((rule) => !checks[rule])
    .map((rule) => MISSING[rule]);
  if (missing.length === 0) return null;
  const list =
    missing.length === 1
      ? missing[0]
      : `${missing.slice(0, -1).join(", ")} and ${missing[missing.length - 1]}`;
  return `Add ${list}.`;
}

// Limits on repeated sign-in attempts and auth emails (security review M3): the website counts
// them by email and by visitor (supabase/migrations/20261022002300_auth_attempts.sql).

export type AuthAttemptKind = "sign_in" | "two_step" | "sign_up" | "link" | "reset";

/** What a visitor sees once a limit is reached. */
export function tooManyAttempts(kind: AuthAttemptKind): string {
  return kind === "sign_in" || kind === "two_step"
    ? "Too many attempts. Try again in 15 minutes."
    : "Too many attempts. Try again in an hour.";
}
