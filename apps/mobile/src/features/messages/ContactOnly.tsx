import type { ReactNode } from "react";
import { NO_CONTACT_MESSAGE } from "@leakbook/core";
import { useCanContact } from "../../state/session";
import { Notice, Screen } from "../../ui/components";

/**
 * Messages is for people with Text and Call Customers (owner, 2026-11-23; core contact.ts), as
 * the website's messages/layout.tsx. The tab is gone without it; a link or an old notification
 * shows this instead.
 */
export function ContactOnly({ children }: { children: ReactNode }) {
  if (useCanContact()) return <>{children}</>;
  return (
    <Screen title="Messages">
      <Notice tone="warning">{NO_CONTACT_MESSAGE}</Notice>
    </Screen>
  );
}
