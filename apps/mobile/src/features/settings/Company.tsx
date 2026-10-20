import * as ImagePicker from "expo-image-picker";
import { useEffect, useMemo, useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import { isHexColor, offersLeak, parseReminderDays, type Job } from "@leakbook/core";
import type { JsonValue } from "@leakbook/sync";
import { useRows } from "../../data/hooks";
import { useAddressSuggestions } from "../address/AddressSuggestions";
import { locateAfterSync } from "../../lib/locate";
import { getServices } from "../../lib/services";
import { useCompany } from "../../state/session";
import {
  Button,
  FieldGroup,
  FieldRow,
  Notice,
  Screen,
  Section,
  T,
  Toggle,
} from "../../ui/components";
import { haptics } from "../../ui/haptics";
import { Select } from "../../ui/Select";
import { color, space } from "../../ui/theme";
import { ManagersOnly } from "./SettingsList";
import { formChanged } from "../../lib/discard";
import { isWebUrl, REVIEW_URL_ERROR } from "../../lib/limits";
import { useUnsavedChanges } from "../../ui/ModalSheet";

// Settings › Company and Branding (the website's settings/company): the company profile,
// reminders and reviews, report terms, the next job number, and branding. The company row is
// synced; owners and admins write it through sync, so it saves offline. A new address drops
// the shop's old map location in the same write, and the server finds the new one once it's
// up. Services (what the shop does) changes the shop's package and price, so it stays on the
// website with Billing.

const US_ZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
];

type Row = Record<string, unknown>;
const str = (row: Row, k: string) => (typeof row[k] === "string" ? (row[k] as string) : "");

export function CompanySettings() {
  return (
    <ManagersOnly title="Company and Branding">
      <CompanyPage />
    </ManagersOnly>
  );
}

function CompanyPage() {
  const company = useCompany();
  const row = company as unknown as Row;
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const said = (text: string, tone: "success" | "error" = "success") => setNotice({ tone, text });
  return (
    <Screen title="Company and Branding" subtitle="Shown on reports, quotes, and invoices.">
      {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}
      <Profile row={row} onSaved={said} />
      <Followups row={row} onSaved={said} />
      {offersLeak(company.settings) ? <ReportTerms row={row} onSaved={said} /> : null}
      <JobNumbers onSaved={said} />
      <Branding row={row} onSaved={said} />
    </Screen>
  );
}

type Said = (text: string, tone?: "success" | "error") => void;

/** Writes the shop's row through sync (owners and admins). */
function useWriteCompany() {
  const company = useCompany();
  return (values: Record<string, JsonValue>) =>
    getServices().sync.write("company", company.id, company.id, values);
}

