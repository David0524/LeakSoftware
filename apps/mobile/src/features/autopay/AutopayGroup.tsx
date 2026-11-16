import { useState } from "react";
import { Linking, View } from "react-native";
import {
  AUTOPAY_TEXT,
  autopayGroupFooter,
  autopayInvoiceLine,
  autopaySettings,
  autopayStatus,
  chargeConfirm,
  cardFeeBps,
  friendlyError,
  localDate,
  savedMethodDetail,
  savedMethodLabel,
  type AutopayInvoice,
} from "@leakbook/core";
import { autopayAction, chargeCardOnFile, useSavedMethod } from "../../data/autopay";
import { useLine } from "../../data/texting";
import { useCompany } from "../../state/session";
import { Button, Group, ListRow, Notice, Section, T } from "../../ui/components";
import { chooseAction, confirmAlert, confirmDestructive } from "../../ui/confirm";
import { haptics } from "../../ui/haptics";
import { space } from "../../ui/theme";

// Autopay (docs/design/2026-11-16-autopay.md): the customer page's Autopay group and an
// invoice's Charge Card on File, as the website's components/autopay.tsx, with the same words.

type Message = { tone: "success" | "error"; text: string } | null;

/** The customer page's Autopay group (owners and admins). */
export function AutopayGroup({
  customer,
}: {
  customer: {
    id: string;
    name: string;
    email?: string | null;
    phone?: string | null;
    autopay?: boolean | null;
  };
}) {
  const company = useCompany();
  const method = useSavedMethod(company.id, customer.id);
  const line = useLine(company.id);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const autopay = Boolean(customer.autopay);
  const shopOn = autopaySettings(company.settings).on;
  const status = autopayStatus(autopay, method);
  const today = localDate(new Date(), company.timezone);

  async function run(action: Parameters<typeof autopayAction>[1], channel?: "email" | "text") {
    setBusy(true);
    setMessage(null);
    try {
      const r = await autopayAction(customer.id, action, channel);
      haptics.success();
      setMessage({ tone: "success", text: r.message });
    } catch (e) {
      setMessage({ tone: "error", text: friendlyError(e) });
    } finally {
      setBusy(false);
    }
  }

  /** Text from my phone: the link in the phone's own Messages, as invoices are. */
  async function textFromPhone() {
    setBusy(true);
    setMessage(null);
    try {
      const r = await autopayAction(customer.id, "request", "link");
      const to = (customer.phone ?? "").replace(/[^\d+]/g, "");
      await Linking.openURL(`sms:${to}?body=${encodeURIComponent(r.text ?? r.link ?? "")}`);
    } catch (e) {
      setMessage({ tone: "error", text: friendlyError(e) });
    } finally {
      setBusy(false);
    }
  }

  function request() {
    const actions = [
      ...(customer.email
        ? [{ label: `Email ${customer.email}`, onPress: () => void run("request", "email") }]
        : []),
      ...(customer.phone && line?.status === "active"
        ? [{ label: "Text from Shop Number", onPress: () => void run("request", "text") }]
        : []),
      ...(customer.phone
        ? [{ label: "Text from My Phone", onPress: () => void textFromPhone() }]
        : []),
    ];
    if (actions.length === 0) {
      setMessage({ tone: "error", text: "Add the customer’s email or mobile number first." });
      return;
    }
    chooseAction({
      title: AUTOPAY_TEXT.requestTitle,
      message:
        "The customer gets a secure link to save a card or bank account. Nothing is charged until an invoice is sent.",
      actions,
    });
  }

  return (
    <Section title={AUTOPAY_TEXT.group} footer={autopayGroupFooter(shopOn, autopay, method)}>
      <View style={{ gap: space["3"] }}>
        <Group>
          <ListRow title={AUTOPAY_TEXT.status} detail={status.value} />
          {method ? (
            <ListRow title={savedMethodLabel(method)} subtitle={savedMethodDetail(method, today)} />
          ) : (
            <ListRow>
              <T muted>{AUTOPAY_TEXT.noMethod}</T>
            </ListRow>
          )}
          {method && autopay ? (
            <ListRow
              title={AUTOPAY_TEXT.turnOff}
              tone="link"
              onPress={() =>
                busy
                  ? undefined
                  : confirmAlert({
                      title: AUTOPAY_TEXT.turnOffTitle,
                      message: AUTOPAY_TEXT.turnOffMessage,
                      confirm: AUTOPAY_TEXT.turnOff,
                      onConfirm: () => void run("turn_off"),
                    })
              }
            />
          ) : null}
          {method && !autopay && shopOn ? (
            <ListRow
              title={AUTOPAY_TEXT.turnOn}
              tone="link"
              onPress={() => (busy ? undefined : void run("turn_on"))}
            />
          ) : null}
          <ListRow
            title={AUTOPAY_TEXT.request}
            tone="link"
            onPress={() => (busy ? undefined : request())}
          />
          {method ? (
            <ListRow
              title={AUTOPAY_TEXT.remove}
              tone="destructive"
              onPress={() =>
                busy
                  ? undefined
                  : confirmDestructive({
                      title: AUTOPAY_TEXT.removeTitle,
                      message: AUTOPAY_TEXT.removeMessage,
                      confirm: AUTOPAY_TEXT.remove,
                      onConfirm: () => void run("remove"),
                    })
              }
            />
          ) : null}
        </Group>
        {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
      </View>
    </Section>
  );
}

/**
 * An invoice's automatic charge ("Paid automatically with Visa •••• 4242", or the failure), and
 * Charge Card on File for owners and admins while something is owed.
 */
export function InvoiceAutopay({
  invoice,
  customer,
  balanceCents,
  canCharge,
}: {
  invoice: AutopayInvoice & { id: string; status: string };
  customer: { id: string; name: string } | undefined;
  balanceCents: number;
  canCharge: boolean;
}) {
  const company = useCompany();
  const method = useSavedMethod(company.id, customer?.id);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const line = autopayInvoiceLine(invoice);
  const owed =
    (invoice.status === "sent" || invoice.status === "partially_paid") && balanceCents > 0;
  const show = canCharge && method && owed && invoice.autopay_status !== "processing";
  if (!line && !show && !message) return null;

  function charge() {
    if (!method || !customer) return;
    const c = chargeConfirm({
      method,
      balanceCents,
      feeBps: cardFeeBps(company.settings),
      customer: customer.name,
    });
    confirmAlert({
      title: c.title,
      message: c.message,
      confirm: c.confirm,
      onConfirm: () =>
        void (async () => {
          setBusy(true);
          setMessage(null);
          try {
            const r = await chargeCardOnFile(invoice.id);
            if (r.outcome === "failed") haptics.warning();
            else haptics.success();
            setMessage({ tone: r.outcome === "failed" ? "error" : "success", text: r.message });
          } catch (e) {
            setMessage({ tone: "error", text: friendlyError(e) });
          } finally {
            setBusy(false);
          }
        })(),
    });
  }

  return (
    <View style={{ gap: space["2"] }}>
      {line ? (
        <T variant="secondary" muted={invoice.autopay_status !== "failed"}>
          {line}
        </T>
      ) : null}
      {show ? (
        <Button
          title={busy ? "Charging…" : AUTOPAY_TEXT.charge}
          kind="secondary"
          disabled={busy}
          onPress={charge}
        />
      ) : null}
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
    </View>
  );
}
