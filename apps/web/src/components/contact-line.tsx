/**
 * "Phone · email" on a document header. When it wraps, the dot stays with the phone number
 * and the email starts the next line. Both are links (tap to call or write), drawn exactly as
 * plain text so the printed PDF looks the same.
 */
export function ContactLine({ phone, email }: { phone?: string | null; email?: string | null }) {
  if (!phone && !email) return null;
  return (
    <>
      {phone ? (
        <span className="whitespace-nowrap">
          <a href={`tel:${phone.replace(/[^\d+]/g, "")}`}>{phone}</a>
          {email ? " ·" : ""}
        </span>
      ) : null}
      {phone && email ? " " : null}
      {email ? (
        <a href={`mailto:${email}`} className="break-words">
          {email}
        </a>
      ) : null}
    </>
  );
}
