import * as ImagePicker from "expo-image-picker";
import { useEffect, useMemo, useRef, useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import {
  isHexColor,
  offersLeak,
  parseReminderDays,
  suggestedBrandColor,
  type Job,
} from "@leakbook/core";
import type { JsonValue } from "@leakbook/sync";
import { useRows } from "../../data/hooks";
import { useAddressSuggestions } from "../address/AddressSuggestions";
import { locateAfterSync } from "../../lib/locate";
import { getServices } from "../../lib/services";
import { useCompany } from "../../state/session";
import { Button, FieldGroup, FieldRow, Screen, Section, T, Toggle } from "../../ui/components";
import { haptics } from "../../ui/haptics";
import { Select } from "../../ui/Select";
import { color, space } from "../../ui/theme";
import { ManagersOnly } from "./SettingsList";
import { BrandColorRow, logoColorsFrom } from "./BrandColor";
import { formChanged } from "../../lib/discard";
import { isWebUrl, REVIEW_URL_ERROR } from "../../lib/limits";
import { useUnsavedChanges } from "../../ui/ModalSheet";
import { SaveBar, SaveBarSpace, type SaveResult } from "../../ui/SaveBar";

// Settings › Company and Branding (the website's settings/company): the company profile,
// reminders and reviews, report terms, the next job number, and branding. The company row is
// synced; owners and admins write it through sync, so it saves offline. One Save at the bottom
// saves the whole page (owner, 2026-10-22); a new logo waits for it too, as on the iPhone and
// the website. A new address drops the shop's old map location in the same write, and the
// server finds the new one once it's up. Services (what the shop does) changes the shop's package and price, so it stays on the
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

type Settings = {
  reminders?: { quote_days?: number[]; invoice_days?: number[] };
  review_requests?: boolean;
};

const profileOf = (row: Row, timezone: string) => ({
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
  timezone,
});

const followupsOf = (settings: Settings) => ({
  quote: (settings.reminders?.quote_days ?? [3, 7]).join(", "),
  invoice: (settings.reminders?.invoice_days ?? [7, 14, 30]).join(", "),
  reviews: settings.review_requests ?? true,
});

const brandingOf = (row: Row) => ({
  primary: str(row, "brand_primary"),
  secondary: str(row, "brand_secondary"),
});

type Profile = ReturnType<typeof profileOf>;
type Followups = ReturnType<typeof followupsOf>;
type Branding = ReturnType<typeof brandingOf>;
type Errors = Partial<
  Record<
    "name" | "review_url" | "quote" | "invoice" | "terms" | "number" | "primary" | "secondary",
    string
  >
>;
/** A logo picked from the phone's photos, uploaded on Save. */
type PickedLogo = { uri: string; type: string; ext: string; body: ArrayBuffer };

/**
 * The page's parts, each with what was loaded or last saved. One Save at the bottom saves every
 * part that changed (owner, 2026-10-22: "remove all the save buttons on that page and just have
 * one floating one on the bottom"); Back asks only while something the owner changed is unsaved.
 */
function CompanyPage() {
  const company = useCompany();
  const row = company as unknown as Row;
  const write = useWriteCompany();
  const settings = company.settings as Settings;

  const [profile, setProfile] = useState(() => profileOf(row, company.timezone));
  const [savedProfile, setSavedProfile] = useState(profile);
  const [followups, setFollowups] = useState(() => followupsOf(settings));
  const [savedFollowups, setSavedFollowups] = useState(followups);
  const [terms, setTerms] = useState(str(row, "report_disclaimer"));
  const [savedTerms, setSavedTerms] = useState(terms);
  const [branding, setBranding] = useState(() => brandingOf(row));
  const [savedBranding, setSavedBranding] = useState(branding);
  // The main color the stored logo suggested over the default when the page opened: it lights
  // Save, but leaving doesn't ask, since the owner changed nothing.
  const [suggested, setSuggested] = useState<string | null>(null);
  const [logo, setLogo] = useState<PickedLogo | null>(null);
  const [logoError, setLogoError] = useState<string | undefined>();

  // Job numbers come from the server (set_next_job_number), so that part needs a connection.
  const jobs = useRows<Job>("job", company.id);
  const last = useMemo(() => jobs.reduce((n, j) => Math.max(n, j.number ?? 0), 0), [jobs]);
  const [next, setNext] = useState<string | null>(null);
  const numberValue = next ?? String(last + 1);
  const numberChanged = next !== null && next.trim() !== String(last + 1);

  // The stored logo, read once per logo: a save that leaves it alone doesn't read it (or its
  // colors) again, so a main color chosen over the logo's stays chosen.
  const logoPath = str(row, "logo_path");
  const shownLogo = useRef<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoColors, setLogoColors] = useState<string[]>([]);
  const [picked, setPicked] = useState(false);
  useEffect(() => {
    if (!logoPath || logoPath === shownLogo.current) return;
    const first = shownLogo.current === null;
    shownLogo.current = logoPath;
    void getServices()
      .supabase.storage.from("company-assets")
      .createSignedUrl(logoPath, 3600)
      .then(async ({ data }) => {
        if (!data?.signedUrl) return;
        setLogoUrl(data.signedUrl);
        const colors = await logoColorsFrom(data.signedUrl);
        setLogoColors(colors);
        if (!first) return;
        // `primary` here is as rendered: the saved color.
        const fill = suggestedBrandColor(colors, branding.primary, false);
        if (fill) {
          setBranding((b) => ({ ...b, primary: fill }));
          setSuggested(fill);
          setPicked(true);
        }
      });
    // Read once per logo.
  }, [logoPath]); // eslint-disable-line react-hooks/exhaustive-deps

  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<SaveResult | null>(null);

  const brandingBaseline =
    suggested && branding.primary === suggested
      ? { ...savedBranding, primary: suggested }
      : savedBranding;
  const rest =
    formChanged(savedProfile, profile) ||
    formChanged(savedFollowups, followups) ||
    formChanged({ terms: savedTerms }, { terms }) ||
    numberChanged ||
    logo !== null;
  const changed = rest || formChanged(savedBranding, branding);
  const dirty = rest || formChanged(brandingBaseline, branding);
  useUnsavedChanges(dirty);

  /** The first problem on the page, with each field's own message (the website's checks). */
  function check(): Errors {
    const e: Errors = {};
    if (!profile.name.trim()) e.name = "Enter the company name.";
    // It goes into customer emails as a link: web pages only (the website's rule).
    if (profile.review_url.trim() && !isWebUrl(profile.review_url.trim()))
      e.review_url = REVIEW_URL_ERROR;
    if (!parseReminderDays(followups.quote)) e.quote = "Enter days after sending, like 3, 7.";
    if (!parseReminderDays(followups.invoice))
      e.invoice = "Enter days after sending, like 7, 14, 30.";
    if (terms.length > 20_000) e.terms = "Keep it under 20,000 characters.";
    if (numberChanged) {
      const n = Number(numberValue.trim());
      if (!Number.isInteger(n) || n < 1 || n > 2_000_000_000)
        e.number = "Enter a whole number, like 10450.";
    }
    if (!isHexColor(branding.primary.trim())) e.primary = "Use a color like #12263A.";
    if (branding.secondary.trim() && !isHexColor(branding.secondary.trim()))
      e.secondary = "Use a color like #EE6A1F.";
    return e;
  }

  /**
   * Saves every part that changed. The synced parts save on the phone, so offline too; the
   * logo and the next job number need a connection, and stay unsaved when it's missing. Each
   * part's baseline becomes what was stored (trimmed, "az" as "AZ").
   */
  async function save() {
    const e = check();
    setErrors(e);
    const first = Object.values(e)[0];
    if (first) {
      setResult({ text: first, error: true });
      return;
    }
    setSaving(true);
    let failure: string | null = null;
    if (formChanged(savedProfile, profile)) {
      const opt = (v: string) => v.trim() || null;
      const address = {
        address_line1: opt(profile.address_line1),
        address_line2: opt(profile.address_line2),
        city: opt(profile.city),
        state: profile.state.trim().toUpperCase() || null,
        postal_code: opt(profile.postal_code),
      };
      // Every route starts at the shop: a new address drops the old map location, and the
      // server finds the new one once this is up.
      const moved = (Object.keys(address) as (keyof typeof address)[]).some(
        (k) => ((row[k] as string | null | undefined) ?? null) !== address[k],
      );
      const values = {
        name: profile.name.trim(),
        legal_name: opt(profile.legal_name),
        phone: opt(profile.phone),
        email: opt(profile.email),
        ...address,
        review_url: opt(profile.review_url),
        timezone: profile.timezone,
      };
      write({
        ...values,
        ...(moved ? { latitude: null, longitude: null, geocoded_address: null } : {}),
      });
      if (moved) void locateAfterSync(company.id, { shop: true });
      const stored = profileOf(values as Row, values.timezone);
      setProfile(stored);
      setSavedProfile(stored);
    }
    if (formChanged(savedFollowups, followups)) {
      const reminders = {
        quote_days: parseReminderDays(followups.quote) ?? [],
        invoice_days: parseReminderDays(followups.invoice) ?? [],
      };
      write({
        settings: {
          ...(company.settings as unknown as Record<string, JsonValue>),
          reminders,
          review_requests: followups.reviews,
        },
      });
      const stored = followupsOf({ reminders, review_requests: followups.reviews });
      setFollowups(stored);
      setSavedFollowups(stored);
    }
    if (formChanged({ terms: savedTerms }, { terms })) {
      write({ report_disclaimer: terms.trim() || null });
      setTerms(terms.trim());
      setSavedTerms(terms.trim());
    }
    if (formChanged(savedBranding, branding)) {
      const stored = {
        primary: branding.primary.trim().toUpperCase(),
        secondary: branding.secondary.trim().toUpperCase(),
      };
      write({ brand_primary: stored.primary, brand_secondary: stored.secondary || null });
      setBranding(stored);
      setSavedBranding(stored);
      setSuggested(null);
    }
    if (logo) {
      try {
        // A new name each time, so reports already sent keep pointing at the old logo.
        const path = `${company.id}/logo-${Date.now()}.${logo.ext}`;
        const { error } = await getServices()
          .supabase.storage.from("company-assets")
          .upload(path, logo.body, { contentType: logo.type, upsert: false });
        if (error) failure = error.message;
        else {
          shownLogo.current = path;
          write({ logo_path: path });
          // The picture stays the one chosen; it isn't read back from the server.
          setLogoUrl(logo.uri);
          setLogo(null);
        }
      } catch {
        failure = OFFLINE;
      }
    }
    if (!failure && numberChanged) {
      const n = Number(numberValue.trim());
      try {
        const { error } = await getServices().supabase.rpc("set_next_job_number", {
          target_company: company.id,
          next_number: n,
        });
        if (error) {
          failure = error.message;
          setErrors((x) => ({ ...x, number: error.message }));
        } else setNext(null);
      } catch {
        failure = OFFLINE;
      }
    }
    setSaving(false);
    if (failure) setResult({ text: failure, error: true });
    else {
      haptics.success();
      setResult({ text: "Saved.", error: false });
    }
  }

  /** A new logo from the phone's photos (PNG or JPEG, under 2 MB), uploaded on Save. */
  async function chooseLogo() {
    setLogoError(undefined);
    const pick = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 1 });
    const asset = pick.canceled ? null : pick.assets[0];
    if (!asset) return;
    const type = asset.mimeType ?? (asset.uri.endsWith(".png") ? "image/png" : "image/jpeg");
    const ext = { "image/png": "png", "image/jpeg": "jpg" }[type];
    if (!ext) return setLogoError("Use a PNG or JPEG image.");
    const body = await (await fetch(asset.uri)).arrayBuffer();
    if (body.byteLength > 2 * 1024 * 1024) return setLogoError("Use a file under 2 MB.");
    setLogo({ uri: asset.uri, type, ext, body });
    setResult(null);
    setSuggested(null);
    const colors = await logoColorsFrom(asset.uri);
    setLogoColors(colors);
    const fill = suggestedBrandColor(colors, branding.primary, true);
    if (fill) {
      setBranding((b) => ({ ...b, primary: fill }));
      setPicked(true);
    }
  }

  const setP = (k: keyof Profile) => (v: string) => setProfile((x) => ({ ...x, [k]: v }));
  const setF =
    <K extends keyof Followups>(k: K) =>
    (v: Followups[K]) =>
      setFollowups((x) => ({ ...x, [k]: v }));
  const setB = (k: keyof Branding) => (v: string) => setBranding((x) => ({ ...x, [k]: v }));

  return (
    <Screen
      title="Company and Branding"
      subtitle="Shown on reports, quotes, and invoices."
      overlay={
        <SaveBar changed={changed} busy={saving} result={result} onSave={() => void save()} />
      }
    >
      <ProfilePart value={profile} set={setP} setAll={setProfile} errors={errors} />
      <FollowupsPart
        value={followups}
        set={setF}
        errors={errors}
        hasReviewLink={Boolean(str(row, "review_url"))}
      />
      {offersLeak(company.settings) ? (
        <TermsPart value={terms} set={setTerms} error={errors.terms} />
      ) : null}
      <JobNumbersPart value={numberValue} set={setNext} last={last} error={errors.number} />
      <BrandingPart
        companyName={company.name}
        value={branding}
        set={setB}
        onPickMain={() => {
          setPicked(false);
          setSuggested(null);
        }}
        logoUri={logo?.uri ?? logoUrl}
        hasLogo={Boolean(logo || logoPath)}
        chooseLogo={() => void chooseLogo()}
        logoColors={logoColors}
        picked={picked}
        errors={{ ...errors, logo: logoError }}
      />
      <SaveBarSpace />
    </Screen>
  );
}

