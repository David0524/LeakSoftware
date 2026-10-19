import {
  MARKUP_COLORS,
  MEDIA_KIND_LABELS,
  MEDIA_LIMITS,
  MIN_INK,
  SIGNATURE_PURPOSE_LABELS,
  arrowHead,
  enabledSignaturePurposes,
  extensionForMime,
  fitWithin,
  formatBytes,
  formatDuration,
  inkLength,
  mediaStoragePath,
  mimeFromFileName,
  parseMarkup,
  reportSignOffPurposes,
  shapeAtTap,
  shapeFromDrag,
  signatureStatement,
  signatureStoragePath,
  signatureSvg,
  strokePath,
  textShape,
  type MarkupColor,
  type MediaKind,
  type SignaturePurpose,
  type SignatureStroke,
} from "@leakbook/core";
import { rule, type ModuleCases } from "../case";

type Point = { x: number; y: number };

const mimes = [
  "image/jpeg",
  "IMAGE/PNG",
  "image/heic",
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/aac",
  "audio/mpeg",
  "audio/wav",
  "audio/webm",
  "audio/ogg",
  "application/pdf",
  "",
];

const purposeSettings = [
  null,
  {},
  "junk",
  7,
  { signature_purposes: null },
  { signature_purposes: {} },
  { signature_purposes: "inspection_ack" },
  { signature_purposes: ["inspection_ack"] },
  {
    signature_purposes: {
      inspection_ack: true,
      work_authorization: false,
      quote_acceptance: true,
      completion: true,
    },
  },
  {
    signature_purposes: {
      inspection_ack: true,
      work_authorization: true,
      quote_acceptance: true,
      completion: true,
    },
  },
  {
    signature_purposes: {
      inspection_ack: 0,
      work_authorization: 1,
      quote_acceptance: "yes",
      completion: "",
    },
  },
  { signature_purposes: { inspection_ack: {}, completion: [], work_authorization: null } },
  { signature_purposes: { inspection_ack: false, work_authorization: true } },
];

const strokes: SignatureStroke[][] = [
  [[[0, 0]]],
  [
    [
      [0, 0],
      [3, 4],
    ],
    [
      [10, 10],
      [10, 20],
    ],
  ],
  [
    [
      [10, 10],
      [110, 60],
    ],
    [[20, 50]],
  ],
  [[], [[5, 5]], []],
  [
    [
      [0.1, 0.2],
      [0.30000000000000004, 0.7],
      [12.345, 67.891],
      [-3.25, -0.05],
    ],
  ],
  [
    [
      [1e21, 2],
      [1.05, 2.25],
      [1000000, 0.15],
    ],
  ],
  [
    [
      [100.04999, 33.333333],
      [99.95, 0.45],
      [-0.04, -1.5],
    ],
  ],
];