function Profile({ row, onSaved }: { row: Row; onSaved: Said }) {
  const company = useCompany();
  const write = useWriteCompany();
  const [f, setF] = useState({
    name: str(row, "name"),
    legal_name: str(row, "legal_name"),
    phone: str(row, "phone"),
    email: str(row, "email"),
    address_line1: str(row, "address_line1"),
    address_line2: str(row, "address_line2"),
    city: str(row, "city"),
    state: str(row, "state"),
    postal_code: str(row, "postal_code"),
    review_url: str(row, "review_url"),
    timezone: company.timezone,
  });
  // Unsaved entries ask before leaving (owner, 2026-10-20: "Discard changes?" everywhere).
  const entries = f;
  const [startEntries, setStartEntries] = useState(entries);
  useUnsavedChanges(formChanged(startEntries, entries));
  const [error, setError] = useState<string | undefined>();
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  // Real addresses as the street is typed (owner, 2026-10-20); picking one fills the rest.
  const suggestions = useAddressSuggestions(f.address_line1, (s) =>
    setF((x) => ({
      ...x,
      address_line1: s.line1,
      city: s.city,
      state: s.state,
      postal_code: s.postal_code,
    })),
  );
  const zones = US_ZONES.includes(company.timezone) ? US_ZONES : [company.timezone, ...US_ZONES];

  function save() {
    if (!f.name.trim()) return setError("Enter the company name.");
    // It goes into customer emails as a link: web pages only (the website's rule).
    if (f.review_url.trim() && !isWebUrl(f.review_url.trim())) return setError(REVIEW_URL_ERROR);
    setError(undefined);
    const opt = (v: string) => v.trim() || null;
    const address = {
      address_line1: opt(f.address_line1),
      address_line2: opt(f.address_line2),
      city: opt(f.city),
      state: f.state.trim().toUpperCase() || null,
      postal_code: opt(f.postal_code),
    };
    // Every route starts at the shop: a new address drops the old map location, and the server
    // finds the new one once this is up.
    const moved = (Object.keys(address) as (keyof typeof address)[]).some(
      (k) => ((row[k] as string | null | undefined) ?? null) !== address[k],
    );
    write({
      name: f.name.trim(),
      legal_name: opt(f.legal_name),
      phone: opt(f.phone),
      email: opt(f.email),
      ...address,
      review_url: opt(f.review_url),
      timezone: f.timezone,
      ...(moved ? { latitude: null, longitude: null, geocoded_address: null } : {}),
    });
    if (moved) void locateAfterSync(company.id, { shop: true });
    haptics.success();
    setStartEntries(entries);
    onSaved("Saved.");
  }

  return (
    <View style={styles.part}>
      <FieldGroup title="Company profile" labelWidth={120}>
        <FieldRow label="Company name" value={f.name} onChangeText={set("name")} error={error} />
        <FieldRow
          label="Legal name"
          value={f.legal_name}
          onChangeText={set("legal_name")}
          hint="If different, for invoices."
        />
        <FieldRow
          label="Phone"
          value={f.phone}
          onChangeText={set("phone")}
          keyboardType="phone-pad"
        />
        <FieldRow
          label="Email"
          value={f.email}
          onChangeText={set("email")}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <FieldRow
          label="Street address"
          value={f.address_line1}
          onChangeText={set("address_line1")}
        />
        {suggestions}
        <FieldRow
          label="Address line 2"
          value={f.address_line2}
          onChangeText={set("address_line2")}
        />
        <FieldRow label="City" value={f.city} onChangeText={set("city")} />
        <FieldRow
          label="State"
          value={f.state}
          onChangeText={set("state")}
          maxLength={2}
          autoCapitalize="characters"
        />
        <FieldRow
          label="ZIP"
          value={f.postal_code}
          onChangeText={set("postal_code")}
          keyboardType="number-pad"
        />
        <FieldRow
          label="Review link"
          value={f.review_url}
          onChangeText={set("review_url")}
          keyboardType="url"
          autoCapitalize="none"
          hint="Your Google or Yelp page. Review requests link here."
        />
      </FieldGroup>
      <Select
        label="Time zone"
        value={f.timezone}
        onChange={set("timezone")}
        options={zones.map((z) => ({ value: z, label: z.replace("_", " ") }))}
      />
      <Button title="Save" kind="secondary" onPress={save} />
    </View>
  );
}

function Followups({ row, onSaved }: { row: Row; onSaved: Said }) {
  const company = useCompany();
  const write = useWriteCompany();
  const settings = company.settings as {
    reminders?: { quote_days?: number[]; invoice_days?: number[] };
    review_requests?: boolean;
  };
  const [quote, setQuote] = useState((settings.reminders?.quote_days ?? [3, 7]).join(", "));
  const [invoice, setInvoice] = useState(
    (settings.reminders?.invoice_days ?? [7, 14, 30]).join(", "),
  );
  const [reviews, setReviews] = useState(settings.review_requests ?? true);
  const [errors, setErrors] = useState<{ quote?: string; invoice?: string }>({});

  // Unsaved entries ask before leaving (owner, 2026-10-20: "Discard changes?" everywhere).
  const entries = { quote, invoice, reviews };
  const [startEntries, setStartEntries] = useState(entries);
  useUnsavedChanges(formChanged(startEntries, entries));
  function save() {
    const quoteDays = parseReminderDays(quote);
    const invoiceDays = parseReminderDays(invoice);
    setErrors({
      quote: quoteDays ? undefined : "Enter days after sending, like 3, 7.",
      invoice: invoiceDays ? undefined : "Enter days after sending, like 7, 14, 30.",
    });
    if (!quoteDays || !invoiceDays) return;
    write({
      settings: {
        ...(company.settings as unknown as Record<string, JsonValue>),
        reminders: { quote_days: quoteDays, invoice_days: invoiceDays },
        review_requests: reviews,
      },
    });
    haptics.success();
    setStartEntries(entries);
    onSaved("Saved.");
  }

  return (
    <View style={styles.part}>
      <FieldGroup
        title="Reminders and Reviews"
        footer="Emails sent once a day, in the morning. They stop when a quote is accepted or an invoice is paid, and customers can turn them off from any of them."
      >
        <FieldRow
          label="Quote reminders (days after sending)"
          layout="stacked"
          value={quote}
          onChangeText={setQuote}
          error={errors.quote}
          hint="For quotes not yet accepted. Leave empty for none."
        />
        <FieldRow
          label="Invoice reminders (days after sending)"
          layout="stacked"
          value={invoice}
          onChangeText={setInvoice}
          error={errors.invoice}
          hint="For invoices not yet paid in full. Leave empty for none."
        />
        <View style={styles.setting}>
          <Toggle
            label="Ask for a review after a job is paid"
            value={reviews}
            onChange={setReviews}
          />
          {str(row, "review_url") ? null : (
            <T variant="secondary" muted>
              Add your review link under Company profile to send review requests.
            </T>
          )}
        </View>
      </FieldGroup>
      <Button title="Save" kind="secondary" onPress={save} />
    </View>
  );
}

