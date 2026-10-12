import { describe, expect, it } from "vitest";
import {
  arrowHead,
  extensionForMime,
  fitWithin,
  formatBytes,
  formatDuration,
  mediaStoragePath,
  mimeFromFileName,
  parseMarkup,
  shapeFromDrag,
  textShape,
} from "../src";

describe("media helpers", () => {
  it("builds the storage path with the company first", () => {
    expect(mediaStoragePath("c", "j", "m", "image/jpeg")).toBe("c/j/m.jpg");
    expect(mediaStoragePath("c", "j", "m", "video/quicktime")).toBe("c/j/m.mov");
    expect(mediaStoragePath("c", "j", "m", "audio/mp4")).toBe("c/j/m.m4a");
    expect(() => extensionForMime("application/pdf")).toThrow(/Unsupported/);
  });

  it("guesses MIME types from file names", () => {
    expect(mimeFromFileName("IMG_1.MOV", "video")).toBe("video/quicktime");
    expect(mimeFromFileName("a.m4a", "audio")).toBe("audio/mp4");
    expect(mimeFromFileName("noext", "photo")).toBe("image/jpeg");
  });

  it("resizes only when the long edge is over the limit", () => {
    expect(fitWithin(4032, 3024, 2048)).toEqual({ width: 2048, height: 1536 });
    expect(fitWithin(3024, 4032, 2048)).toEqual({ width: 1536, height: 2048 });
    expect(fitWithin(2048, 1000, 2048)).toBeNull();
    expect(fitWithin(0, 0, 2048)).toBeNull();
  });

  it("formats durations and sizes", () => {
    expect(formatDuration(65_400)).toBe("1:05");
    expect(formatDuration(null)).toBe("0:00");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(3.5 * 1024 * 1024)).toBe("3.5 MB");
  });
});

describe("markup", () => {
  it("keeps valid shapes and drops anything else", () => {
    const m = parseMarkup({
      version: 1,
      shapes: [
        { type: "arrow", color: "red", x1: 0.1, y1: 0.2, x2: 0.5, y2: 0.5 },
        { type: "circle", color: "yellow", cx: 0.5, cy: 0.5, rx: 0.1, ry: 0.2 },
        { type: "text", color: "white", x: 0.3, y: 0.3, text: "  Crack here  " },
        { type: "arrow", color: "red", x1: 2, y1: 0, x2: 0, y2: 0 },
        { type: "text", color: "white", x: 0.3, y: 0.3, text: "   " },
        { type: "blob", color: "red" },
        { type: "circle", color: "purple", cx: 0.5, cy: 0.5, rx: 0.1, ry: 0.1 },
        null,
      ],
    });
    expect(m.shapes.map((s) => s.type)).toEqual(["arrow", "circle", "text"]);
    expect(m.shapes[2]).toMatchObject({ text: "Crack here" });
    expect(parseMarkup(null)).toEqual({ version: 1, shapes: [] });
    expect(parseMarkup("junk")).toEqual({ version: 1, shapes: [] });
  });

  it("turns drags into shapes in image fractions", () => {
    expect(shapeFromDrag("arrow", "red", { x: 0.1, y: 0.1 }, { x: 0.4, y: 1.3 })).toEqual({
      type: "arrow",
      color: "red",
      x1: 0.1,
      y1: 0.1,
      x2: 0.4,
      y2: 1,
    });
    expect(shapeFromDrag("circle", "yellow", { x: 0.2, y: 0.2 }, { x: 0.6, y: 0.4 })).toEqual({
      type: "circle",
      color: "yellow",
      cx: 0.4,
      cy: 0.3,
      rx: 0.2,
      ry: 0.1,
    });
    // A tap is not a shape.
    expect(shapeFromDrag("arrow", "red", { x: 0.5, y: 0.5 }, { x: 0.51, y: 0.505 })).toBeNull();
  });

  it("limits text labels", () => {
    expect(textShape("red", { x: 0.5, y: 0.5 }, "")).toBeNull();
    const long = textShape("red", { x: 0.5, y: 0.5 }, "x".repeat(200));
    expect(long && long.type === "text" && long.text.length).toBe(80);
  });

  it("points the arrow head back along the line", () => {
    const [tip, left, right] = arrowHead(0, 0, 100, 0, 20);
    expect(tip).toEqual([100, 0]);
    expect(left![0]).toBeLessThan(100);
    expect(right![0]).toBeLessThan(100);
    expect(left![1]).toBeCloseTo(-right![1]);
  });
});
