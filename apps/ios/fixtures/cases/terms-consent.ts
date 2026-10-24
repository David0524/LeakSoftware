import { TERMS_CONSENT, termsConsentText } from "@leakbook/core";
import { rule, type ModuleCases } from "../case";

// terms-consent.ts: the line under every sign-up's create button (owner, 2026-10-24).
export const termsConsent: ModuleCases = {
  TERMS_CONSENT: rule(() => TERMS_CONSENT, [[]]),
  termsConsentText: rule(() => termsConsentText(), [[]]),
};
