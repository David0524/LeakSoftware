import { LINK_PREVIEW_TEXT, type LinkPreviewCard } from "@leakbook/core";
import { tokens } from "@leakbook/tokens";

/**
 * The 1200×630 link-preview card for a quote, invoice or report (owner, 2026-10-24: "calm and
 * trustworthy, like an Apple receipt, not like an ad"), drawn by next/og (Satori: flexbox and
 * inline styles only). Centered, so Messages' and Mail's crops never cut it: the shop's logo or
 * its name, what the document is, the key detail, and a quiet "Sent with Sundeck Pro".
 */

export const CARD_SIZE = { width: 1200, height: 630 } as const;

const C = tokens.color;
const INK = C.role.light.text;
const MUTED = C.role.light.textMuted;
const QUIET = C.neutral["500"];
/** A white card framed in light pool blue (owner, 2026-10-24: "The white looks super plain";
 * "White on blue is definitely better"). The card stays white, so a logo saved on a white
 * background (most JPEGs) sits on it cleanly. */
const FRAME = C.role.light.diagramWater;
const CARD = C.brand.paper;
const DISPLAY = "Barlow Semi Condensed";
const BODY = "Public Sans";

export interface CardLogo {
  src: string;
  width: number;
  height: number;
}

/** Fits a logo inside the logo area, keeping its shape. */
export function fitLogo(width: number, height: number, maxW = 600, maxH = 128) {
  const scale = Math.min(maxW / width, maxH / height);
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

export function LinkPreviewArt({
  card,
  logo,
  mark,
}: {
  card: LinkPreviewCard;
  logo: CardLogo | null;
  /** The Sundeck Pro mark (an SVG data URI) for the footer line. */
  mark: string | null;
}) {
  const neutral = card.tone === "neutral";
  const longName = card.shop.length > 28;
  return (
    <div
      style={{
        width: CARD_SIZE.width,
        height: CARD_SIZE.height,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        backgroundColor: FRAME,
        color: INK,
        fontFamily: BODY,
        padding: 34,
      }}
    >
      <div
        style={{
          flex: 1,
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          borderRadius: 40,
          backgroundColor: CARD,
        }}
      >
        <div
          style={{
            flex: 1,
            width: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "30px 80px 0",
          }}
        >
          {logo && !neutral ? (
            // eslint-disable-next-line @next/next/no-img-element -- drawn by next/og, not a page
            <img
              src={logo.src}
              width={logo.width}
              height={logo.height}
              alt=""
              style={{ width: logo.width, height: logo.height }}
            />
          ) : (
            <div
              style={{
                display: "block",
                maxWidth: 1000,
                textAlign: "center",
                fontFamily: DISPLAY,
                fontWeight: 800,
                fontSize: neutral ? 76 : longName ? 64 : 80,
                lineHeight: 1.05,
                lineClamp: 2,
                color: INK,
              }}
            >
              {card.shop}
            </div>
          )}

          {neutral ? (
            <div
              style={{
                display: "flex",
                marginTop: 28,
                fontSize: 46,
                fontWeight: 500,
                color: MUTED,
                textAlign: "center",
              }}
            >
              {card.headline}
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                marginTop: 30,
                maxWidth: 1040,
              }}
            >
              <div style={{ display: "flex", fontSize: 46, fontWeight: 600, color: MUTED }}>
                {card.docType}
              </div>
              <div
                style={{
                  display: "block",
                  marginTop: card.money ? -2 : 6,
                  textAlign: "center",
                  fontFamily: DISPLAY,
                  fontWeight: 700,
                  fontSize: card.money ? 148 : card.headline.length > 24 ? 70 : 92,
                  lineHeight: card.money ? 1.05 : 1.05,
                  lineClamp: 2,
                  color: INK,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {card.headline}
              </div>
              {card.caption ? (
                <div
                  style={{
                    display: "block",
                    marginTop: card.money ? 2 : 10,
                    textAlign: "center",
                    fontSize: 44,
                    fontWeight: 500,
                    color: MUTED,
                    lineClamp: 1,
                  }}
                >
                  {card.caption}
                </div>
              ) : null}
            </div>
          )}
        </div>

        <div
          style={{
            width: 980,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            marginBottom: 26,
            paddingTop: 18,
            borderTop: `2px solid ${C.neutral["100"]}`,
            fontSize: 30,
            fontWeight: 500,
            color: QUIET,
          }}
        >
          {mark ? (
            // eslint-disable-next-line @next/next/no-img-element -- drawn by next/og, not a page
            <img src={mark} width={22} height={32} alt="" style={{ width: 22, height: 32 }} />
          ) : null}
          <div style={{ display: "flex" }}>{LINK_PREVIEW_TEXT.sentWith}</div>
        </div>
      </div>
    </div>
  );
}
