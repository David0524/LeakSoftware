import { formatPhone, toE164 } from "@leakbook/core";
import { useEffect, useState } from "react";
import { Alert } from "react-native";
import { useSession } from "../../../../../state/session";
import { Button, FieldGroup, FieldRow, Screen } from "../../../../../ui/components";
import { useDiscardChanges } from "../../../../../ui/discard";

/**
 * My Mobile Number (company texting): calls I place from the company number ring it first,
 * and incoming calls can ring it. Saved to my profile on the server.
 */
export default function MyPhone() {
  const { services } = useSession();
  const [phone, setPhone] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // The number on the server, to tell a typed change (owner, 2026-10-20: "Discard changes?").
  const [savedPhone, setSavedPhone] = useState<string | null>(null);
  useEffect(() => {
    services.sync
      .myPhone()
      .then((p) => {
        const shown = p ? formatPhone(toE164(p) ?? p) : "";
        setSavedPhone(shown);
        setPhone((now) => now ?? shown);
      })
      .catch(() => {});
  }, [services]);
  useDiscardChanges(
    phone !== null && (toE164(phone) ?? phone.trim()) !== (toE164(savedPhone) ?? savedPhone ?? ""),
  );
  async function save() {
    const e164 = toE164(phone);
    if (!e164) return Alert.alert("Check the number", "Enter a US mobile number.");
    setSaving(true);
    try {
      await services.sync.saveMyPhone(e164);
      setPhone(formatPhone(e164));
      setSavedPhone(formatPhone(e164));
      Alert.alert("Saved", "Calls you place from Messages ring this number first.");
    } catch (e) {
      Alert.alert("Couldn’t save", e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }
  return (
    <Screen title="My Mobile Number">
      <FieldGroup footer="Calls you place from Messages ring here first, then connect from the company number.">
        <FieldRow
          label="Mobile"
          value={phone ?? ""}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
          autoComplete="tel"
        />
      </FieldGroup>
      <Button title="Save Number" onPress={() => void save()} loading={saving} />
    </Screen>
  );
}
