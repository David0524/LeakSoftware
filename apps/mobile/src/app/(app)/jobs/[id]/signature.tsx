import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import {
  MIN_INK,
  enabledSignaturePurposes,
  inkLength,
  signatureStoragePath,
  signatureSvg,
  uuidv7,
  type Customer,
  type Job,
  type Property,
  type SignaturePurpose,
  type SignatureStroke,
} from "@leakbook/core";
import { useRow } from "../../../../data/hooks";
import { currentPosition, storeSignatureSvg } from "../../../../lib/media";
import { useCompany, useSession } from "../../../../state/session";
import { Button, Choice, Field, Notice, Row, Screen, T } from "../../../../ui/components";
import { SignaturePad } from "../../../../ui/SignaturePad";

/** Capture a customer's signature on the job. Works offline; the drawing uploads later. */
export default function SignatureScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const company = useCompany();
  const { services } = useSession();
  const job = useRow<Job>("job", id);
  const property = useRow<Property>("property", job?.property_id);
  const customer = useRow<Customer>("customer", job?.bill_to_customer_id ?? property?.customer_id);
  const purposes = enabledSignaturePurposes(company.settings);
  const [purpose, setPurpose] = useState<SignaturePurpose | null>(purposes[0]?.value ?? null);
  const [name, setName] = useState<string | null>(null);
  const [role, setRole] = useState("");
  const [strokes, setStrokes] = useState<SignatureStroke[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!job) {
    return (
      <Screen>
        <Notice tone="warning">This job isn’t on this phone.</Notice>
      </Screen>
    );
  }
  if (purposes.length === 0) {
    return (
      <Screen>
        <Notice tone="warning">Signatures are turned off in your company settings.</Notice>
      </Screen>
    );
  }

  const signer = (name ?? customer?.name ?? "").trim();

  async function save() {
    if (!purpose) return setError("Choose what this signature is for.");
    if (!signer) return setError("Enter the signer’s name.");
    if (inkLength(strokes) < MIN_INK) return setError("Ask them to sign in the box.");
    setSaving(true);
    try {
      const sigId = uuidv7();
      const localPath = storeSignatureSvg(sigId, signatureSvg(strokes));
      const where = await currentPosition();
      const storagePath = signatureStoragePath(company.id, job!.id, sigId);
      services.sync.addSignature(
        sigId,
        company.id,
        {
          job_id: job!.id,
          purpose,
          signer_name: signer,
          signer_role: role.trim() || null,
          image_path: storagePath,
          signed_at: new Date().toISOString(),
          latitude: where?.latitude ?? null,
          longitude: where?.longitude ?? null,
        },
        { localPath, storagePath },
      );
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  }

  // No scrolling: a drag on the pad must draw, not move the page.
  return (
    <Screen scroll={false}>
      {purposes.length > 1 ? (
        <Choice label="For" options={purposes} value={purpose} onChange={setPurpose} />
      ) : (
        <T variant="strong">{purposes[0]!.label}</T>
      )}
      <Field
        label="Signer’s name"
        value={name ?? customer?.name ?? ""}
        onChangeText={setName}
        autoCapitalize="words"
        textContentType="name"
      />
      <Field
        label="Role (optional)"
        value={role}
        onChangeText={setRole}
        placeholder="Homeowner, property manager…"
      />
      <View style={{ gap: 8 }}>
        <T variant="label">Signature</T>
        <SignaturePad
          strokes={strokes}
          onChange={(s) => {
            setStrokes(s);
            setError(null);
          }}
        />
        <Row style={{ justifyContent: "flex-end" }}>
          <Button
            title="Clear"
            kind="quiet"
            onPress={() => setStrokes([])}
            disabled={strokes.length === 0}
          />
        </Row>
      </View>
      {error ? <Notice tone="error">{error}</Notice> : null}
      <Button title="Save Signature" onPress={() => void save()} loading={saving} />
    </Screen>
  );
}
