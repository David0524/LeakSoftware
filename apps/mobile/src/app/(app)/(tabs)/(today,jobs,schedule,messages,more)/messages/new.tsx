import { router, useLocalSearchParams } from "expo-router";
import { formatPhone } from "@leakbook/core";
import { useState } from "react";
import { Alert } from "react-native";
import { useRow } from "../../../../../data/hooks";
import { sendCompanyText, useLine } from "../../../../../data/texting";
import { Composer } from "../../../../../features/messages/Composer";
import { useCompany } from "../../../../../state/session";
import { Field, Notice, Screen } from "../../../../../ui/components";
import { useDiscardChanges } from "../../../../../ui/discard";

/**
 * New Message (spec 5.7): the first text from the company number, to a customer (started from
 * their page or a job) or to a number typed in. Sending opens the new conversation in its
 * place.
 */
export default function NewMessage() {
  const { customer: customerId, job } = useLocalSearchParams<{ customer?: string; job?: string }>();
  const company = useCompany();
  const line = useLine(company.id);
  const customer = useRow<{ id: string; name: string; phone: string | null }>(
    "customer",
    customerId,
  );
  const [to, setTo] = useState("");
  const [error, setError] = useState<string | undefined>();
  // A number typed asks before leaving (owner, 2026-10-20); the message itself is the Composer's.
  const leave = useDiscardChanges(to.trim() !== "");

  async function send(body: string, picture: { uri: string; type: string } | null) {
    if (!customer && to.replace(/\D/g, "").length < 10) {
      setError("Enter a mobile number, like (480) 555-0188.");
      return false;
    }
    setError(undefined);
    try {
      const sent = await sendCompanyText({
        ...(customer ? { customerId: customer.id } : { phone: to, companyId: company.id }),
        body,
        jobId: job,
        picture: picture ? { companyId: company.id, ...picture } : undefined,
      });
      leave(() => router.replace(`/messages/${sent.conversationId}`));
      return true;
    } catch (e) {
      Alert.alert("Not Sent", e instanceof Error ? e.message : String(e));
      return false;
    }
  }

  return (
    <Screen
      title="New Message"
      subtitle={
        customer
          ? `To ${customer.name}${customer.phone ? `, ${formatPhone(customer.phone)}` : ""}`
          : undefined
      }
    >
      {customer ? null : (
        <Field
          label="To"
          placeholder="Mobile number"
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
          autoComplete="tel"
          value={to}
          onChangeText={setTo}
          error={error}
          autoFocus
        />
      )}
      {line?.status === "active" ? (
        <Composer
          pictures={line.pictures}
          onSend={send}
          docked={false}
          autoFocus={Boolean(customer)}
        />
      ) : (
        <Notice>Texting is off until the company number is working.</Notice>
      )}
    </Screen>
  );
}