// media and signature, plus the signature labels from report.
export const media: ModuleCases = {
  MEDIA_LIMITS: rule(() => MEDIA_LIMITS, [[]]),
  MEDIA_KIND_LABELS: rule(() => MEDIA_KIND_LABELS, [[]]),
  MARKUP_COLORS: rule(() => MARKUP_COLORS, [[]]),
  extensionForMime: rule(
    (m: string) => extensionForMime(m),
    mimes.map((m) => [m]),
  ),
  mimeFromFileName: rule(
    (name: string, kind: MediaKind) => mimeFromFileName(name, kind),
    [
      ["IMG_1.MOV", "video"],
      ["a.m4a", "audio"],
      ["noext", "photo"],
      ["noext", "video"],
      ["noext", "audio"],
      ["clip.webm", "audio"],
      ["photo.HEIC", "photo"],
      ["archive.tar.mp3", "audio"],
      ["trailing.", "photo"],
      ["", "video"],
      ["jpg", "audio"],
      ["x.wav", "photo"],
      ["x.ogg", "audio"],
      ["x.aac", "audio"],
      ["x.png", "photo"],
      ["x.mp4", "audio"],
    ],
  ),
  mediaStoragePath: rule(
    (c: string, j: string, m: string, mime: string) => mediaStoragePath(c, j, m, mime),
    [
      ["c", "j", "m", "image/jpeg"],
      ["c", "j", "m", "video/quicktime"],
      ["c", "j", "m", "audio/mp4"],
      ["c", "j", "m", "application/pdf"],
    ],
  ),
  fitWithin: rule(
    (w: number, h: number, max: number) => fitWithin(w, h, max),
    [
      [4032, 3024, 2048],
      [3024, 4032, 2048],
      [2048, 1000, 2048],
      [2049, 1000, 2048],
      [0, 0, 2048],
      [0, 0, 0],
      [3000, 1, 2048],
      [4000, 3001, 2048],
      [1001, 1000, 1000],
      [4096, 2050, 2048],
      [5000.5, 3333.3, 2048],
      [100, 300, 7],
    ],
  ),
  formatDuration: rule(
    (ms: number | null) => formatDuration(ms),
    [
      [65400],
      [null],
      [0],
      [499],
      [500],
      [1499.999],
      [59499],
      [59500],
      [600000],
      [3599999],
      [3600000],
      [-5000],
      [7261000],
    ],
  ),
  formatBytes: rule(
    (b: number | null) => formatBytes(b),
    [
      [512],
      [2048],
      [3.5 * 1024 * 1024],
      [null],
      [0],
      [-5],
      [1023],
      [1024],
      [1535],
      [1536],
      [1048575],
      [1048576],
      [1310720],
      [1153433],
      [1205862],
      [1258291],
      [16 * 1024 * 1024],
      [10737418240],
    ],
  ),
  parseMarkup: rule(
    (value: unknown) => parseMarkup(value),
    [
      [
        {
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
        },
      ],
      [null],
      ["junk"],
      [7],
      [[]],
      [{}],
      [{ shapes: "x" }],
      [{ version: 2, shapes: [] }],
      [
        {
          version: 9,
          shapes: [
            { type: "arrow", color: "white", x1: 0, y1: 1, x2: 1, y2: 0, extra: true },
            { type: "arrow", color: "red", x1: "0.1", y1: 0, x2: 0, y2: 0 },
            { type: "arrow", color: "red", x1: 0.1, y1: 0, x2: 0 },
            { type: "arrow", color: "red", x1: -0.01, y1: 0, x2: 0, y2: 0 },
            { type: "circle", color: "red", cx: 1.0001, cy: 0, rx: 0, ry: 0 },
            { type: "circle", color: "Red", cx: 0.5, cy: 0.5, rx: 0.1, ry: 0.1 },
            { type: "circle", cx: 0.5, cy: 0.5, rx: 0.1, ry: 0.1 },
            { type: "text", color: "red", x: 0, y: 1, text: 42 },
            { type: "text", color: "red", x: 0, y: 1, text: "x".repeat(200) },
            { type: "text", color: "red", x: 0, y: 1, text: `a${" ".repeat(78)}bc` },
            { type: "text", color: "red", x: 0, y: 1, text: `${"x".repeat(78)}😀` },
            { type: "text", color: "red", x: 0, y: 1, text: " \t\n﻿  Leak 　 " },
            { type: "text", color: "red", x: 0, y: 1, text: "\u0085Leak\u0085" },
            { type: "text", color: "yellow", x: 1.5, y: 0.5, text: "off" },
            ["arrow"],
            "arrow",
            3,
            true,
            { type: true, color: "red" },
          ],
        },
      ],
    ],
  ),
  shapeFromDrag: rule(
    (type: "arrow" | "circle", color: MarkupColor, start: Point, end: Point) =>
      shapeFromDrag(type, color, start, end),
    [
      ["arrow", "red", { x: 0.1, y: 0.1 }, { x: 0.4, y: 1.3 }],
      ["circle", "yellow", { x: 0.2, y: 0.2 }, { x: 0.6, y: 0.4 }],
      ["arrow", "red", { x: 0.5, y: 0.5 }, { x: 0.51, y: 0.505 }],
      ["circle", "white", { x: 0.5, y: 0.5 }, { x: 0.52, y: 0.5 }],
      ["circle", "white", { x: 0.5, y: 0.5 }, { x: 0.5, y: 0.52 }],
      ["arrow", "red", { x: 0.5, y: 0.5 }, { x: 0.5199, y: 0.5 }],
      ["circle", "red", { x: -1, y: -1 }, { x: 2, y: 2 }],
      ["circle", "red", { x: 0.123456789, y: 0.98765 }, { x: 0.333333333, y: 0.1 }],
      ["arrow", "yellow", { x: 0.00005, y: 0.99995 }, { x: 0.700049999, y: 0.3 }],
      ["circle", "red", { x: 0.1, y: 0.2 }, { x: 0.2, y: 0.2 }],
      ["arrow", "white", { x: 1, y: 1 }, { x: 1.5, y: 2 }],
    ],
  ),
  textShape: rule(
    (color: MarkupColor, at: Point, text: string) => textShape(color, at, text),
    [
      ["red", { x: 0.5, y: 0.5 }, ""],
      ["red", { x: 0.5, y: 0.5 }, "x".repeat(200)],
      ["yellow", { x: -0.2, y: 1.7 }, "  Skimmer crack "],
      ["white", { x: 0.123456789, y: 0.55555 }, "Leak"],
      ["red", { x: 0.5, y: 0.5 }, " \n\t "],
    ],
  ),
  shapeAtTap: rule(
    (type: "arrow" | "circle", color: MarkupColor, at: Point, aspect: number) =>
      shapeAtTap(type, color, at, aspect),
    [
      ["circle", "red", { x: 0.5, y: 0.5 }, 0.75],
      ["arrow", "red", { x: 0.5, y: 0.5 }, 1],
      ["arrow", "red", { x: 0.05, y: 0.05 }, 1],
      ["arrow", "yellow", { x: 0.15, y: 0.15 }, 1],
      ["arrow", "white", { x: 0.9, y: 0.1 }, 1.333],
      ["arrow", "white", { x: 0.95, y: 0.95 }, 0.5625],
      ["circle", "yellow", { x: 1.2, y: -0.3 }, 1.7777777],
      ["circle", "white", { x: 0.3, y: 0.3 }, 20],
      ["arrow", "red", { x: 0.99, y: 0.2 }, 6],
      ["arrow", "red", { x: 1.5, y: -2 }, 0.75],
    ],
  ),
  arrowHead: rule(
    (x1: number, y1: number, x2: number, y2: number, size: number) =>
      arrowHead(x1, y1, x2, y2, size),
    [
      [0, 0, 100, 0, 20],
      [0, 0, 0, 100, 20],
      [100, 100, 0, 0, 12],
      [10, 20, 10, 20, 15],
      [37.5, 12.25, -40, 80.125, 18],
    ],
  ),
  SIGNATURE_PURPOSE_LABELS: rule(() => SIGNATURE_PURPOSE_LABELS, [[]]),
  MIN_INK: rule(() => MIN_INK, [[]]),
  enabledSignaturePurposes: rule(
    (s: unknown) => enabledSignaturePurposes(s),
    purposeSettings.map((s) => [s]),
  ),
  reportSignOffPurposes: rule(
    (s: unknown) => reportSignOffPurposes(s),
    purposeSettings.map((s) => [s]),
  ),
  signatureStoragePath: rule(
    (c: string, j: string, s: string) => signatureStoragePath(c, j, s),
    [
      ["c", "j", "s"],
      ["0192-company", "0192-job", "0192-sig"],
    ],
  ),
  inkLength: rule(
    (s: SignatureStroke[]) => inkLength(s),
    [...strokes.map((s) => [s] as [SignatureStroke[]]), [[]]],
  ),
  strokePath: rule(
    (s: SignatureStroke) => strokePath(s),
    [
      [[]],
      [[[1, 2]]],
      [
        [
          [1, 2],
          [3.333, 4],
        ],
      ],
      ...strokes.flat().map((s) => [s] as [SignatureStroke]),
    ],
  ),
  signatureSvg: rule(
    (s: SignatureStroke[], width?: number) => signatureSvg(s, width),
    [
      ...strokes.map((s) => [s] as [SignatureStroke[]]),
      [strokes[2]!, 3],
      [strokes[1]!, 2.5],
      [strokes[4]!, 0.30000000000000004],
      [strokes[6]!, 1.15],
      [strokes[1]!, 0],
      [[]],
      [[[]]],
    ],
  ),
  signatureStatement: rule(
    (purpose: SignaturePurpose, shop: string, address: string | null) =>
      signatureStatement(purpose, shop, address),
    (["inspection_ack", "work_authorization", "quote_acceptance", "completion"] as const).flatMap(
      (p) => [
        [p, "Demo Leak Co.", "9 Sample Way, Scottsdale"] as [
          SignaturePurpose,
          string,
          string | null,
        ],
        [p, "Demo Leak Co.", null] as [SignaturePurpose, string, string | null],
        [p, "A&B Pools", ""] as [SignaturePurpose, string, string | null],
      ],
    ),
  ),
};