const OFFLINE = "You’re offline. Try again with signal.";

/** Writes the shop's row through sync (owners and admins). */
function useWriteCompany() {
  const company = useCompany();
  return (values: Record<string, JsonValue>) =>
    getServices().sync.write("company", company.id, company.id, values);
}

function ProfilePart({
  value: f,
  set,
  setAll,
  errors,
}: {
  value: Profile;
  set: (k: keyof Profile) => (v: string) => void;
  setAll: (fn: (x: Profile) => Profile) => void;
  errors: Errors;
}) {
  const company = useCompany();
  // Real addresses as the street is typed (owner, 2026-10-20); picking one fills the rest.
  const suggestions = useAddressSuggestions(f.address_line1, (s) =>
    setAll((x) => ({
      ...x,
      address_line1: s.line1,
      city: s.city,
      state: s.state,
      postal_code: s.postal_code,
    })),
  );
  const zones = US_ZONES.includes(company.timezone) ? US_ZONES : [company.timezone, ...US_ZONES];
  return (
    <View style={styles.part}>
      <FieldGroup title="Company profile" labelWidth={120}>
        <FieldRow
          label="Company name"
          value={f.name}
          onChangeText={set("name")}
          error={errors.name}
        />
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
          error={errors.review_url}
          hint="Your Google or Yelp page. Review requests link here."
        />
      </FieldGroup>
      <Select
        label="Time zone"
        value={f.timezone}
        onChange={set("timezone")}
        options={zones.map((z) => ({ value: z, label: z.replace("_", " ") }))}
      />
    </View>
  );
}

