import type { ReactNode } from "react";
import type { Edition } from "./kit";

/** A value that may differ between the two manuals. */
export type PerEdition<T> = T | { pool: T; leak: T };

export function pick<T>(value: PerEdition<T>, edition: Edition): T {
  if (value && typeof value === "object" && "pool" in value && "leak" in value) {
    return (value as { pool: T; leak: T })[edition];
  }
  return value as T;
}

/**
 * One chapter of a manual. The chapter's file exports one of these; `editions.ts` puts them in
 * order. Shared chapters give per-edition values where the two shops differ.
 */
export type ChapterDef = {
  id: string;
  title: PerEdition<string>;
  /** What the chapter covers, in plain words: "the Today screen". */
  subtitle: PerEdition<string>;
  /** The story's moment: "Monday · 6:52 a.m." */
  moment?: PerEdition<string>;
  lede: PerEdition<ReactNode>;
  learn?: PerEdition<string[]>;
  Body: (props: { edition: Edition }) => ReactNode;
};
