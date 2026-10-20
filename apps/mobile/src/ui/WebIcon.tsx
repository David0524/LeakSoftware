import { useId } from "react";
import Svg, { Circle, Defs, Mask, Path, Rect } from "react-native-svg";

// The website's own line icons (apps/web/src/components/icons.tsx and nav-links.tsx), drawn
// with the same paths on a 24 x 24 artboard, 1.8 stroke, round caps and joins, so the app
// matches the website exactly on every platform (spec 3.2, 3.10).

interface Shape {
  /** The outline. */
  line: string;
  /** Extra outline circles (cx, cy, r). */
  circles?: [number, number, number][];
  /** Dots drawn with a heavier stroke (More's three dots). */
  dots?: { d: string; width: number };
  /** Selected tab: a solid shape with its details cut out of it. */
  shape?: string;
  cut?: string;
  cutWidth?: number;
  /** Lines drawn on top of the solid shape as they are. */
  extra?: string;
}

const SHAPES = {
  today: {
    line: "M12 21s-7-6.1-7-11.5a7 7 0 0 1 14 0C19 14.9 12 21 12 21zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
    shape: "M12 21s-7-6.1-7-11.5a7 7 0 0 1 14 0C19 14.9 12 21 12 21z",
    cut: "M12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  },
  jobs: {
    line: "M9 4h6M8 4H6a1 1 0 0 0-1 1v15a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1h-2M9 11h6M9 15h4",
    shape: "M6 4h12a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z",
    cut: "M9 11h6M9 15h4",
  },
  schedule: {
    line: "M7 3v3M17 3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM8 12h3M8 16h3M13 12h3",
    shape: "M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z",
    cut: "M4 8.5h16M8 12h3M8 16h3M13 12h3",
    extra: "M7 3v3M17 3v3",
  },
  messages: {
    line: "M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-5 4V6a1 1 0 0 1 1-1z",
    shape: "M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-5 4V6a1 1 0 0 1 1-1z",
    cut: "M8 11h.01M12 11h.01M16 11h.01",
    cutWidth: 2.6,
  },
  more: {
    line: "",
    circles: [[12, 12, 9]],
    dots: { d: "M8 12h.01M12 12h.01M16 12h.01", width: 2.6 },
    shape: "M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18z",
    cut: "M8 12h.01M12 12h.01M16 12h.01",
    cutWidth: 2.8,
  },
  phone: {
    line: "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1z",
  },
  // The photo library: a picture with a hill and the sun (Library, owner 2026-10-20).
  photos: {
    line: "M5 5h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM4 16l5-5 4 4 2-2 5 5",
    circles: [[15.5, 9.5, 1.5]],
  },
  message: { line: "M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-5 4V6a1 1 0 0 1 1-1z" },
  mail: {
    line: "M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zm-1 2 8 6 8-6",
  },
  camera: {
    line: "M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z",
    circles: [[12, 13, 3.5]],
  },
  // The Photos section's capture tiles (apps/web/src/components/media-work.tsx).
  cameraTile: {
    line: "M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  },
  video: {
    line: "M3 7h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1zM16 11l6-3v8l-6-3",
  },
  mic: { line: "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3" },
  share: { line: "M12 3v12M8 7l4-4 4 4M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7" },
  updown: { line: "M8 9l4-4 4 4M8 15l4 4 4-4" },
  plus: { line: "M12 5v14M5 12h14" },
  compose: { line: "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" },
  back: { line: "M15 4l-8 8 8 8" },
  forward: { line: "M9 4l8 8-8 8" },
  chevronRight: { line: "M9 6l6 6-6 6" },
  chevronDown: { line: "M6 9l6 6 6-6" },
  search: { line: "M20 20l-4.3-4.3", circles: [[11, 11, 6.5]] },
  close: { line: "M6 6l12 12M18 6L6 18" },
  // A done stop on Today (the website's TodayStop check).
  check: { line: "M5 12.5l4.5 4.5L19 7.5" },
  lightbulb: {
    line: "M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z",
  },
  pin: {
    line: "M12 21s-7-6.1-7-11.5a7 7 0 0 1 14 0C19 14.9 12 21 12 21zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  },
  calendar: {
    line: "M7 3v3M17 3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z",
  },
  // Regular cleanings (owner, 2026-10-19), the website's CleaningIcon: a pleated cartridge
  // filter, a salt cell (a tube with a spark), and a repeat arrow for any other cleaning.
  filter: {
    line: "M9 3h6a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3zM10 7v10M14 7v10",
  },
  // A new cartridge: the filter with an arrow going in (replacing the filter).
  newFilter: {
    line: "M11.5 6h5a2.5 2.5 0 0 1 2.5 2.5v10a2.5 2.5 0 0 1-2.5 2.5h-5A2.5 2.5 0 0 1 9 18.5v-10A2.5 2.5 0 0 1 11.5 6zM12.5 10v7M15.5 10v7M3 4h6M6 1v6",
  },
  saltCell: {
    line: "M6.5 8h11a4 4 0 0 1 0 8h-11a4 4 0 0 1 0-8zM13 9.5l-2.5 3h3L11 15",
  },
  repeat: {
    line: "M20 11a8 8 0 0 0-14.5-4.5M4 13a8 8 0 0 0 14.5 4.5M5 3v4h4M19 21v-4h-4",
  },
  // The website's KeyIcon: how to get in (a pool's access notes).
  key: { line: "M11 12l8-8M16 7l2 2M14 9l2 2", circles: [[8, 15, 4]] },
  // A note (Today's card's customer notes, the website's NoteIcon).
  note: {
    line: "M5 4h14a1 1 0 0 1 1 1v10l-5 5H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM15 20v-5h5M8 9h8M8 13h5",
  },
  // Directions (Today's card, the website's today-hero.tsx): a navigation arrow.
  directions: { line: "M3 11l18-8-8 18-2-8z" },
  // The website's not-on-map warning (not-on-map.tsx).
  warning: { line: "M12 3l9.5 17h-19zM12 10v4.5M12 17.5v.01" },
} satisfies Record<string, Shape>;

export type WebIconName = keyof typeof SHAPES;

/**
 * One of the website's icons. `filled` draws a tab's selected (solid) version. Decorative:
 * the control around it carries the accessibility label.
 */
export function WebIcon({
  name,
  size = 24,
  color,
  filled = false,
  strokeWidth = 1.8,
}: {
  name: WebIconName;
  size?: number;
  color: string;
  filled?: boolean;
  strokeWidth?: number;
}) {
  const s: Shape = SHAPES[name];
  const maskId = `cut-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const solid = filled && s.shape;
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {solid ? (
        <>
          {s.cut ? (
            <Defs>
              <Mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
                <Rect width="24" height="24" fill="white" stroke="none" />
                <Path d={s.cut} stroke="black" strokeWidth={s.cutWidth ?? 2} />
              </Mask>
            </Defs>
          ) : null}
          <Path
            d={s.shape}
            fill={color}
            stroke={color}
            mask={s.cut ? `url(#${maskId})` : undefined}
          />
          {s.extra ? <Path d={s.extra} /> : null}
        </>
      ) : (
        <>
          {s.line ? <Path d={s.line} /> : null}
          {s.circles?.map(([cx, cy, r]) => (
            <Circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} />
          ))}
          {s.dots ? <Path d={s.dots.d} strokeWidth={s.dots.width} /> : null}
        </>
      )}
    </Svg>
  );
}
