import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  BUSINESS_FIELDS,
  BUSINESS_FOOTER,
  BUSINESS_SECTIONS,
  BUSINESS_TYPES,
  BUSINESS_TYPE_LABEL,
  KIND_DETAIL,
  KIND_TITLE,
  ON_MY_WAY_LABELS,
  REGISTRATION_KINDS,
  formatPhone,
  friendlyError,
  onMyWayVia,
  toE164,
  type BusinessDetails,
  type BusinessField,
  type BusinessType,
  type OnMyWayVia,
  type RegistrationKind,
} from "@leakbook/core";
import type { JsonValue } from "@leakbook/sync";
import { API_URL } from "../../lib/config";
import { getServices } from "../../lib/services";
import { useCompany } from "../../state/session";
import {
  Button,
  FieldGroup,
  FieldRow,
  Group,
  PickerRow,
  ListRow,
  Notice,
  Screen,
  Section,
  Segmented,
  T,
  Toggle,
} from "../../ui/components";
import { confirmDestructive } from "../../ui/confirm";
import { haptics } from "../../ui/haptics";
import { color, MAX_TEXT_SCALE, space, type } from "../../ui/theme";
import { ManagersOnly } from "./SettingsList";
import { formChanged } from "../../lib/discard";
import { useUnsavedChanges } from "../../ui/ModalSheet";
import { SkeletonRows } from "../../ui/Skeleton";

// Settings › Phone and Texting (the website's settings/phone): a company number is needed to
// text customers. Get a toll-free one, a local one (area code, then pick), or use the shop's own,
// with the business details phone companies review first (texting registration, owner
// 2026-11-27; docs/plans/texting-registration.md); then the line's
// settings (photos, voicemail greeting, whose phones ring), where On My Way texts go out from,
// and each person's own mobile number. The number lives on the server (/api/phone), so this
// screen needs a connection; On My Way is a synced shop setting.

interface Line {
  number: string;
  status: "active" | "pending" | string;
  pictures: boolean;
  voicemail_greeting: string | null;
  ring_user_ids: string[];
}
interface Registration {
  kind: RegistrationKind;
  stage: "registering" | "verify_number" | "needs_changes" | "ready";
  title: string;
  detail: string;
  tone: "info" | "warning" | "success" | "error";
  business: Partial<BusinessDetails>;
  ein_last4: string;
}
interface Teammate {
  user_id: string;
  name: string;
  role: string;
  phone: string | null;
  rings: boolean;
}
interface PhoneState {
  configured: boolean;
  line: Line | null;
  registration: Registration | null;
  my_phone: string | null;
  team: Teammate[];
}
type Result = { message?: string; error?: string; fields?: Record<string, string> };

const NOTE: Record<OnMyWayVia, string> = {
  messages: "Sent from the company number, so the whole team sees the reply.",
  phone: "Opens the tech’s own Messages app.",
};

async function phoneApi<T>(method: "GET" | "POST", body?: object): Promise<T & Result> {
  const company = getServices();
  const token = await company.sync.accessToken();
  if (!API_URL || !token) return { error: "Sign in again to continue." } as T & Result;
  try {
    const res = await fetch(
      method === "GET"
        ? `${API_URL}/api/phone?company_id=${encodeURIComponent((body as { company_id: string }).company_id)}`
        : `${API_URL}/api/phone`,
      {
        method,
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: method === "POST" ? JSON.stringify(body) : undefined,
      },
    );
    const data = (await res.json().catch(() => ({}))) as T & Result;
    if (!res.ok) data.error = friendlyError(data.error ?? `The server said ${res.status}.`);
    return data;
  } catch {
    return { error: "You’re offline. Phone settings need a connection." } as T & Result;
  }
}

export function PhoneSettings() {
  return (
    <ManagersOnly title="Phone and Texting">
      <PhonePage />
    </ManagersOnly>
  );
}