function FollowupsPart({
  value,
  set,
  errors,
  hasReviewLink,
}: {
  value: Followups;
  set: <K extends keyof Followups>(k: K) => (v: Followups[K]) => void;
  errors: Errors;
  hasReviewLink: boolean;
}) {
  return (
    <View style={styles.part}>
      <FieldGroup
        title="Reminders and Reviews"
        footer="Emails sent once a day, in the morning. They stop when a quote is accepted or an invoice is paid, and customers can turn them off from any of them."
      >
        <FieldRow
          label="Quote reminders (days after sending)"
          layout="stacked"
          value={value.quote}
          onChangeText={set("quote")}
          error={errors.quote}
          hint="For quotes not yet accepted. Leave empty for none."
        />
        <FieldRow
          label="Invoice reminders (days after sending)"
          layout="stacked"
          value={value.invoice}
          onChangeText={set("invoice")}
          error={errors.invoice}
          hint="For invoices not yet paid in full. Leave empty for none."
        />
        <View style={styles.setting}>
          <Toggle
            label="Ask for a review after a job is paid"
            value={value.reviews}
            onChange={set("reviews")}
          />
          {hasReviewLink ? null : (
            <T variant="secondary" muted>
              Add your review link under Company profile to send review requests.
            </T>
          )}
        </View>
      </FieldGroup>
    </View>
  );
}

