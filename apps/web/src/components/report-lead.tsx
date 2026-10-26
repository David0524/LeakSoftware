import { PHONE_CARD } from "./doc-ui";
import { cx } from "./ui";

/**
 * What a customer's report opens with, under the shop's header band (owner, 2026-10-26: "the
 * customer report as the peak moment"): the finished-pool photo when there is one, one plain line
 * saying how the visit went (core report-summary.ts, worked out from the sent snapshot), and who
 * did the work ("Serviced by Jake"). No phone number or email here: the band has the shop's.
 */
export function ReportLead({
  headline,
  byLine,
  photo,
  testId = "report-lead",
}: {
  headline: string;
  byLine: string | null;
  photo: { url: string; alt: string } | null;
  testId?: string;
}) {
  return (
    <section
      className={cx("report-block mt-6 max-sm:mt-4 print:mt-4", PHONE_CARD)}
      aria-label="Summary"
      data-testid={testId}
    >
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element -- signed storage URL
        <img
          src={photo.url}
          alt={photo.alt}
          className="mb-4 aspect-[4/3] max-h-80 w-full rounded-xl object-cover sm:aspect-[16/9] print:max-h-64"
          data-testid="report-lead-photo"
        />
      ) : null}
      <p className="font-display text-[1.625rem] leading-tight font-bold">{headline}</p>
      {byLine ? <p className="mt-1 text-[1.0625rem] text-text-muted">{byLine}</p> : null}
    </section>
  );
}