function PhonePage() {
  const company = useCompany();
  const [state, setState] = useState<PhoneState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const load = useCallback(async () => {
    const r = await phoneApi<PhoneState>("GET", { company_id: company.id });
    if (r.error) setLoadError(r.error);
    else {
      setLoadError(null);
      setState(r);
    }
  }, [company.id]);
  useEffect(() => {
    // Loading from the server: the answer arrives later, not during this effect.
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  async function act(action: string, values: object = {}): Promise<Result> {
    const r = await phoneApi<Result>("POST", { company_id: company.id, action, ...values });
    if (r.error && !r.fields) setNotice({ tone: "error", text: r.error });
    else if (r.message) {
      haptics.success();
      setNotice({ tone: "success", text: r.message });
      await load();
    }
    return r;
  }

  return (
    <Screen title="Phone and Texting">
      {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}
      {loadError ? <Notice tone="warning">{loadError}</Notice> : null}
      {!state && !loadError ? <SkeletonRows count={4} label="Loading Phone and Texting" /> : null}
      {state && !state.configured ? (
        <Notice tone="info">Texting isn’t switched on for Sundeck Pro yet.</Notice>
      ) : null}
      {state && (state.line?.status === "active" || state.registration) ? (
        <CompanyNumber
          line={state.line}
          registration={state.registration}
          act={act}
          onCancel={() => void act("cancel")}
        />
      ) : state ? (
        // A number entered before registrations (still pending): Use My Own Number, filled in.
        <NumberSetup
          act={act}
          ownNumber={state.line ? formatPhone(state.line.number) : undefined}
        />
      ) : null}
      {state?.line ? <LineSettings line={state.line} team={state.team} act={act} /> : null}
      <OnMyWaySetting />
      <Section title="Your mobile number">
        <Group>
          <ListRow
            title="My Mobile Number"
            detail={
              state?.my_phone ? formatPhone(toE164(state.my_phone) ?? state.my_phone) : undefined
            }
            onPress={() => router.push("/more/phone")}
          />
        </Group>
      </Section>
    </Screen>
  );
}

function CompanyNumber({
  line,
  registration,
  act,
  onCancel,
}: {
  line: Line | null;
  registration: Registration | null;
  act: Act;
  onCancel: () => void;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <Section title="Company number">
      <View style={[styles.box, { backgroundColor: color.surface }]}>
        {line ? (
          <Text
            style={[styles.number, { color: color.text }]}
            maxFontSizeMultiplier={MAX_TEXT_SCALE}
          >
            {formatPhone(line.number)}
          </Text>
        ) : null}
        {line?.status === "active" ? (
          <T muted>Working. Texts and calls show up in Messages.</T>
        ) : registration ? (
          <>
            <T variant="bodyMedium">{registration.title}</T>
            <T muted>{registration.detail}</T>
          </>
        ) : null}
        {registration?.stage === "needs_changes" && !editing ? (
          <Button title="Edit Business Details" onPress={() => setEditing(true)} />
        ) : null}
        {line?.status !== "active" ? (
          <Button
            title="Cancel Setup"
            kind="danger"
            onPress={() =>
              confirmDestructive({
                title: "Stop setting up this number?",
                confirm: "Cancel Setup",
                cancel: "Keep Setting Up",
                onConfirm: onCancel,
              })
            }
          />
        ) : null}
      </View>
      {editing && registration ? (
        <EditBusiness registration={registration} act={act} onDone={() => setEditing(false)} />
      ) : null}
    </Section>
  );
}

type Act = (action: string, values?: object) => Promise<Result>;
type Values = Partial<Record<BusinessField, string>>;

const KEYBOARD = {
  text: "default",
  number: "number-pad",
  email: "email-address",
  phone: "phone-pad",
  url: "url",
} as const;

/** What was sent before, ready to edit (the EIN isn't sent back: left empty, it stays). */
function savedValues(b: Partial<BusinessDetails>): Values {
  return {
    ...b,
    ein: "",
    phone: b.phone ? formatPhone(b.phone) : "",
    business_type: b.business_type ?? "llc",
  } as Values;
}

/** The business details phone companies review, in their two groups. */
function BusinessForm({
  values,
  onChange,
  errors,
  einLast4,
}: {
  values: Values;
  onChange: (v: Values) => void;
  errors: Record<string, string>;
  einLast4?: string;
}) {
  return (
    <>
      {BUSINESS_SECTIONS.map((section) => (
        <Section key={section.title} title={section.title}>
          <FieldGroup labelWidth={110}>
            {section.keys.map((key) => {
              if (key === "business_type")
                return (
                  <PickerRow<BusinessType>
                    key={key}
                    label="Type"
                    value={(values.business_type as BusinessType) ?? "llc"}
                    onChange={(v) => onChange({ ...values, business_type: v })}
                    options={BUSINESS_TYPES.map((t) => ({
                      value: t,
                      label: BUSINESS_TYPE_LABEL[t],
                    }))}
                    error={errors.business_type}
                  />
                );
              const f = BUSINESS_FIELDS.find((x) => x.key === key)!;
              return (
                <FieldRow
                  key={key}
                  label={f.label}
                  value={values[key] ?? ""}
                  onChangeText={(v) => onChange({ ...values, [key]: v })}
                  keyboardType={KEYBOARD[f.keyboard]}
                  autoCapitalize={
                    f.keyboard === "email" || f.keyboard === "url"
                      ? "none"
                      : key === "state"
                        ? "characters"
                        : "words"
                  }
                  autoCorrect={false}
                  placeholder={key === "ein" && einLast4 ? `Ends in ${einLast4}` : f.placeholder}
                  error={errors[key]}
                />
              );
            })}
          </FieldGroup>
        </Section>
      ))}
      <T variant="secondary" muted>
        {BUSINESS_FOOTER}
      </T>
    </>
  );
}

/** No number yet: choose how to get one, then the business details. */
function NumberSetup({ act, ownNumber }: { act: Act; ownNumber?: string }) {
  const [kind, setKind] = useState<RegistrationKind>(ownNumber ? "own" : "toll_free");
  const [picked, setPicked] = useState<string | null>(null);
  const [own, setOwn] = useState(ownNumber ?? "");
  const [values, setValues] = useState<Values>({ business_type: "llc" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  // Details typed but not sent ask before leaving (owner, 2026-10-20).
  useUnsavedChanges(Object.entries(values).some(([k, v]) => k !== "business_type" && !!v?.trim()));
  async function register() {
    setBusy(true);
    const r = await act("register", {
      kind,
      number: kind === "local" ? picked : kind === "own" ? own : undefined,
      business: values,
    });
    setBusy(false);
    setErrors(r.fields ?? {});
  }
  return (
    <>
      <Section
        title="Get a number"
        footer="Texting needs a company number. Phone companies review each business before its number can text, so it takes a few days to a few weeks. We do the paperwork."
      >
        <Group>
          {REGISTRATION_KINDS.map((k) => (
            <ListRow
              key={k}
              title={KIND_TITLE[k]}
              subtitle={KIND_DETAIL[k]}
              trailing={
                k === kind ? (
                  <Text
                    style={[type.body, { color: color.primary }]}
                    maxFontSizeMultiplier={MAX_TEXT_SCALE}
                  >
                    ✓
                  </Text>
                ) : null
              }
              accessibilityLabel={`${KIND_TITLE[k]}${k === kind ? ", selected" : ""}`}
              onPress={() => {
                haptics.selection();
                setKind(k);
                setPicked(null);
              }}
            />
          ))}
        </Group>
      </Section>
      {kind === "local" ? <LocalPicker act={act} picked={picked} onPick={setPicked} /> : null}
      {kind === "own" ? (
        <Section title="Your number" footer="The number your customers call today.">
          <FieldGroup labelWidth={110}>
            <FieldRow
              label="Number"
              value={own}
              onChangeText={setOwn}
              keyboardType="phone-pad"
              placeholder="(702) 555-0100"
              error={errors.number}
            />
          </FieldGroup>
        </Section>
      ) : null}
      {kind === "local" && errors.number ? <Notice tone="error">{errors.number}</Notice> : null}
      <BusinessForm values={values} onChange={setValues} errors={errors} />
      <Button title="Register Number" loading={busy} onPress={() => void register()} />
    </>
  );
}

/** A review came back: change the details and send them again. */
function EditBusiness({
  registration,
  act,
  onDone,
}: {
  registration: Registration;
  act: Act;
  onDone: () => void;
}) {
  const [values, setValues] = useState<Values>(savedValues(registration.business));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  async function send() {
    setBusy(true);
    const r = await act("update", { business: values });
    setBusy(false);
    setErrors(r.fields ?? {});
    if (!r.error && !r.fields) onDone();
  }
  return (
    <View style={styles.part}>
      <BusinessForm
        values={values}
        onChange={setValues}
        errors={errors}
        einLast4={registration.ein_last4}
      />
      <Button title="Send Again" loading={busy} onPress={() => void send()} />
    </View>
  );
}

/** Find a local number by area code and pick one. */
function LocalPicker({
  act,
  picked,
  onPick,
}: {
  act: Act;
  picked: string | null;
  onPick: (n: string) => void;
}) {
  const [area, setArea] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [numbers, setNumbers] = useState<{ number: string; locality?: string; region?: string }[]>(
    [],
  );
  async function search() {
    if (!/^[2-9]\d{2}$/.test(area.trim())) return setError("Enter a 3-digit area code.");
    setError(undefined);
    setBusy(true);
    const r = (await act("search", { area_code: area.trim() })) as Result & {
      numbers?: typeof numbers;
    };
    setBusy(false);
    if (r.fields) setError(Object.values(r.fields)[0]);
    setNumbers(r.numbers ?? []);
    if (!r.error && !(r.numbers ?? []).length) setError("No numbers there right now. Try another.");
  }
  return (
    <Section title="Choose a number">
      <View style={styles.part}>
        <View style={styles.searchRow}>
          <View style={{ flex: 1 }}>
            <FieldGroup labelWidth={120}>
              <FieldRow
                label="Area code"
                value={area}
                onChangeText={(v) => setArea(v.replace(/\D/g, "").slice(0, 3))}
                keyboardType="number-pad"
                maxLength={3}
                error={error}
              />
            </FieldGroup>
          </View>
          <Button
            title={busy ? "Searching…" : "Search"}
            kind="secondary"
            disabled={busy}
            onPress={() => void search()}
            style={{ alignSelf: "flex-start" }}
          />
        </View>
        {numbers.length ? (
          <Group>
            {numbers.map((n) => (
              <ListRow
                key={n.number}
                title={formatPhone(n.number)}
                subtitle={[n.locality, n.region].filter(Boolean).join(", ") || undefined}
                trailing={
                  n.number === picked ? (
                    <Text
                      style={[type.body, { color: color.primary }]}
                      maxFontSizeMultiplier={MAX_TEXT_SCALE}
                    >
                      ✓
                    </Text>
                  ) : null
                }
                accessibilityLabel={`${formatPhone(n.number)}${n.number === picked ? ", selected" : ""}`}
                onPress={() => {
                  haptics.selection();
                  onPick(n.number);
                }}
              />
            ))}
          </Group>
        ) : null}
      </View>
    </Section>
  );
}

function LineSettings({ line, team, act }: { line: Line; team: Teammate[]; act: Act }) {
  const company = useCompany();
  const [pictures, setPictures] = useState(line.pictures);
  const [greeting, setGreeting] = useState(line.voicemail_greeting ?? "");
  const [rings, setRings] = useState<string[]>(team.filter((t) => t.rings).map((t) => t.user_id));
  const [busy, setBusy] = useState(false);
  // Unsaved entries ask before leaving (owner, 2026-10-20: "Discard changes?" everywhere).
  const entries = { pictures, greeting, rings: [...rings].sort() };
  const [startEntries, setStartEntries] = useState(entries);
  useUnsavedChanges(formChanged(startEntries, entries));
  async function save() {
    setBusy(true);
    const r = await act("save", {
      pictures,
      ring_user_ids: rings,
      voicemail_greeting: greeting.trim() || null,
    });
    setBusy(false);
    if (!r.error && !r.fields) setStartEntries(entries);
  }
  return (
    <Section title="Texts and calls">
      <View style={styles.part}>
        <Toggle label="Photos in texts" value={pictures} onChange={setPictures} />
        <FieldGroup>
          <FieldRow
            label="Voicemail greeting"
            layout="stacked"
            multiline
            maxLength={400}
            value={greeting}
            onChangeText={setGreeting}
            placeholder={`Thanks for calling ${company.name}. We can’t take your call right now. Leave a message and we’ll call you back.`}
          />
        </FieldGroup>
        <View style={{ gap: space["1"] }}>
          <T variant="bodyMedium">Calls ring</T>
          <T variant="secondary" muted>
            In working hours (Scheduling and Routes) these phones ring at once and the first to
            answer gets the call. After hours, or when nobody answers, callers leave a voicemail.
          </T>
        </View>
        <Group>
          {team.map((t) => {
            const phone = toE164(t.phone);
            return (
              <View key={t.user_id} style={styles.ring}>
                <Toggle
                  label={`${t.name} · ${phone ? formatPhone(phone) : "no mobile number yet"}`}
                  value={rings.includes(t.user_id)}
                  onChange={(on) =>
                    setRings((all) =>
                      on ? [...all, t.user_id] : all.filter((id) => id !== t.user_id),
                    )
                  }
                />
              </View>
            );
          })}
        </Group>
        <Button title="Save" loading={busy} onPress={() => void save()} />
      </View>
    </Section>
  );
}

/** Where On My Way texts go out from: a synced shop setting. */
function OnMyWaySetting() {
  const company = useCompany();
  const via = onMyWayVia(company.settings);
  return (
    <Section title="On My Way">
      <View style={styles.part}>
        <Segmented
          label="Send from"
          value={via}
          onChange={(v: OnMyWayVia) => {
            getServices().sync.write("company", company.id, company.id, {
              settings: {
                ...(company.settings as unknown as Record<string, JsonValue>),
                on_my_way: v,
              },
            });
            haptics.selection();
          }}
          options={(["messages", "phone"] as const).map((v) => ({
            value: v,
            label: ON_MY_WAY_LABELS[v],
          }))}
        />
        <T variant="secondary" muted>
          {NOTE[via]}
        </T>
      </View>
    </Section>
  );
}

const styles = StyleSheet.create({
  part: { gap: space["3"] },
  box: { borderRadius: 12, padding: space["4"], gap: space["2"] },
  number: { ...type.largeTitle, fontVariant: ["tabular-nums"] },
  searchRow: { flexDirection: "row", alignItems: "flex-start", gap: space["2"] },
  ring: { paddingHorizontal: space["4"], paddingVertical: space["1"] },
});
