import { REFER_COPY, referShareMessage, referralLink, showsReferRow } from "@leakbook/core";
import { rule, type ModuleCases } from "../case";

// refer.ts: Refer a Pool Company on More, owners only (owner, 2026-11-23).
export const refer: ModuleCases = {
  REFER_COPY: rule(() => REFER_COPY, [[]]),
  referralLink: rule(
    (webUrl: string | null, code: string | null) => referralLink(webUrl, code),
    [
      ["https://sundeckpro.com", "BLUEWAVEPOOLS"],
      ["https://sundeckpro.com/", " bluewave-pools2 "],
      ["http://localhost:3000", "Cole's Pool Cleaning"],
      ["https://sundeckpro.com", ""],
      ["https://sundeckpro.com", null],
      ["", "BLUEWAVEPOOLS"],
      [null, "BLUEWAVEPOOLS"],
    ],
  ),
  referShareMessage: rule(
    (link: string) => referShareMessage(link),
    [["https://sundeckpro.com/sign-up?code=BLUEWAVEPOOLS"]],
  ),
  showsReferRow: rule(
    (role: string | null, code: string | null) => showsReferRow(role, code),
    [
      ["owner", "BLUEWAVEPOOLS"],
      ["admin", "BLUEWAVEPOOLS"],
      ["tech", "BLUEWAVEPOOLS"],
      ["owner", null],
      ["owner", " - "],
      [null, "BLUEWAVEPOOLS"],
    ],
  ),
};
