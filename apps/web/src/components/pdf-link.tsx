/** Download PDF, on a document's color band: an outlined pill in the band's text color. */
export function PdfLink({ href, className }: { href: string; className: string }) {
  return (
    <a
      href={href}
      className={`${className} min-h-11 shrink-0 items-center rounded-full border-2 border-current px-4 font-display font-bold whitespace-nowrap print:hidden`}
    >
      Download PDF
    </a>
  );
}
