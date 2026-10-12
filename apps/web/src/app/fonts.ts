import localFont from "next/font/local";

// Brand fonts are bundled from brand/fonts (no runtime Google Fonts dependency).
export const display = localFont({
  src: [
    { path: "../../../../brand/fonts/BarlowSemiCondensed-SemiBold.ttf", weight: "600" },
    { path: "../../../../brand/fonts/BarlowSemiCondensed-Bold.ttf", weight: "700" },
    { path: "../../../../brand/fonts/BarlowSemiCondensed-ExtraBold.ttf", weight: "800" },
  ],
  variable: "--lb-font-display-face",
  display: "swap",
});

export const body = localFont({
  src: "../../../../brand/fonts/PublicSans[wght].ttf",
  weight: "100 900",
  variable: "--lb-font-body-face",
  display: "swap",
});
