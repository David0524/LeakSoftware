import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, TextInput } from "react-native";
import { useRow } from "../../../data/hooks";
import { sendCompanyText } from "../../../data/texting";
import { Button, Screen, T } from "../../../ui/components";
import { color } from "../../../ui/theme";

/** The first text to a customer from the company number; then it's a conversation. */
export default function NewMessage() {
  const { customer: customerId, job } = useLocalSearchParams<{ customer: string; job?: string }>();
  const customer = useRow<{ id: string; name: string; phone: string | null }>(
    "customer",
    customerId,
  );
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  async function send() {
    if (!body.trim()) return;
    setSending(true);
    try {
      const sent = await sendCompanyText({ customerId, body, jobId: job });
      router.replace(`/messages/${sent.conversationId}`);
    } catch (e) {
      Alert.alert("Not sent", e instanceof Error ? e.message : String(e));
      setSending(false);
    }
  }

  return (
    <Screen>
      <T variant="muted">
        To {customer?.name ?? "the customer"}
        {customer?.phone ? `, ${customer.phone}` : ""}. From the company number.
      </T>
      <TextInput
        value={body}
        onChangeText={setBody}
        placeholder="Text message"
        placeholderTextColor={color.textMuted}
        accessibilityLabel="Message"
        multiline
        autoFocus
        maxLength={1600}
        style={{
          minHeight: 88,
          padding: 12,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: color.controlBorder,
          backgroundColor: color.surface,
          color: color.text,
          fontSize: 17,
          textAlignVertical: "top",
        }}
      />
      <Button title="Send" onPress={() => void send()} loading={sending} />
    </Screen>
  );
}
