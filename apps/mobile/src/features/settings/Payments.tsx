import { useState } from "react";
import { Linking, View } from "react-native";
import {
  INVOICE_DAYS,
  INVOICE_DAY_FOOTER,
  offersPool,
  ordinalDay,
  shopInvoiceDay,
} from "@leakbook/core";
import type { JsonValue } from "@leakbook/sync";
import { formChanged } from "../../lib/discard";
import { API_URL } from "../../lib/config";
import { getServices } from "../../lib/services";
import { useCompany } from "../../state/session";
import { Button, Notice, Screen, Section, T } from "../../ui/components";
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
      {offersPool(company.settings) ? <InvoiceDay /> : null}
    </Screen>
  );
}

/** Monthly Invoices › Invoice Day: the day of the next month each month's invoice is drafted. */
function InvoiceDay() {
  const company = useCompany();
  const saved = String(shopInvoiceDay(company.settings as unknown as Record<string, unknown>));
  const [day, setDay] = useState(saved);
  const [start, setStart] = useState(saved);
  const [notice, setNotice] = useState<string | null>(null);
  // Unsaved entries ask before leaving (owner, 2026-10-20: "Discard changes?" everywhere).
  useUnsavedChanges(formChanged({ day: start }, { day }));

  function save() {
    const settings = company.settings as unknown as Record<string, JsonValue>;
    getServices().sync.write("company", company.id, company.id, {
      settings: { ...settings, invoice_day: Number(day) },
    });
    haptics.success();
    setStart(day);
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
        <Button title="Save" wide onPress={save} />
      </View>
    </Section>
  );
}
