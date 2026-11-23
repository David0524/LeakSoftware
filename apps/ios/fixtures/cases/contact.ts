import {
  CONTACT_SWITCH_FOOTER,
  CONTACT_SWITCH_LABEL,
  NO_CONTACT_MESSAGE,
  NO_CONTACT_NOTE,
  ON_FILE_NOTE,
  ON_FILE_SENT,
  canContactCustomers,
  teamRoleLine,
} from "@leakbook/core";
import { rule, type ModuleCases } from "../case";

// contact.ts: Text and Call Customers, per person (owner, 2026-11-23).

const people: [string | null, boolean | null][] = [
  ["owner", false],
  ["admin", false],
  ["tech", true],
  ["tech", false],
  ["tech", null],
  [null, false],
];

export const contact: ModuleCases = {
  canContactCustomers: rule(
    (role: string | null, allowed: boolean | null) => canContactCustomers(role, allowed),
    people,
  ),
  teamRoleLine: rule(
    (role: string | null, allowed: boolean | null) => teamRoleLine(role, allowed),
    people,
  ),
  words: rule(
    () => ({
      CONTACT_SWITCH_LABEL,
      CONTACT_SWITCH_FOOTER,
      NO_CONTACT_NOTE,
      NO_CONTACT_MESSAGE,
      ON_FILE_NOTE,
      ON_FILE_SENT,
    }),
    [[]],
  ),
};