function TermsPart({
  value,
  set,
  error,
}: {
  value: string;
  set: (v: string) => void;
  error?: string;
}) {
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
          value={value}
          onChangeText={set}
          error={error}
        />
      </FieldGroup>
    </View>
  );
}

function JobNumbersPart({
  value,
  set,
  last,
  error,
}: {
  value: string;
  set: (v: string) => void;
  last: number;
  error?: string;
}) {
  return (
    <View style={styles.part}>
      <FieldGroup title="Job numbers" labelWidth={150}>
        <FieldRow
          label="Next job number"
          value={value}
          onChangeText={set}
          keyboardType="number-pad"
          error={error}
          hint={
            last
              ? `The last job is #${last}. To continue from your old system, enter a higher number.`
              : "To continue from your old system, enter your next number."
          }
        />
      </FieldGroup>
    </View>
  );
}

function BrandingPart({
  companyName,
  value,
  set,
  onPickMain,
  logoUri,
  hasLogo,
  chooseLogo,
  logoColors,
  picked,
  errors,
}: {
  companyName: string;
  value: Branding;
  set: (k: keyof Branding) => (v: string) => void;
  onPickMain: () => void;
  logoUri: string | null;
  hasLogo: boolean;
  chooseLogo: () => void;
  logoColors: string[];
  picked: boolean;
  errors: Errors & { logo?: string };
}) {
  return (
    <Section title="Branding">
      <View style={styles.part}>
        <View style={[styles.logo, { backgroundColor: color.surface }]}>
          <T variant="bodyMedium">Logo</T>
          {logoUri ? (
            <Image
              source={{ uri: logoUri }}
              style={styles.logoImage}
              resizeMode="contain"
              accessibilityLabel={`${companyName} logo`}
            />
          ) : (
            <T muted>No logo yet. Reports show your company name instead.</T>
          )}
          <Button
            title={hasLogo ? "Change Logo" : "Choose Logo"}
            kind="secondary"
            onPress={chooseLogo}
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
        <BrandColorRow
          label="Main color"
          value={value.primary}
          onChange={(v) => {
            set("primary")(v);
            onPickMain();
          }}
          logoColors={logoColors}
          note={picked ? "Color picked from your logo." : undefined}
          error={errors.primary}
        />
        <BrandColorRow
          label="Accent color"
          value={value.secondary}
          onChange={set("secondary")}
          logoColors={logoColors}
          optional
          error={errors.secondary}
        />
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
