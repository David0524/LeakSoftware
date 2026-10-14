/**
 * "Phone · email" on a document header. When it wraps, the dot stays with the phone number
 * and the email starts the next line.
 */
export function ContactLine({ phone, email }: { phone?: string | null; email?: string | null }) {
  if (!phone && !email) return null;
  return (
    <>
      {phone ? (
        <span className="whitespace-nowrap">
          {phone}
          {email ? " ·" : ""}
        </span>
      ) : null}
      {phone && email ? " " : null}
      {email ? <span className="break-words">{email}</span> : null}
    </>
  );
}
