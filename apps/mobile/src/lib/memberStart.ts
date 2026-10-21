import { homeLookupAddress, type MemberStartFields } from "@leakbook/core";

// Where a person's day starts (owner, 2026-10-21; docs/design/2026-10-21-start-from-home.md):
// the setting's form and the row it writes to member_start. Pure, so it's tested without a phone.

export interface StartForm {
  start_from: "shop" | "home";
  home_address: string;
}

/** The longest home address the database keeps (member_start's check). */
export const HOME_ADDRESS_MAX = 400;

/** The form as it opens: the person's row, or the shop with no address. */
export function startForm(row: MemberStartFields | null | undefined): StartForm {
  return {
    start_from: row && !row.deleted_at && row.start_from === "home" ? "home" : "shop",
    home_address: row && !row.deleted_at ? (row.home_address ?? "") : "",
  };
}

export type StartWrite =
  | { error: string }
  | {
      /** The fields to write; empty when nothing changed. */
      values: {
        start_from?: "shop" | "home";
        home_address?: string | null;
        home_latitude?: null;
        home_longitude?: null;
        home_geocoded_address?: null;
      };
      /** A new address to look up on the map once it reaches the server. */
      locate: boolean;
    };

/**
 * What saving the form writes: the changed fields only. A changed address drops its map
 * location in the same write (as the database's trigger does), so a day never starts at an old
 * house; then the address is looked up again. Choosing The Shop keeps the address for later.
 */
export function startWrite(row: MemberStartFields | null | undefined, form: StartForm): StartWrite {
  const address = homeLookupAddress(form.home_address);
  if (address.length > HOME_ADDRESS_MAX)
    return { error: `Enter an address up to ${HOME_ADDRESS_MAX} characters.` };
  const was = startForm(row);
  const values: Extract<StartWrite, { values: unknown }>["values"] = {};
  if (form.start_from !== was.start_from) values.start_from = form.start_from;
  const moved = address !== homeLookupAddress(was.home_address);
  if (moved) {
    values.home_address = address || null;
    values.home_latitude = null;
    values.home_longitude = null;
    values.home_geocoded_address = null;
  }
  return { values, locate: moved && !!address };
}
