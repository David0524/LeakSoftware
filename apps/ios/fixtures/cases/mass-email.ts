import {
  LAST_JOB_CHOICES,
  massEmailConfirm,
  massEmailCountText,
  massEmailErrors,
  massEmailHistoryText,
  massEmailLimitText,
  massEmailSendLabel,
  massEmailSentText,
} from "@leakbook/core";
import { rule, type ModuleCases } from "../case";

// mass-email.ts (owner, 2026-10-22: "send mass email (with some filtering)"): Email Customers'
// words on the phones.

export const massEmail: ModuleCases = {
  LAST_JOB_CHOICES: rule(() => LAST_JOB_CHOICES, [[]]),
  massEmailCountText: rule(
    (recipients: number, no_email: number, unsubscribed: number) =>
      massEmailCountText({ recipients, no_email, unsubscribed }),
    [
      [42, 3, 2],
      [1, 0, 0],
      [0, 0, 1],
      [0, 1, 0],
      [1204, 0, 7],
    ],
  ),
  massEmailSendLabel: rule((n: number) => massEmailSendLabel(n), [[42], [1], [0], [-1]]),
  massEmailConfirm: rule(
    (n: number, subject: string, shop: string) => massEmailConfirm(n, subject, shop),
    [
      [42, " Fall opening ", "Demo Leak Co."],
      [1, "Holiday hours", "Blue Water Pools"],
    ],
  ),
  massEmailSentText: rule(
    (sent: number, failed: number) => massEmailSentText(sent, failed),
    [
      [42, 0],
      [40, 2],
      [1, 0],
      [0, 3],
    ],
  ),
  massEmailHistoryText: rule(
    (status: string, sent: number, failed: number, recipients: number) =>
      massEmailHistoryText({
        status,
        sent_count: sent,
        failed_count: failed,
        recipient_count: recipients,
      }),
    [
      ["sent", 40, 2, 42],
      ["sent", 40, 0, 40],
      ["sending", 0, 0, 42],
      ["failed", 0, 3, 3],
    ],
  ),
  massEmailLimitText: rule((left: number) => massEmailLimitText(left), [[258], [1], [0]]),
  massEmailErrors: rule(
    (subject: string, body: string) => massEmailErrors(subject, body),
    [
      ["", ""],
      ["  ", "Hi"],
      ["Hi", "Hello"],
      ["x".repeat(151), "Hello"],
      ["Hi", "y".repeat(10_001)],
    ],
  ),
};
