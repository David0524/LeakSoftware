/** The LeakBook wordmark, switching to the reverse version on dark backgrounds. */
export function Logo({ height = 36, onDark = false }: { height?: number; onDark?: boolean }) {
  const width = Math.round((height * 360) / 102);
  if (onDark) {
    // eslint-disable-next-line @next/next/no-img-element -- static SVG, no optimization needed
    return <img src="/leakbook-logo-reverse.svg" alt="LeakBook" width={width} height={height} />;
  }
  return (
    <picture>
      <source srcSet="/leakbook-logo-reverse.svg" media="(prefers-color-scheme: dark)" />
      {}
      <img src="/leakbook-logo.svg" alt="LeakBook" width={width} height={height} />
    </picture>
  );
}
