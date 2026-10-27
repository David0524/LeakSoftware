import { useEffect, useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import {
  ANY_CITY,
  LAST_JOB_CHOICES,
  MASS_EMAIL_HISTORY_EMPTY,
  MASS_EMAIL_LIMITS,
  MASS_EMAIL_MESSAGE_NOTE,
  MASS_EMAIL_NO_ADDRESS,
  MASS_EMAIL_TITLE,
  massEmailConfirm,
  massEmailCountText,
  massEmailErrors,
  massEmailHistoryText,
  massEmailLimitText,
  massEmailSendLabel,
} from "@leakbook/core";
import {
  loadMassEmail,
  massEmailError,
  sendMassEmail,
  testMassEmail,
  useMassEmailCount,
  type MassEmailSetup,
} from "../../../../data/massEmail";
import { useCompany } from "../../../../state/session";
import {
  Button,
  FieldGroup,
  FieldRow,
  Group,
  ListRow,
  Notice,
  PickerRow,
  Screen,
  Section,
  T,
} from "../../../../ui/components";
import { useDiscardChanges } from "../../../../ui/discard";
import { DraftNote } from "../../../../ui/DraftNote";
import { useDraft } from "../../../../ui/useDraft";
import { color, space } from "../../../../ui/theme";

/**
 * Customers › Email Customers (owner, 2026-10-22: "send mass email (with some filtering)"), as
 * the website's (apps/web/src/components/mass-email.tsx): To (Show, City, Last Job) with the
 * server's live count, Subject and Message, Send to N Customers after an alert, Send Test to
 * Me, and the mass emails sent before. Offline it says sending needs a connection and keeps
 * what was typed.
 */
export default function EmailCustomers() {
  const company = useCompany();
  const [setup, setSetup] = useState<MassEmailSetup | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [show, setShow] = useState("all");
  const [city, setCity] = useState("");
  const [days, setDays] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [fields, setFields] = useState<{ subject?: string; body?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  // A message typed and not sent: leaving asks "Discard changes?" (owner, 2026-10-20: everywhere).
  // What was typed is kept as a draft until it's sent or discarded (owner, 2026-10-27).
  const draft = useDraft({
    form: "mass-email",
    fields: { subject, body },
    restore: (c) => {
      if (c.subject !== undefined) setSubject(c.subject);
      if (c.body !== undefined) setBody(c.body);
    },
  });
  useDiscardChanges(subject.trim() !== "" || body.trim() !== "", draft.clear);
  const audience = { show, city: city || null, days: days ? Number(days) : null };
  const { count, counting, error: countError } = useMassEmailCount(company.id, audience);

  function load() {
    loadMassEmail(company.id)
      .then((s) => {
        setSetup(s);
        setLoadError(null);
      })
      .catch((e: unknown) => setLoadError(massEmailError(e)));
  }
  useEffect(load, [company.id]);

  const recipients = count?.recipients ?? 0;
  const blocked = !setup?.shop.address || setup?.configured === false;
  const overLimit = !!setup && recipients > setup.left;
  const words = count ? massEmailCountText(count) : null;

  function checkFields() {
    const errors = massEmailErrors(subject, body);
    setFields(errors);
    return Object.keys(errors).length === 0;
  }

  async function sendTest() {
    setError(null);
    setMessage(null);
    if (!checkFields()) return;
    setSending(true);
    try {
      setMessage((await testMassEmail(company.id, subject, body)).message);
    } catch (e) {
      setError(massEmailError(e));
    } finally {
      setSending(false);
    }
  }

  function askToSend() {
    setError(null);
    setMessage(null);
    if (!checkFields() || !setup) return;
    const ask = massEmailConfirm(recipients, subject, setup.shop.name);
    Alert.alert(ask.title, ask.message, [
      { text: "Cancel", style: "cancel" },
      { text: ask.confirmLabel, onPress: () => void send() },
    ]);
  }

  async function send() {
    setSending(true);
    try {
      const r = await sendMassEmail(company.id, { subject, body, audience, expected: recipients });
      setMessage(r.message);
      setSubject("");
      setBody("");
      draft.clear();
      load();
    } catch (e) {
      setError(massEmailError(e));
    } finally {
      setSending(false);
    }
  }

  const thisYear = new Date().getFullYear();
  const day = (iso: string) =>
    new Date(iso).toLocaleDateString("en-US", {
      timeZone: company.timezone,
      month: "short",
      day: "numeric",
      ...(new Date(iso).getFullYear() !== thisYear ? { year: "numeric" } : {}),
    });

  return (
    <Screen title={MASS_EMAIL_TITLE}>
      <DraftNote draft={draft} />
      {loadError ? <Notice tone="error">{loadError}</Notice> : null}
      {setup && !setup.shop.address ? (
        <Notice tone="warning">{MASS_EMAIL_NO_ADDRESS}</Notice>
      ) : null}
      {setup && !setup.configured ? (
        <Notice tone="warning">Email isn’t set up yet. Try again later.</Notice>
      ) : null}
      {setup ? (
        <>
          <Section
            title="To"
            footer={
              <View style={styles.count} accessibilityLiveRegion="polite">
                {words ? (
                  <T variant="footnote" muted>
                    <T variant="footnote" style={{ fontWeight: "600", color: color.text }}>
                      {words.count}
                    </T>
                    {words.skipped ? ` ${words.skipped}` : ""}
                  </T>
                ) : (
                  <T variant="footnote" muted>
                    {counting ? "Counting…" : (countError ?? "Couldn’t count.")}
                  </T>
                )}
                {count && overLimit ? (
                  <T variant="footnote" style={{ color: color.fail }}>
                    {massEmailLimitText(setup.left)}
                  </T>
                ) : null}
              </View>
            }
          >
            <Group>
              <PickerRow label="Show" options={setup.shows} value={show} onChange={setShow} />
              <PickerRow
                label="City"
                options={[
                  { value: "", label: ANY_CITY },
                  ...setup.cities.map((c) => ({ value: c, label: c })),
                ]}
                value={city}
                onChange={setCity}
              />
              <PickerRow
                label="Last Job"
                options={LAST_JOB_CHOICES.map((c) => ({
                  value: c.days ? String(c.days) : "",
                  label: c.label,
                }))}
                value={days}
                onChange={setDays}
              />
            </Group>
          </Section>

          <FieldGroup title="Message" footer={MASS_EMAIL_MESSAGE_NOTE} labelWidth={84}>
            <FieldRow
              label="Subject"
              value={subject}
              onChangeText={setSubject}
              maxLength={MASS_EMAIL_LIMITS.subject}
              error={fields.subject}
            />
            <FieldRow
              label="Message"
              value={body}
              onChangeText={setBody}
              multiline
              maxLength={MASS_EMAIL_LIMITS.body}
              placeholder="Hi {first name},"
              error={fields.body}
            />
          </FieldGroup>

          <View style={styles.buttons}>
            {error ? <Notice tone="error">{error}</Notice> : null}
            {message ? <Notice tone="success">{message}</Notice> : null}
            <Button
              title={sending ? "Sending…" : massEmailSendLabel(recipients)}
              wide
              loading={sending}
              disabled={sending || counting || blocked || !count || recipients === 0 || overLimit}
              onPress={askToSend}
            />
            <Button
              title="Send Test to Me"
              kind="secondary"
              wide
              disabled={sending || blocked}
              onPress={() => void sendTest()}
            />
          </View>

          <Section title="Sent">
            <Group>
              {setup.history.length === 0 ? (
                <ListRow title={MASS_EMAIL_HISTORY_EMPTY} />
              ) : (
                setup.history.map((c) => (
                  <ListRow
                    key={c.id}
                    title={c.subject}
                    subtitle={`${day(c.created_at)} · ${massEmailHistoryText(c)}`}
                  />
                ))
              )}
            </Group>
          </Section>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  count: { gap: space["1"] },
  buttons: { gap: space["3"] },
});
