import { techCardLine, techInitial, type SnapshotTechCard } from "@leakbook/core";
import { techCss } from "./tech-dot";
import { PHONE_CARD } from "./doc-ui";
import { cx } from "./ui";

// A tech's photo (2026-11-26, docs/design/2026-11-26-second-business-and-tech-photos.md): round,
// or their first initial on their team color without one. The name is always beside it, so the
// picture is hidden from screen readers.

export function TechPhoto({
  url,
  name,
  color,
  size = 44,
  className,
}: {
  url: string | null | undefined;
  name: string | null | undefined;
  color: string | null | undefined;
  /** Diameter in px. */
  size?: number;
  className?: string;
}) {
  const style = { width: size, height: size };
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- a signed storage URL
      <img
        src={url}
        alt=""
        aria-hidden="true"
        data-testid="tech-photo"
        className={cx("shrink-0 rounded-full object-cover", className)}
        style={style}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      data-testid="tech-initial"
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white",
        className,
      )}
      style={{ ...style, backgroundColor: techCss(color), fontSize: Math.round(size * 0.42) }}
    >
      {techInitial(name)}
    </span>
  );
}

/**
 * The end of a report, when the shop shows the tech: their photos and "Your pool was serviced
 * by Brian". Nothing without a printable name. `urls` holds the signed photos by storage path.
 */
export function TechCard({
  card,
  jobType,
  urls,
}: {
  card: SnapshotTechCard | null | undefined;
  jobType: string | null | undefined;
  urls: Map<string, string>;
}) {
  const techs = card?.techs ?? [];
  const line = techCardLine(
    jobType,
    techs.map((t) => t.name),
  );
  if (!line) return null;
  return (
    <section
      className={cx(
        "tech-card report-block mt-10 flex flex-col items-center gap-3 text-center break-inside-avoid max-sm:mt-4",
        PHONE_CARD,
      )}
      aria-label="Your tech"
      data-testid="tech-card"
    >
      <div className="flex -space-x-3">
        {techs.map((t, i) => (
          <TechPhoto
            key={i}
            url={t.photo_path ? urls.get(t.photo_path) : null}
            name={t.name}
            color={t.color}
            size={80}
            className="ring-4 ring-paper max-sm:ring-surface"
          />
        ))}
      </div>
      <p className="text-[1.0625rem] font-semibold">{line}</p>
    </section>
  );
}
