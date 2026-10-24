import { customerLinkToken, splitShareMessage } from "@leakbook/core";
import { rule, type ModuleCases } from "../case";

const T = "0123456789abcdef0123456789abcdef";

// link-preview.ts: the share sheet hands Messages the link as a link, beside the words
// (owner, 2026-10-24: link previews for quotes, invoices and reports).
export const linkShare: ModuleCases = {
  splitShareMessage: rule(
    (message: string) => splitShareMessage(message),
    [
      [`Bluefin Pool Co.: your invoice. View and pay it here: https://sundeckpro.com/i/${T}`],
      [
        `Bluefin Pool Co.: your repair quote. Review and accept it here: https://sundeckpro.com/q/${T}`,
      ],
      [`Bluefin Pool Co.: your leak detection report: https://sundeckpro.com/r/${T}  `],
      [`https://sundeckpro.com/r/${T}`],
      [`  http://localhost:3000/r/${T}\n`],
      ["Bluefin Pool Co.: on our way, about 10 minutes out."],
      ["See https://sundeckpro.com/r/x for details."],
      [""],
    ],
  ),
  customerLinkToken: rule(
    (url: string) => customerLinkToken(url),
    [
      [`https://sundeckpro.com/q/${T}`],
      [`https://sundeckpro.com/i/${T}/pdf`],
      [`http://localhost:3000/r/${T}?print=1`],
      [`https://sundeckpro.com/invite/${T}`],
      ["https://sundeckpro.com/r/short"],
      [""],
    ],
  ),
};
