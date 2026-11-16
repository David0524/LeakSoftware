import { router } from "expo-router";
import { useState } from "react";
import { FEEDBACK_WORDS, type FeedbackRow } from "@leakbook/core";
import { useFeedback } from "../../data/feedback";
import { useCompany } from "../../state/session";
import { Button, Section } from "../../ui/components";
import { FeedbackRows, FeedbackSheet } from "./FeedbackRows";

/**
 * A customer's Feedback section (owner's competitor notes, 2026-11-16), for owners and admins: what
 * this customer told the shop, newest complaints first, as the website's customer page. Nothing
 * shows until they've said something.
 */
export function CustomerFeedback({ customerId }: { customerId: string }) {
  const company = useCompany();
  const { load, reload } = useFeedback(company.id, customerId);
  const [open, setOpen] = useState<FeedbackRow | null>(null);
  if (load.at !== "ready" || load.list.rows.length === 0) return null;
  return (
    <>
      <Section title={FEEDBACK_WORDS.customerSection}>
        <FeedbackRows
          rows={load.list.rows.slice(0, 5)}
          timeZone={company.timezone}
          onOpen={setOpen}
          showCustomer={false}
        />
        <Button
          title={FEEDBACK_WORDS.seeAll}
          kind="quiet"
          wide
          onPress={() => router.push("/feedback" as never)}
        />
      </Section>
      <FeedbackSheet
        row={open}
        timeZone={company.timezone}
        onClose={() => setOpen(null)}
        onChanged={() => void reload()}
      />
    </>
  );
}
