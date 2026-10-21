import { describe, expect, it } from "vitest";
import { DISCARD_PROMPT, leavesPage, signature, type FieldValue } from "../src/lib/dirty";

// Discard changes, everywhere (owner, 2026-10-20): docs/design/2026-10-20-one-handed-use.md.

const field = (key: string, value: string, more: Partial<FieldValue> = {}): FieldValue => ({
  key,
  type: "text",
  value,
  ...more,
});

describe("signature (is anything unsaved?)", () => {
  const opened = [field("line", ""), field("start", "30"), field("job", "j1", { type: "hidden" })];

  it("is the same while nothing changed, and differs once a field did", () => {
    expect(signature([...opened])).toBe(signature(opened));
    expect(signature([field("line", "Main drain"), ...opened.slice(1)])).not.toBe(
      signature(opened),
    );
  });

  it("counts a segmented choice (its hidden input), a checkbox, a radio and a chosen file", () => {
    const base = [
      field("verdict", "", { type: "hidden" }),
      field("spa", "on", { type: "checkbox", checked: false }),
      field("kind", "pool", { type: "radio", checked: true }),
      field("photo", "", { type: "file", files: 0 }),
    ];
    const changed = (i: number, f: FieldValue) => base.map((b, j) => (j === i ? f : b));
    for (const next of [
      changed(0, field("verdict", "leaking", { type: "hidden" })),
      changed(1, field("spa", "on", { type: "checkbox", checked: true })),
      changed(2, field("kind", "pool", { type: "radio", checked: false })),
      changed(3, field("photo", "C:\\fakepath\\a.jpg", { type: "file", files: 1 })),
    ])
      expect(signature(next)).not.toBe(signature(base));
  });

  it("never counts fields that save by themselves, or buttons", () => {
    const base = [
      field("text", "Report", { autosave: true }),
      field("go", "Save", { type: "submit" }),
    ];
    expect(
      signature([
        field("text", "Report, edited", { autosave: true }),
        field("go", "Saving…", { type: "submit" }),
      ]),
    ).toBe(signature(base));
  });

  it("asks with item 4's alert", () => {
    expect(DISCARD_PROMPT).toMatchObject({
      title: "Discard changes?",
      confirmLabel: "Discard Changes",
      cancelLabel: "Keep Editing",
      destructive: true,
      alert: true,
    });
  });
});

describe("leavesPage (links checked before leaving)", () => {
  const here = "https://sundeckpro.test/jobs/new";
  const plain = { button: 0, meta: false, ctrl: false, shift: false, alt: false };

  it("checks a plain click to another page of the site", () => {
    expect(leavesPage({ href: "/today" }, plain, here)).toBe(true);
    expect(leavesPage({ href: "/jobs/new?customer=c1" }, plain, here)).toBe(true);
  });

  it("lets new tabs, downloads, other sites and jumps within the page through", () => {
    expect(leavesPage({ href: "/today" }, { ...plain, meta: true }, here)).toBe(false);
    expect(leavesPage({ href: "/today", target: "_blank" }, plain, here)).toBe(false);
    expect(leavesPage({ href: "/r/t/pdf", download: true }, plain, here)).toBe(false);
    expect(leavesPage({ href: "https://maps.apple.com/?q=x" }, plain, here)).toBe(false);
    expect(leavesPage({ href: "#details" }, plain, here)).toBe(false);
    expect(leavesPage({ href: "/today" }, { ...plain, button: 1 }, here)).toBe(false);
  });
});
