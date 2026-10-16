import { MailIcon, MessageIcon, PhoneIcon } from "./icons";
import { iconButtonClass } from "./ui";

/**
 * Call, text, and email as round icon buttons (owner, 2026-10-13: "buttons like phone can
 * just exist as icon"). Each is named for screen readers; wide screens also show the number.
 */
export function ContactButtons({
  name,
  phone,
  email,
  textHref,
}: {
  name: string;
  phone: string | null | undefined;
  email: string | null | undefined;
  /** With a company number, texts go out from it (the Messages inbox), not this device. */
  textHref?: string;
}) {
  if (!phone && !email) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {phone ? (
        <>
          <a
            href={`tel:${phone}`}
            aria-label={`Call ${name}, ${phone}`}
            className={iconButtonClass()}
          >
            <PhoneIcon />
          </a>
          <a
            href={textHref ?? `sms:${phone.replace(/[^\d+]/g, "")}`}
            aria-label={`Text ${name}`}
            className={iconButtonClass()}
          >
            <MessageIcon />
          </a>
        </>
      ) : null}
      {email ? (
        <a
          href={`mailto:${email}`}
          aria-label={`Email ${name}, ${email}`}
          className={iconButtonClass()}
        >
          <MailIcon />
        </a>
      ) : null}
      <span className="min-w-0 truncate pl-1 text-[0.9375rem] text-text-muted">
        {phone ?? email}
      </span>
    </div>
  );
}
