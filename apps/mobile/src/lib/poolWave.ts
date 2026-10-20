// The water in Getting Ready's pool (gestures spec section 11): an SVG path filled from the
// bottom to the level, with a slow wave on its surface. A worklet, so the UI thread draws each
// frame; pure, so it's tested without a phone.

/** How tall the wave is, in points. */
export const WAVE_HEIGHT = 4;
/** Points across the surface. */
const STEPS = 24;

/**
 * The water's path in a `width` by `height` box: `level` 0..1 from the bottom, `phase` 0..1
 * along the wave's loop, `amplitude` 0..1 (0 is a flat surface, for Reduce Motion). Full water
 * still waves, under the pool's rounded top; empty water is nothing.
 */
export function waterPath(
  width: number,
  height: number,
  level: number,
  phase: number,
  amplitude = 1,
): string {
  "worklet";
  const l = Math.min(1, Math.max(0, level));
  if (l <= 0) return "";
  const top = height * (1 - l);
  const a = WAVE_HEIGHT * Math.min(1, Math.max(0, amplitude));
  let d = `M0 ${height} L0 ${(top + a * Math.sin(phase * 2 * Math.PI)).toFixed(2)}`;
  for (let i = 1; i <= STEPS; i++) {
    const x = (width * i) / STEPS;
    const y = top + a * Math.sin((i / STEPS) * 2 * Math.PI + phase * 2 * Math.PI);
    d += ` L${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  return `${d} L${width} ${height} Z`;
}