function ReportTerms({ row, onSaved }: { row: Row; onSaved: Said }) {
  const write = useWriteCompany();
  const [text, setText] = useState(str(row, "report_disclaimer"));
  const [error, setError] = useState<string | undefined>();
  // Unsaved entries ask before leaving (owner, 2026-10-20: "Discard changes?" everywhere).
  const entries = { text };
  const [startEntries, setStartEntries] = useState(entries);
  useUnsavedChanges(formChanged(startEntries, entries));
  function save() {
    if (text.length > 20_000) return setError("Keep it under 20,000 characters.");
    setError(undefined);
    write({ report_disclaimer: text.trim() || null });
    haptics.success();
    setStartEntries(entries);
    onSaved("Saved.");
  }
  return (
    <View style={styles.part}>
      <FieldGroup
        title="Report terms"
        footer="Printed at the end of every report, as written. Reports already sent keep the text they were sent with."
      >
        <FieldRow
          label="Disclaimer"
          layout="stacked"
          multiline
          value={text}
          onChangeText={setText}
          error={error}
        />
      </FieldGroup>
      <Button title="Save" kind="secondary" onPress={save} />
    </View>
  );
}

/** Job numbers come from the server (set_next_job_number), so this one needs a connection. */
function JobNumbers({ onSaved }: { onSaved: Said }) {
  const company = useCompany();
  const jobs = useRows<Job>("job", company.id);
  const last = useMemo(() => jobs.reduce((n, j) => Math.max(n, j.number ?? 0), 0), [jobs]);
  const [next, setNext] = useState<string | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const value = next ?? String(last + 1);
  // A number typed but not saved asks before leaving (owner, 2026-10-20).
  useUnsavedChanges(next !== null && next.trim() !== String(last + 1));
  async function save() {
    const n = Number(value.trim());
    if (!Number.isInteger(n) || n < 1 || n > 2_000_000_000)
      return setError("Enter a whole number, like 10450.");
    setError(undefined);
    setBusy(true);
    try {
      const { error: rpcError } = await getServices().supabase.rpc("set_next_job_number", {
        target_company: company.id,
        next_number: n,
      });
      if (rpcError) return setError(rpcError.message);
      setNext(null);
      onSaved(`The next job will be #${n}.`);
    } catch {
      setError("You’re offline. Try again with signal.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={styles.part}>
      <FieldGroup title="Job numbers" labelWidth={150}>
        <FieldRow
          label="Next job number"
          value={value}
          onChangeText={setNext}
          keyboardType="number-pad"
          error={error}
          hint={
            last
              ? `The last job is #${last}. To continue from your old system, enter a higher number.`
              : "To continue from your old system, enter your next number."
          }
        />
      </FieldGroup>
      <Button title="Save" kind="secondary" loading={busy} onPress={() => void save()} />
    </View>
  );
}

function Branding({ row, onSaved }: { row: Row; onSaved: Said }) {
  const company = useCompany();
  const write = useWriteCompany();
  const [primary, setPrimary] = useState(str(row, "brand_primary"));
  const [secondary, setSecondary] = useState(str(row, "brand_secondary"));
  const [errors, setErrors] = useState<{ primary?: string; secondary?: string; logo?: string }>({});
  const [uploading, setUploading] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const logoPath = str(row, "logo_path");
  useEffect(() => {
    if (!logoPath) return;
    void getServices()
      .supabase.storage.from("company-assets")
      .createSignedUrl(logoPath, 3600)
      .then(({ data }) => setLogoUrl(data?.signedUrl ?? null));
  }, [logoPath]);

  // Unsaved entries ask before leaving (owner, 2026-10-20: "Discard changes?" everywhere).
  const entries = { primary, secondary };
  const [startEntries, setStartEntries] = useState(entries);
  useUnsavedChanges(formChanged(startEntries, entries));
  function save() {
    const e = {
      primary: isHexColor(primary.trim()) ? undefined : "Use a color like #12263A.",
      secondary:
        !secondary.trim() || isHexColor(secondary.trim()) ? undefined : "Use a color like #EE6A1F.",
    };
    setErrors(e);
    if (e.primary || e.secondary) return;
    write({
      brand_primary: primary.trim().toUpperCase(),
      brand_secondary: secondary.trim() ? secondary.trim().toUpperCase() : null,
    });
    haptics.success();
    setStartEntries(entries);
    onSaved("Saved.");
  }

  /** A new logo from the phone's photos: uploaded as is (PNG or JPEG, under 2 MB). */
  async function chooseLogo() {
    setErrors((x) => ({ ...x, logo: undefined }));
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 1,
    });
    const asset = picked.canceled ? null : picked.assets[0];
    if (!asset) return;
    const type = asset.mimeType ?? (asset.uri.endsWith(".png") ? "image/png" : "image/jpeg");
    const ext = { "image/png": "png", "image/jpeg": "jpg" }[type];
    if (!ext) return setErrors((x) => ({ ...x, logo: "Use a PNG or JPEG image." }));
    setUploading(true);
    try {
      const body = await (await fetch(asset.uri)).arrayBuffer();
      if (body.byteLength > 2 * 1024 * 1024)
        return setErrors((x) => ({ ...x, logo: "Use a file under 2 MB." }));
      // A new name each time, so reports already sent keep pointing at the old logo.
      const path = `${company.id}/logo-${Date.now()}.${ext}`;
      const { error } = await getServices()
        .supabase.storage.from("company-assets")
        .upload(path, body, { contentType: type, upsert: false });
      if (error) return setErrors((x) => ({ ...x, logo: error.message }));
      write({ logo_path: path });
      haptics.success();
      onSaved("Logo saved.");
    } catch {
      setErrors((x) => ({ ...x, logo: "You’re offline. Try again with signal." }));
    } finally {
      setUploading(false);
    }
  }

  return (
    <Section title="Branding">
      <View style={styles.part}>
        <View style={[styles.logo, { backgroundColor: color.surface }]}>
          <T variant="bodyMedium">Logo</T>
          {logoUrl ? (
            <Image
              source={{ uri: logoUrl }}
              style={styles.logoImage}
              resizeMode="contain"
              accessibilityLabel={`${company.name} logo`}
            />
          ) : (
            <T muted>No logo yet. Reports show your company name instead.</T>
          )}
          <Button
            title={logoPath ? "Change Logo" : "Choose Logo"}
            kind="secondary"
            loading={uploading}
            onPress={() => void chooseLogo()}
          />
          <T variant="secondary" muted>
            PNG or JPEG, under 2 MB. A wide logo works best.
          </T>
          {errors.logo ? (
            <T variant="secondary" style={{ color: color.fail }}>
              {errors.logo}
            </T>
          ) : null}
        </View>
        <FieldGroup labelWidth={120}>
          <FieldRow
            label="Main color"
            value={primary}
            onChangeText={setPrimary}
            autoCapitalize="characters"
            placeholder="#12263A"
            error={errors.primary}
          />
          <FieldRow
            label="Accent color"
            value={secondary}
            onChangeText={setSecondary}
            autoCapitalize="characters"
            placeholder="Optional"
            error={errors.secondary}
          />
        </FieldGroup>
        <Button title="Save" kind="secondary" onPress={save} />
      </View>
    </Section>
  );
}

const styles = StyleSheet.create({
  part: { gap: space["3"] },
  setting: { paddingHorizontal: space["4"], paddingVertical: space["2"] },
  logo: { borderRadius: 12, padding: space["4"], gap: space["2"] },
  logoImage: { height: 80, alignSelf: "stretch" },
});
