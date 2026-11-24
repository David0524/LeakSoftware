import { useState } from "react";
import { StyleSheet, View } from "react-native";
import {
  REFUND_AMOUNT_LABEL,
  REFUND_BUTTON,
  REFUND_FULL,
  REFUND_OFFLINE,
  REFUND_PART,
  REFUND_TITLE,
  friendlyError,
  refundAmount,
  refundButtonText,
  refundExplainer,
  refundableCents,
  type RefundablePayment,
} from "@leakbook/core";
import { refundPayment } from "../../data/invoices";
import { useSyncStatus } from "../../data/hooks";
import { ReportServerError, reportsOnline } from "../../data/reports";
import { ModalSheet, useUnsavedChanges } from "../../ui/ModalSheet";
import { Button, Field, Notice, Segmented, T } from "../../ui/components";
import { haptics } from "../../ui/haptics";
import { space } from "../../ui/theme";

// Refunds (owner, 2026-11-24: "how would we reverse a charge?"), as the website's invoice panel
// and the iPhone's invoice, with @leakbook/core's rules and words: owners and admins send a card
// or bank payment back through the shop's Stripe account, all of it or part. The refund is the
// server's, so it needs a connection; the payment's change syncs down.

type Mode = "full" | "part";

const MODES: { value: Mode; label: string }[] = [
  { value: "full", label: REFUND_FULL },
  { value: "part", label: REFUND_PART },
];

/** Refund Payment, as a sheet: the explainer, Refund Full or Refund Part, then the red button. */
export function RefundSheet({
  payment,
  onClose,
  onRefunded,
}: {
  payment: RefundablePayment & { id: string };
  onClose: () => void;
  /** Called with the server's message ("Refunded $20.00.") once the refund went through. */
  onRefunded: (message: string) => void;
}) {
  return (
    <ModalSheet visible onClose={onClose} title={REFUND_TITLE}>
      <RefundForm payment={payment} onRefunded={onRefunded} />
    </ModalSheet>
  );
}

function RefundForm({
  payment,
  onRefunded,
}: {
  payment: RefundablePayment & { id: string };
  onRefunded: (message: string) => void;
}) {
  const [mode, setMode] = useState<Mode>("full");
  const [typed, setTyped] = useState("");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const offline = useSyncStatus().phase === "offline" || !reportsOnline;
  const part = mode === "part";
  const refundable = refundableCents(payment);
  const amount = refundAmount(part, typed, refundable);
  const amountError =
    "error" in amount && (!part || tried || typed.trim() !== "") ? amount.error : null;
  // An amount typed but not refunded asks before leaving (owner, 2026-10-20).
  useUnsavedChanges(part && Boolean(typed.trim()));

  async function refund() {
    setTried(true);
    if ("error" in amount) return;
    setBusy(true);
    setError(null);
    try {
      const r = await refundPayment(payment.id, part ? amount.cents : null);
      haptics.success();
      setTyped("");
      onRefunded(r.message);
    } catch (e) {
      haptics.warning();
      setError(
        e instanceof ReportServerError && e.status === null && /connection/i.test(e.message)
          ? REFUND_OFFLINE
          : friendlyError(e),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.stack} testID="refund-payment">
      <T>{refundExplainer(payment.method)}</T>
      <Segmented
        options={MODES}
        value={mode}
        onChange={(m) => {
          setMode(m);
          setTried(false);
          setError(null);
        }}
        accessibilityLabel={REFUND_TITLE}
      />
      {part ? (
        <Field
          label={REFUND_AMOUNT_LABEL}
          keyboardType="decimal-pad"
          value={typed}
          onChangeText={(v) => {
            setTyped(v);
            setError(null);
          }}
          error={amountError ?? undefined}
        />
      ) : amountError ? (
        <Notice tone="error">{amountError}</Notice>
      ) : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      <Button
        title={"cents" in amount ? refundButtonText(amount.cents) : REFUND_BUTTON}
        kind="danger"
        wide
        loading={busy}
        disabled={busy || offline || (!part && "error" in amount)}
        onPress={() => refund()}
      />
      {offline ? <Notice>{REFUND_OFFLINE}</Notice> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space[3] },
});
