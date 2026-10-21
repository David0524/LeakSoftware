import { router, Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import {
  MIN_INK,
  enabledSignaturePurposes,
  formatAddress,
  inkLength,
  signatureStatement,
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
import {
  Button,
  Card,
  Field,
  HeaderButton,
  Notice,
  Screen,
  Segmented,
  T,
} from "../../../../ui/components";
import { signerNameError } from "../../../../lib/limits";
import { useDiscardChanges } from "../../../../ui/discard";
import { haptics } from "../../../../ui/haptics";
import { PadBlock } from "../../../../features/report/PadBlock";
import { face, space } from "../../../../ui/theme";

/**
 * A signature on its own (spec 6.7): the work authorization, signed before the work, or a quote
 * accepted on site (?quote={id}). The tech hands the phone over: the statement in a card, the
 * customer's name already filled in, the pad, then Sign. Works offline; the drawing uploads
 * later.
 */
export default function SignatureScreen() {
  const { id, quote: quoteId } = useLocalSearchParams<{ id: string; quote?: string }>();
  const company = useCompany();
  const { services } = useSession();
  const job = useRow<Job>("job", id);
  const property = useRow<Property>("property", job?.property_id);
  const customer = useRow<Customer>("customer", job?.bill_to_customer_id ?? property?.customer_id);
  const purposes: { value: SignaturePurpose; label: string }[] = quoteId
    ? [{ value: "quote_acceptance", label: "Quote accepted" }]
    : // The visit's sign-off is signed at the end of the report (review.tsx).
      enabledSignaturePurposes(company.settings).filter((p) => p.value === "work_authorization");
  const [purpose, setPurpose] = useState<SignaturePurpose | null>(purposes[0]?.value ?? null);
  const [name, setName] = useState<string | null>(null);
  const [role, setRole] = useState("");
  const [strokes, setStrokes] = useState<SignatureStroke[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [drawing, setDrawing] = useState(false);
  // A drawn signature or a typed name or role isn't thrown away without asking (owner,
  // 2026-10-20).
  const leave = useDiscardChanges(
    !saving &&
      (strokes.length > 0 ||
        (name !== null && name.trim() !== (customer?.name ?? "").trim()) ||
        role.trim() !== ""),
  );

  const bar = (
    <Stack.Screen
      options={{
        title: company.name,
        headerBackVisible: false,
        headerLeft: () => <HeaderButton title="Cancel" onPress={() => router.back()} />,
      }}
    />
  );

  if (!job) {
    return (
      <Screen>
        {bar}
        <Notice tone="warning">This job isn’t on this phone.</Notice>
      </Screen>
    );
  }
  if (purposes.length === 0) {
    return (
      <Screen>
        {bar}
        <Notice tone="warning">Signatures are turned off in your company settings.</Notice>
      </Screen>
    );
  }

  const signer = (name ?? customer?.name ?? "").trim();
  const address = property ? formatAddress(property) : null;

  async function save() {
    if (!purpose) return setError("Choose what this signature is for.");
    if (!signer) return setError("Enter your name.");
    const tooLong = signerNameError(signer);
    if (tooLong) return setError(tooLong);
    if (inkLength(strokes) < MIN_INK) return setError("Sign in the box with your finger.");
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
          quote_id: quoteId ?? null,
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
      haptics.success();
      leave(() => router.back());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  }

  // The page scrolls (Sign must stay reachable on small phones and with the keyboard up), but
  // holds still while a finger is on the pad, so a drag draws instead of moving the page.
  return (
    <Screen scrollEnabled={!drawing}>
      {bar}
      <View style={styles.form}>
        <View>
          <T variant="secondary" muted style={face.semiBold}>
            {purposes.find((p) => p.value === purpose)?.label ?? "Signature"}
          </T>
          <T variant="largeTitle">Please Sign</T>
        </View>
        {purposes.length > 1 ? (
          <Segmented label="Signing for" options={purposes} value={purpose} onChange={setPurpose} />
        ) : null}
        {purpose ? (
          <Card>
            <T style={styles.statement}>{signatureStatement(purpose, company.name, address)}</T>
          </Card>
        ) : null}
        {/* The signer is the customer, so the phone doesn't offer the tech's own name. */}
        <Field
          label="Your name"
          value={name ?? customer?.name ?? ""}
          onChangeText={setName}
          autoCapitalize="words"
          autoCorrect={false}
          autoComplete="off"
          textContentType="none"
        />
        <Field
          label="Role (optional)"
          value={role}
          onChangeText={setRole}
          placeholder="Homeowner, property manager…"
          autoComplete="off"
          textContentType="none"
        />
        <PadBlock
          strokes={strokes}
          setStrokes={setStrokes}
          setDrawing={setDrawing}
          onInk={() => setError(null)}
        />
        {error ? <Notice tone="error">{error}</Notice> : null}
        <Button
          title={saving ? "Saving…" : "Sign"}
          wide
          disabled={saving}
          onPress={() => void save()}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { gap: space["4"] },
  statement: { fontSize: 19, lineHeight: 28 },
});
