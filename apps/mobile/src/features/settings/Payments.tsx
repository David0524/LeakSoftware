import { useEffect, useState } from "react";
import { Linking, View } from "react-native";
import {
  AUTOPAY_RETRY_CHOICES,
  AUTOPAY_RETRY_DAY_CHOICES,
  AUTOPAY_TEXT,
  AUTO_SEND_FOOTER,
  AUTO_SEND_LABEL,
  autopaySettings,
  payOverTimeOn,
  INVOICE_DAYS,
  INVOICE_DAY_FOOTER,
  offersPool,
  ordinalDay,
  sendsMonthlyInvoices,
  dateFormat,
  shopInvoiceDay,
} from "@leakbook/core";
import type { JsonValue } from "@leakbook/sync";
import { payOverTimeStatusLine } from "../../data/autopay";
import { formChanged } from "../../lib/discard";
import { API_URL } from "../../lib/config";
import { getServices } from "../../lib/services";
import { useCompany } from "../../state/session";
import { Button, Group, Notice, Screen, Section, SwitchControl, T } from "../../ui/components";
import { haptics } from "../../ui/haptics";
import { useUnsavedChanges } from "../../ui/ModalSheet";
import { Select } from "../../ui/Select";
import { space } from "../../ui/theme";
import { ManagersOnly } from "./SettingsList";

// Settings › Payments and Deposits. Setting up customer payments is Stripe's, on the website;
// pool care shops set Monthly Invoices › Invoice Day here (owner, 2026-11-15;
// docs/design/2026-11-15-monthly-billing.md), as on the website's settings/payments page.
// company.settings is synced; owners and admins save through sync.

export function PaymentsSettings() {
  return (
    <ManagersOnly title="Payments and Deposits">
      <PaymentsPage />
    </ManagersOnly>
  );
}

function PaymentsPage() {
  const company = useCompany();
  const url = API_URL ? `${API_URL}/settings/payments` : null;
  return (
    <Screen title="Payments and Deposits" subtitle="How customers pay, and deposits">
      <T muted>Setting up customer payments happens with Stripe on the website.</T>
      {url ? (
        <Button
          title="Open on the Website"
          kind="secondary"
          onPress={() => void Linking.openURL(url)}
        />
      ) : null}
      <AutopaySettings />
      {offersPool(company.settings) ? <InvoiceDay /> : null}
    </Screen>
  );
}

/** A grouped row with a label and a switch, as the website's SSwitch. */
function SwitchRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <Group>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          minHeight: 44,
          paddingHorizontal: space["4"],
          paddingVertical: space["2"],
          gap: space["3"],
        }}
      >
        <T style={{ flex: 1 }}>{label}</T>
        <SwitchControl value={value} label={label} onValueChange={onChange} />
      </View>
    </Group>
  );
}

/**
 * Autopay and Pay Over Time (docs/design/2026-11-16-autopay.md), as the website's: the shop
 * offers autopay, how failed automatic payments are tried again, and Affirm and Klarna, with
 * whether Stripe has them on (asked from the server).
 */
