/** The Tidemark wordmark, switching to the reverse version on dark backgrounds. */
export function Logo({ height = 36, onDark = false }: { height?: number; onDark?: boolean }) {
  // The lockup is 505.55 x 146.3 (brand/logo/tidemark-logo.svg).
  const width = Math.round((height * 505.55) / 146.3);
  if (onDark) {
    // eslint-disable-next-line @next/next/no-img-element -- static SVG, no optimization needed
    return <img src="/tidemark-logo-reverse.svg" alt="Tidemark" width={width} height={height} />;
  }
  // Follows the website's appearance setting, not only the device's.
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- static SVG */}
      <img
        src="/tidemark-logo.svg"
        alt="Tidemark"
        width={width}
        height={height}
        className="dark:hidden"
      />
      {/* eslint-disable-next-line @next/next/no-img-element -- static SVG */}
      <img
        src="/tidemark-logo-reverse.svg"
        alt="Tidemark"
        width={width}
        height={height}
        className="hidden dark:block"
      />
    </>
  );
}
