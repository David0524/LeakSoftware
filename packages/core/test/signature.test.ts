import { describe, expect, it } from "vitest";
import {
  MIN_INK,
  enabledSignaturePurposes,
  inkLength,
  signatureStatement,
  signatureStoragePath,
  signatureSvg,
  strokePath,
} from "../src";

describe("signatures", () => {
  it("lists the purposes turned on in settings, without quote acceptance until quotes exist", () => {
    expect(
      enabledSignaturePurposes({
        signature_purposes: {
          inspection_ack: true,
          work_authorization: false,
          quote_acceptance: true,
          completion: true,
        },
      }).map((p) => p.value),
    ).toEqual(["inspection_ack", "completion"]);
    expect(enabledSignaturePurposes(null)[0]).toEqual({
      value: "inspection_ack",
      label: "Inspection acknowledged",
    });
  });

  it("stores signatures beside the job's photos", () => {
    expect(signatureStoragePath("c", "j", "s")).toBe("c/j/signature-s.svg");
  });

  it("measures ink so a tap is not a signature", () => {
    expect(inkLength([[[0, 0]]])).toBe(0);
    expect(
      inkLength([
        [
          [0, 0],
          [3, 4],
        ],
        [
          [10, 10],
          [10, 20],
        ],
      ]),
    ).toBe(15);
    expect(MIN_INK).toBeGreaterThan(15);
  });

  it("draws strokes as an SVG cropped to the ink", () => {
    expect(strokePath([[1, 2]])).toBe("M1 2l0.1 0");
    expect(
      strokePath([
        [1, 2],
        [3.333, 4],
      ]),
    ).toBe("M1 2L3.3 4");
    const svg = signatureSvg(
      [
        [
          [10, 10],
          [110, 60],
        ],
        [[20, 50]],
      ],
      3,
    );
    expect(svg).toContain('viewBox="4 4 112 62"');
    expect(svg).toContain('<path d="M10 10L110 60"/>');
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(() => signatureSvg([])).toThrow();
  });
});

describe("what the customer signs", () => {
  it("says what they confirm, with the shop and the pool", () => {
    expect(signatureStatement("inspection_ack", "Demo Leak Co.", "9 Sample Way, Scottsdale")).toBe(
      "I confirm Demo Leak Co. inspected the pool at 9 Sample Way, Scottsdale today and explained what they found.",
    );
    expect(signatureStatement("completion", "Demo Leak Co.", null)).toBe(
      "I confirm Demo Leak Co. finished the work today.",
    );
  });
});