function AutopaySettings() {
  const company = useCompany();
  const settings0 = company.settings as unknown as Record<string, unknown>;
  const a = autopaySettings(settings0);
  const saved = {
    on: a.on,
    retries: String(a.retries),
    days: String(a.retryDays),
    later: payOverTimeOn(settings0),
  };
  const [f, setF] = useState(saved);
  const [start, setStart] = useState(saved);
  const [notice, setNotice] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  useUnsavedChanges(formChanged(start, f));
  useEffect(() => {
    let live = true;
    void payOverTimeStatusLine(company.id).then((line) => live && setStatus(line));
    return () => {
      live = false;
    };
  }, [company.id, start.later]);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => {
    setNotice(null);
    setF((old) => ({ ...old, [k]: v }));
  };

  function save() {
    const settings = company.settings as unknown as Record<string, JsonValue>;
    getServices().sync.write("company", company.id, company.id, {
      settings: {
        ...settings,
        autopay: f.on,
        autopay_retries: Number(f.retries),
        autopay_retry_days: Number(f.days),
        pay_over_time: f.later,
      },
    });
    haptics.success();
    setStart(f);
    setNotice("Saved.");
  }

  return (
    <Section title="Autopay and pay over time">
      <View style={{ gap: space["4"] }}>
        {notice ? <Notice tone="success">{notice}</Notice> : null}
        <View style={{ gap: space["2"] }}>
          <SwitchRow label={AUTOPAY_TEXT.shopSwitch} value={f.on} onChange={(v) => set("on", v)} />
          <T variant="footnote" muted>
            {AUTOPAY_TEXT.shopFooter}
          </T>
        </View>
        <Select
          label={AUTOPAY_TEXT.retries}
          value={f.retries}
          onChange={(v) => set("retries", v)}
          options={AUTOPAY_RETRY_CHOICES.map((c) => ({ value: String(c.value), label: c.label }))}
        />
        <Select
          label={AUTOPAY_TEXT.retryEvery}
          value={f.days}
          onChange={(v) => set("days", v)}
          options={AUTOPAY_RETRY_DAY_CHOICES.map((c) => ({
            value: String(c.value),
            label: c.label,
          }))}
          hint={AUTOPAY_TEXT.retriesFooter}
        />
        <View style={{ gap: space["2"] }}>
          <SwitchRow
            label={AUTOPAY_TEXT.payOverTime}
            value={f.later}
            onChange={(v) => set("later", v)}
          />
          <T variant="footnote" muted>
            {`${AUTOPAY_TEXT.payOverTimeFooter}${status ? ` ${status}` : ""}`}
          </T>
        </View>
        <Button title="Save" wide kind="secondary" onPress={save} />
      </View>
    </Section>
  );
}

/** Monthly Invoices › Invoice Day: the day of the next month each month's invoice is drafted. */
function InvoiceDay() {
  const company = useCompany();
  const settings0 = company.settings as unknown as Record<string, unknown>;
  const saved = { day: String(shopInvoiceDay(settings0)), auto: sendsMonthlyInvoices(settings0) };
  const [day, setDay] = useState(saved.day);
  const [auto, setAuto] = useState(saved.auto);
  const [start, setStart] = useState(saved);
  const [notice, setNotice] = useState<string | null>(null);
  // Unsaved entries ask before leaving (owner, 2026-10-20: "Discard changes?" everywhere).
  useUnsavedChanges(formChanged({ day: start.day, auto: start.auto }, { day, auto }));

  function save() {
    const settings = company.settings as unknown as Record<string, JsonValue>;
    // Send Automatically (owner, 2026-11-16) counts from the day it's switched on, so a backlog
    // never goes out by itself (as the website's saveInvoiceDay).
    const today = dateFormat("en-CA", { timeZone: company.timezone }).format(new Date());
    const from =
      settings.send_monthly_invoices === true &&
      typeof settings.send_monthly_invoices_from === "string"
        ? settings.send_monthly_invoices_from
        : today;
    getServices().sync.write("company", company.id, company.id, {
      settings: {
        ...settings,
        invoice_day: Number(day),
        send_monthly_invoices: auto,
        send_monthly_invoices_from: auto ? from : null,
      },
    });
    haptics.success();
    setStart({ day, auto });
    setNotice("Saved.");
  }

  return (
    <Section title="Monthly invoices">
      <View style={{ gap: space["4"] }}>
        {notice ? <Notice tone="success">{notice}</Notice> : null}
        <Select
          label="Invoice Day"
          value={day}
          onChange={(v) => {
            setNotice(null);
            setDay(v);
          }}
          options={INVOICE_DAYS.map((d) => ({ value: String(d), label: ordinalDay(d) }))}
          hint={INVOICE_DAY_FOOTER}
        />
        <View style={{ gap: space["2"] }}>
          <Group>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                minHeight: 44,
                paddingHorizontal: space["4"],
                paddingVertical: space["2"],
                gap: space["3"],
              }}
            >
              <T style={{ flex: 1 }}>{AUTO_SEND_LABEL}</T>
              <SwitchControl
                value={auto}
                label={AUTO_SEND_LABEL}
                onValueChange={(v) => {
                  setNotice(null);
                  setAuto(v);
                }}
              />
            </View>
          </Group>
          <T variant="footnote" muted>
            {AUTO_SEND_FOOTER}
          </T>
        </View>
        <Button title="Save" wide onPress={save} />
      </View>
    </Section>
  );
}
