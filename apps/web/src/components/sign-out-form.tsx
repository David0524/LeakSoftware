"use client";

import type { ComponentProps } from "react";
import { forgetAllRecent } from "@/lib/recent";
import { forgetAllDrafts } from "./draft-keeper";

/** A Sign Out form that also forgets this browser's Recent searches and unsaved drafts. */
export function SignOutForm(props: ComponentProps<"form">) {
  return (
    <form
      {...props}
      onSubmit={() => {
        forgetAllRecent();
        forgetAllDrafts();
      }}
    />
  );
}
