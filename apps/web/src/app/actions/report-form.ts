import type { FinalSection } from "@leakbook/core";

/** The edited sections in a report form, in order. */
export function sectionsOf(form: FormData): FinalSection[] {
  const keys = form.getAll("key").map(String);
  const titles = form.getAll("title").map(String);
  const texts = form.getAll("text").map(String);
  return keys.map((key, i) => ({ key, title: titles[i] ?? key, text: (texts[i] ?? "").trim() }));
}
