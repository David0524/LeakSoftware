import { Appearance, Platform, type TextStyle, type ViewStyle } from "react-native";
import * as SecureStore from "expo-secure-store";
import { tokens } from "@leakbook/tokens";
import type { InvoiceStatus, JobStatus, QuoteStatus } from "@leakbook/core";

// The app's look follows the phone website on both platforms (owner, 2026-10-19; design spec
// docs/design/2026-10-19-native-apps-follow-web.md, section 2). Every color comes from
// brand/tokens.json through @leakbook/tokens; nothing here types a hex value.

/** iPhone: native large titles, SF Symbols and the system font. */
export const ios = Platform.OS === "ios";

/**
 * Android and the browser preview draw the website's bars themselves (spec 3.1, 8.2):
 * the custom header with the large title in the page.
 */
export const drawnChrome = !ios;

// ---------------------------------------------------------------------------
// Appearance: Light by default, whatever the phone's setting; Dark when chosen in
// More › On This Device (spec 2.2). Kept in the keychain store so it can be read before the
// first screen draws.
// ---------------------------------------------------------------------------

export type Scheme = "light" | "dark";
const APPEARANCE_KEY = "appearance.v1";

function storedScheme(): Scheme {
  try {
    return SecureStore.getItem(APPEARANCE_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

/**
 * A token color at an opacity, for tints and fills. Takes a #RRGGBB or #RRGGBBAA token; an
 * existing alpha is multiplied.
 */
export function tint(hex: string, opacity: number): string {
  const base = hex.length >= 9 ? Number.parseInt(hex.slice(7, 9), 16) / 255 : 1;
  const a = Math.round(Math.min(1, Math.max(0, opacity * base)) * 255)
    .toString(16)
    .padStart(2, "0");
  return `${hex.slice(0, 7)}${a}`;
}

/** rgba() of a #RRGGBB token, for shadows written as CSS (boxShadow). */
function rgba(hex: string, opacity: number): string {
  const n = (i: number) => Number.parseInt(hex.slice(i, i + 2), 16);
  return `rgba(${n(1)}, ${n(3)}, ${n(5)}, ${opacity})`;
}

function palette(scheme: Scheme) {
  const dark = scheme === "dark";
  const role = dark ? tokens.color.role.dark : tokens.color.role.light;
  // Light mode's status colors are the brand's fixed ones; dark mode has its own (role.dark).
  const status = dark
    ? {
        pass: tokens.color.role.dark.pass,
        fail: tokens.color.role.dark.fail,
        warning: tokens.color.role.dark.warning,
        excluded: tokens.color.role.dark.excluded,
        info: tokens.color.role.dark.info,
      }
    : tokens.color.status;
  return {
    bg: role.bg,
    surface: role.surface,
    text: role.text,
    textMuted: role.textMuted,
    border: role.border,
    header: role.header,
    onHeader: role.onHeader,
    primary: role.primary,
    onPrimary: role.onPrimary,
    link: role.link,
    focus: role.focus,
    diagramWater: role.diagramWater,
    onStatus: role.onStatus,
    controlBorder: role.controlBorder,
    chart: role.chart,
    fill: role.fill,
    separator: role.separator,
    placeholder: role.placeholder,
    thumb: role.thumb,
    ...status,
    // Brand colors used directly (pool outline, logo dot, app icon, video letterbox).
    navy: tokens.color.brand.navy,
    water: tokens.color.brand.water,
    safety: tokens.color.brand.safety,
    paper: tokens.color.brand.paper,
    // Kept for screens not restyled yet; new code uses the roles and tints.
    neutral100: dark ? tint(role.text, 0.08) : tokens.color.neutral["100"],
    neutral200: dark ? tint(role.text, 0.12) : tokens.color.neutral["200"],
    // Tints (spec 2.2): a token at an opacity over whatever is behind.
    tinted: tint(role.link, 0.12),
    tintedPressed: tint(role.link, 0.24),
    iconTint: tint(role.link, 0.1),
    dangerTint: tint(status.fail, 0.12),
    dangerPressed: tint(status.fail, 0.24),
    rowPressed: tint(role.text, 0.06),
    well: tint(role.text, 0.04),
    emptyFill: tint(role.text, 0.04),
    accessFill: tint(status.warning, 0.1),
    ripple: tint(role.text, 0.1),
    grabber: tint(role.text, 0.25),
    scrim: tint(tokens.color.neutral["900"], 0.4),
    /** Glass: surface at 72% (blurred) or 96% (no blur), with a 1 pt border of text at 10%. */
    glass: tint(role.surface, 0.72),
    glassSolid: tint(role.surface, 0.96),
    glassBorder: tint(role.text, 0.1),
    /** Navigation bar material: bg at 88%. */
    bar: tint(role.bg, 0.88),
    barSolid: tint(role.bg, 0.97),
  };
}

export type Palette = ReturnType<typeof palette>;

let scheme: Scheme = storedScheme();

/**
 * The current colors by role. Read it while rendering (not in StyleSheet.create at module
 * load) so a change of Appearance redraws in the new colors; values baked into a stylesheet
 * only change at the next launch.
 */
export const color: Palette = palette(scheme);

if (!ios || scheme === "dark") {
  // Native controls (switches, pickers, the keyboard) follow the chosen appearance.
  try {
    Appearance.setColorScheme?.(scheme);
  } catch {
    // Not supported in this environment (the browser preview).
  }
}

const listeners = new Set<() => void>();

export const appearance = {
  get scheme(): Scheme {
    return scheme;
  },
  set(next: Scheme) {
    if (next === scheme) return;
    scheme = next;
    try {
      SecureStore.setItem(APPEARANCE_KEY, next);
    } catch {
      // Remembered for this run only.
    }
    Object.assign(color, palette(next));
    try {
      Appearance.setColorScheme?.(next);
    } catch {
      // Not supported in this environment.
    }
    for (const l of listeners) l();
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
};

/** Photo markup colors (brand/tokens.json color.markup). */
export const markupColor = tokens.color.markup;

// ---------------------------------------------------------------------------
// Type (spec 2.1)
// ---------------------------------------------------------------------------

/** Font family names registered in src/app/_layout.tsx. */
export const font = {
  displaySemiBold: "Barlow-SemiBold",
  displayBold: "Barlow-Bold",
  displayExtraBold: "Barlow-ExtraBold",
  body: "PublicSans-Regular",
  bodyMedium: "PublicSans-Medium",
  bodySemiBold: "PublicSans-SemiBold",
  bodyBold: "PublicSans-Bold",
} as const;

/**
 * The body face: the system font (San Francisco) on iPhone, Public Sans on Android and in the
 * browser preview, as the website does. Spread into a style: `{ ...face.semiBold, fontSize: 15 }`.
 */
export const face: Record<"regular" | "medium" | "semiBold" | "bold", TextStyle> = ios
  ? {
      regular: { fontFamily: "System", fontWeight: "400" },
      medium: { fontFamily: "System", fontWeight: "500" },
      semiBold: { fontFamily: "System", fontWeight: "600" },
      bold: { fontFamily: "System", fontWeight: "700" },
    }
  : {
      regular: { fontFamily: font.body },
      medium: { fontFamily: font.bodyMedium },
      semiBold: { fontFamily: font.bodySemiBold },
      bold: { fontFamily: font.bodyBold },
    };

/** The phone type scale (spec 2.1). Colors are applied when drawn (see `T`). */
export const type = {
  largeTitle: { fontFamily: font.displayExtraBold, fontSize: 34, lineHeight: 42 },
  sectionHeading: { fontFamily: font.displayBold, fontSize: 24, lineHeight: 32 },
  cardTitle: { fontFamily: font.displayBold, fontSize: 20, lineHeight: 28 },
  subHeading: { fontFamily: font.displayBold, fontSize: 18, lineHeight: 28 },
  /** Over a grouped list: uppercase by style, sentence case in the copy. */
  sectionLabel: {
    fontFamily: font.displaySemiBold,
    fontSize: 13,
    lineHeight: 18,
    textTransform: "uppercase",
  },
  navTitle: { ...face.semiBold, fontSize: 17, lineHeight: 22 },
  body: { ...face.regular, fontSize: 17, lineHeight: 25.5 },
  bodyEmphasis: { ...face.semiBold, fontSize: 17, lineHeight: 25.5 },
  bodyMedium: { ...face.medium, fontSize: 17, lineHeight: 25.5 },
  secondary: { ...face.regular, fontSize: 15, lineHeight: 22.5 },
  footnote: { ...face.regular, fontSize: 13, lineHeight: 18 },
  tabLabel: { ...face.medium, fontSize: 11, lineHeight: 13 },
  segment: { ...face.medium, fontSize: 15, lineHeight: 20 },
} satisfies Record<string, TextStyle>;

/** Text follows the phone's text size up to 2.4x (M11 decision). */
export const MAX_TEXT_SCALE = 2.4;

/** Numbers that line up or change (money, readings, counts). */
export const tabular: TextStyle = { fontVariant: ["tabular-nums"] };

// ---------------------------------------------------------------------------
// Shape, spacing, targets (spec 2.3, 2.4, 2.6)
// ---------------------------------------------------------------------------

export const space = tokens.space;
export const radius = tokens.radius;

/** Corner radii by use (spec 2.3). */
export const shape = {
  field: tokens.radius.lg,
  grouped: 12,
  actionSheet: 14,
  block: 16,
  card: tokens.radius.xl,
  sheet: tokens.radius.xl,
  bubble: tokens.radius.xl,
  composer: 22,
  segmentTrack: 24,
  tabBar: 28,
  pill: tokens.radius.pill,
} as const;

/** Page margins left and right. */
export const gutter = space["4"];
/** Room under the last row of a tab screen so it clears the floating tab bar. */
export const TAB_BAR_CLEARANCE = 128;

/** Every tappable thing (house rule). */
export const minTap = 44;
/** The brand's field target (gloves, wet hands) where there is room. */
export const touch = tokens.touch.minTarget;

// ---------------------------------------------------------------------------
// Elevation (spec 2.5)
// ---------------------------------------------------------------------------

/** A card's two soft navy shadows, light mode only. Read while rendering. */
export function cardShadow(): ViewStyle {
  if (scheme === "dark") return {};
  const navy = tokens.color.brand.navy;
  return {
    boxShadow: `0px 1px 2px ${rgba(navy, 0.06)}, 0px 6px 20px ${rgba(navy, 0.05)}`,
  };
}

/** The floating glass layer's shadow (tab bar, action sheets). */
export function glassShadow(): ViewStyle {
  const dark = scheme === "dark";
  const shade = dark ? tokens.color.role.dark.bg : tokens.color.brand.navy;
  const white = tokens.color.role.light.onPrimary;
  return {
    boxShadow: `0px 8px 28px ${rgba(shade, dark ? 0.45 : 0.14)}, inset 0px 1px 0px ${rgba(white, dark ? 0.08 : 0.55)}`,
  };
}

/** The raised thumb of a segmented control. */
export function thumbShadow(): ViewStyle {
  const shade = tokens.color.role.dark.bg;
  return { boxShadow: `0px 3px 8px ${rgba(shade, 0.12)}, 0px 3px 1px ${rgba(shade, 0.04)}` };
}

// ---------------------------------------------------------------------------
// Status colors
// ---------------------------------------------------------------------------

/** Job status chip fills (spec 3.6). Read while rendering: they follow Appearance. */
export function jobStatusColor(status: JobStatus): string {
  switch (status) {
    case "unscheduled":
    case "canceled":
      return color.excluded;
    case "scheduled":
      return color.text;
    case "in_progress":
    case "report_sent":
    case "quote_sent":
      return color.info;
    case "quote_accepted":
    case "invoiced":
      return color.warning;
    case "paid":
    case "done":
      return color.pass;
  }
}

/** @deprecated Read `jobStatusColor(status)` while rendering. */
export const JOB_STATUS_COLOR: Record<JobStatus, string> = {
  unscheduled: tokens.color.status.excluded,
  scheduled: tokens.color.role.light.text,
  in_progress: tokens.color.status.info,
  report_sent: tokens.color.status.info,
  quote_sent: tokens.color.status.info,
  quote_accepted: tokens.color.status.warning,
  invoiced: tokens.color.status.warning,
  paid: tokens.color.status.pass,
  canceled: tokens.color.status.excluded,
  done: tokens.color.status.pass,
};

/** Status pills on the Quote tab. */
export const QUOTE_STATUS_COLOR: Record<QuoteStatus, string> = {
  draft: tokens.color.status.excluded,
  sent: tokens.color.status.info,
  accepted: tokens.color.status.pass,
  declined: tokens.color.status.fail,
  expired: tokens.color.status.excluded,
};

/** Status pills on the invoice. */
export const INVOICE_STATUS_COLOR: Record<InvoiceStatus, string> = {
  draft: tokens.color.status.excluded,
  sent: tokens.color.status.info,
  partially_paid: tokens.color.status.warning,
  paid: tokens.color.status.pass,
  void: tokens.color.status.excluded,
};

/**
 * Navigation bar colors: the light bar over the grouped gray page with link-colored buttons,
 * on both platforms (the navy Android bar is gone, spec decision 2).
 */
export const header = {
  get background() {
    return color.bg;
  },
  get tint() {
    return color.link;
  },
  get title() {
    return color.text;
  },
};
