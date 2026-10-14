/**
 * Download PDF, on a document's color band: a tinted pill in the band's text color, like an
 * iOS button. Screen only: the printed page (the PDF itself) never draws it.
 */
export function PdfLink({ href, className }: { href: string; className: string }) {
  return (
    <a
      href={href}
      className={`${className} min-h-11 shrink-0 items-center rounded-full bg-current/15 px-4 text-[0.9375rem] font-semibold whitespace-nowrap print:hidden`}
    >
      Download PDF
    </a>
  );
}
