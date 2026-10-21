"use client";

import type { ComponentProps } from "react";
import { forgetAllRecent } from "@/lib/recent";

/** A Sign Out form that also forgets this browser's Recent searches. */
export function SignOutForm(props: ComponentProps<"form">) {
  return <form {...props} onSubmit={() => forgetAllRecent()} />;
}
