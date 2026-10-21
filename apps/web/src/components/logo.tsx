/** The Sundeck Pro wordmark, switching to the reverse version on dark backgrounds. */
export function Logo({ height = 36, onDark = false }: { height?: number; onDark?: boolean }) {
  // The lockup is 623.9 x 146.3 (brand/logo/sundeck-logo.svg).
  const width = Math.round((height * 623.9) / 146.3);
  if (onDark) {
    // eslint-disable-next-line @next/next/no-img-element -- static SVG, no optimization needed
    return <img src="/sundeck-logo-reverse.svg" alt="Sundeck Pro" width={width} height={height} />;
  }
  // Follows the website's appearance setting, not only the device's.
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- static SVG */}
      <img
        src="/sundeck-logo.svg"
        alt="Sundeck Pro"
        width={width}
        height={height}
        className="dark:hidden"
      />
      {/* eslint-disable-next-line @next/next/no-img-element -- static SVG */}
      <img
        src="/sundeck-logo-reverse.svg"
        alt="Sundeck Pro"
        width={width}
        height={height}
        className="hidden dark:block"
      />
    </>
  );
}

/** The drop-pin mark alone, decorative (its link names it), switching to the reverse on dark. */
export function Mark({ height = 32 }: { height?: number }) {
  // The mark is 100 x 146.3 (brand/logo/sundeck-mark.svg).
  const width = Math.round((height * 100) / 146.3);
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- static SVG */}
      <img src="/sundeck-mark.svg" alt="" width={width} height={height} className="dark:hidden" />
      {/* eslint-disable-next-line @next/next/no-img-element -- static SVG */}
      <img
        src="/sundeck-mark-reverse.svg"
        alt=""
        width={width}
        height={height}
        className="hidden dark:block"
      />
    </>
  );
}
