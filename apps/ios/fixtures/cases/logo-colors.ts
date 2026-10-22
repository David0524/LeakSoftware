import {
  BRAND_COLOR_PRESETS,
  DEFAULT_BRAND_COLOR,
  brandColorChoices,
  logoPalette,
  suggestedBrandColor,
  textOnBrand,
} from "@leakbook/core";
import { rule, type ModuleCases } from "../case";

// logo-colors.ts: the shop's colors from its logo (owner, 2026-10-22).

type Px = [number, number, number, number];
const img = (...runs: [Px, number][]): number[] =>
  runs.flatMap(([p, n]) => Array.from({ length: n }, () => p).flat());
const WHITE: Px = [255, 255, 255, 255];
const BLACK: Px = [10, 10, 10, 255];
const GRAY: Px = [128, 128, 128, 255];
const CLEAR: Px = [200, 30, 30, 0];
const BLUE: Px = [29, 95, 168, 255];
const ORANGE: Px = [217, 102, 31, 255];
const GREEN: Px = [46, 125, 50, 255];
const PURPLE: Px = [91, 58, 155, 255];
const YELLOW: Px = [230, 200, 20, 255];
/** A gradient of close blues, as an anti-aliased edge makes. */
const shades = Array.from({ length: 12 }, (_, i): [Px, number] => [
  [20 + i * 2, 90 + i, 160 + i, 255],
  3,
]);

export const logoColors: ModuleCases = {
  DEFAULT_BRAND_COLOR: rule(() => DEFAULT_BRAND_COLOR, [[]]),
  BRAND_COLOR_PRESETS: rule(() => BRAND_COLOR_PRESETS, [[]]),
  logoPalette: rule(
    (rgba: number[], max?: number) => logoPalette(rgba, max),
    [
      [img([WHITE, 50], [BLACK, 30], [GRAY, 20], [CLEAR, 90], [BLUE, 6], [ORANGE, 4])],
      [img([BLUE, 5], [[35, 100, 175, 255], 3], [ORANGE, 2])],
      [img(...shades, [ORANGE, 10])],
      [img([BLUE, 98], [ORANGE, 2])],
      [img([BLUE, 30], [ORANGE, 25], [GREEN, 20], [PURPLE, 15], [YELLOW, 10]), 3],
      [img([BLUE, 30], [ORANGE, 25], [GREEN, 20], [PURPLE, 15], [YELLOW, 10])],
      [img([BLUE, 10], [ORANGE, 10]), 0],
      [img([WHITE, 10], [BLACK, 10], [GRAY, 5])],
      [img([BLACK, 900], [BLUE, 4])],
      [img([[240, 228, 226, 255], 20], [[60, 40, 42, 255], 20], [[255, 0, 0, 120], 5])],
      [[]],
      [[255, 0, 0]],
    ],
  ),
  brandColorChoices: rule(
    (logo: string[], current: string | null) => brandColorChoices(logo, current),
    [
      [[], null],
      [["#aa3311", "#12263a"], "#010203"],
      [["#AA3311"], "#aa3311"],
      [[], "#1d5fa8"],
      [[], "nope"],
    ],
  ),
  // Documents' text on the shop's color: white, or navy on a light color.
  textOnBrand: rule(
    (bg: string) => textOnBrand(bg, "#12263A", "#FFFFFF"),
    [["#12263A"], ["#1D5FA8"], ["#F2C94C"], ["#FFFFFF"], ["#7FB3D5"], ["#D9661F"], ["#000000"]],
  ),
  suggestedBrandColor: rule(
    (palette: string[], current: string | null, newLogo: boolean) =>
      suggestedBrandColor(palette, current, newLogo),
    [
      [["#AA3311"], "#334455", true],
      [["#AA3311"], "#334455", false],
      [["#AA3311"], "#12263A", false],
      [["#AA3311"], "#12263a", false],
      [["#AA3311"], "", false],
      [["#AA3311"], null, false],
      [["#AA3311"], "#aa3311", true],
      [[], "#12263A", true],
    ],
  ),
};
