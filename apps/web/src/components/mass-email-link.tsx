import Link from "next/link";
import { MASS_EMAIL_TITLE } from "@leakbook/core";
import { MailIcon } from "./icons";
import { ButtonLink } from "./ui";

// Customers' Email Customers action (owner, 2026-10-22), for owners and admins: a pill by the
// title on wider screens, an envelope in the navigation bar on phones (as the apps have it).

export const EMAIL_CUSTOMERS_HREF = "/customers/email";

/** Wider screens: the pill by the title. */
export function EmailCustomersButton() {
  return (
    <ButtonLink href={EMAIL_CUSTOMERS_HREF} kind="secondary">
      <MailIcon className="size-5" />
      {MASS_EMAIL_TITLE}
    </ButtonLink>
  );
}

/** Phones: the envelope at the right of the navigation bar. */
export function EmailCustomersNav() {
  return (
    <Link
      href={EMAIL_CUSTOMERS_HREF}
      aria-label={MASS_EMAIL_TITLE}
      className="grid size-11 place-items-center rounded-full text-link active:bg-link/10"
    >
      <MailIcon className="size-6" />
    </Link>
  );
}
