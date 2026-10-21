import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";
import { tokens } from "@leakbook/tokens";

export const brand = tokens.color.brand;
export const neutral = tokens.color.neutral;
export const status = tokens.color.status;

export const display = "Barlow Semi Condensed";
export const text = "Public Sans";

loadFont({
  family: display,
  url: staticFile("generated/BarlowSemiCondensed-ExtraBold.ttf"),
  weight: "800",
});
loadFont({
  family: text,
  url: staticFile("generated/PublicSans-Variable.ttf"),
  weight: "100 900",
});
