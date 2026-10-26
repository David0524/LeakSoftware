import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { PRINT_LOGO_EDGE, PRINT_PHOTO_EDGE, shrinkForPrint } from "@/server/print-image";

const noise = (w: number, h: number) => {
  const raw = Buffer.alloc(w * h * 3);
  for (let i = 0; i < raw.length; i++) raw[i] = (i * 7919 + ((i >> 3) ^ (i * 31))) & 255;
  return raw;
};

describe("shrinkForPrint", () => {
  it("shrinks a phone photo to a print-size JPEG", async () => {
    const original = await sharp(noise(1536, 2048), {
      raw: { width: 1536, height: 2048, channels: 3 },
    })
      .jpeg({ quality: 92 })
      .toBuffer();
    const out = await shrinkForPrint(original);
    expect(out?.contentType).toBe("image/jpeg");
    const meta = await sharp(out!.body).metadata();
    expect(Math.max(meta.width!, meta.height!)).toBe(PRINT_PHOTO_EDGE);
    expect(meta.height! / meta.width!).toBeCloseTo(2048 / 1536, 1);
    expect(out!.body.length).toBeLessThan(original.length);
  });

  it("keeps a logo's transparency and shrinks it", async () => {
    const logo = await sharp({
      create: {
        width: 1752,
        height: 897,
        channels: 4,
        background: { r: 0, g: 80, b: 200, alpha: 0.5 },
      },
    })
      .png()
      .toBuffer();
    const out = await shrinkForPrint(logo);
    expect(out?.contentType).toBe("image/png");
    const meta = await sharp(out!.body).metadata();
    expect(meta.width).toBe(PRINT_LOGO_EDGE);
    expect(meta.hasAlpha).toBe(true);
  });

  it("leaves small images, SVGs and junk alone", async () => {
    const small = await sharp({
      create: { width: 40, height: 40, channels: 3, background: "#fff" },
    })
      .jpeg()
      .toBuffer();
    expect(await shrinkForPrint(small)).toBeNull();
    expect(
      await shrinkForPrint(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>")),
    ).toBeNull();
    expect(await shrinkForPrint(Buffer.from("not an image"))).toBeNull();
  });
});
