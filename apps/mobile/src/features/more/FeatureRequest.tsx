import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { call } from "../../data/reports";
import { useSession, useSyncStatus } from "../../state/session";
import { Button, Field, ListRow, Notice } from "../../ui/components";
import { ModalSheet } from "../../ui/ModalSheet";
import { space } from "../../ui/theme";

// The website's messages (apps/web/src/server/feature-requests.ts).
const EMPTY = "Tell us what you’d like Sundeck Pro to do.";
const OFFLINE = "No connection. Try again when you have signal.";

/**
 * Request a Feature (owner, 2026-10-19: "a text box built into the platform"): a Help row that
 * opens a sheet with one box, as the website's (components/feature-request.tsx). It posts to
 * the website's /api/feature-requests, which saves it like the website's. Offline, it says so
 * and keeps the text.
 */
export function FeatureRequestRow() {
  const [open, setOpen] = useState(false);
  // A new form each time the sheet opens, so a sent request doesn't stay "sent".
  const [round, setRound] = useState(0);
  return (
    <>
      <ListRow
        title="Request a Feature"
        tone="link"
        onPress={() => {
          setRound((n) => n + 1);
          setOpen(true);
        }}
      />
      <ModalSheet visible={open} onClose={() => setOpen(false)} title="Request a Feature">
        <RequestForm key={round} onDone={() => setOpen(false)} />
      </ModalSheet>
    </>
  );
}

function RequestForm({ onDone }: { onDone: () => void }) {
  const { company } = useSession();
  const status = useSyncStatus();
  const [text, setText] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [thanks, setThanks] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function send() {
    const request = text.trim();
    if (!request) return setFieldError(EMPTY);
    setFieldError(undefined);
    setError(null);
    if (status.phase === "offline") return setError(OFFLINE);
    setPending(true);
    try {
      const r = await call<{ message: string }>("/api/feature-requests", {
        request,
        company_id: company?.id,
        page: "Android app",
      });
      setThanks(r.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : OFFLINE);
    } finally {
      setPending(false);
    }
  }

  if (thanks)
    return (
      <View style={styles.form}>
        <Notice tone="success">{thanks}</Notice>
        <Button title="Done" wide onPress={onDone} />
      </View>
    );
  return (
    <View style={styles.form}>
      <Field
        label="What would make Sundeck Pro better for your shop?"
        value={text}
        onChangeText={(v) => {
          setText(v);
          if (fieldError) setFieldError(undefined);
        }}
        multiline
        maxLength={4000}
        placeholder="Describe the feature and how you’d use it."
        error={fieldError}
      />
      {error ? <Notice tone="error">{error}</Notice> : null}
      <Button
        title={pending ? "Sending…" : "Send Request"}
        wide
        disabled={pending}
        onPress={() => void send()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: space["4"] },
});
