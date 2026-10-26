import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { ON_MY_WAY_LABELS, formatPhone, onMyWayVia, toE164, type OnMyWayVia } from "@leakbook/core";
import type { JsonValue } from "@leakbook/sync";
import { API_URL } from "../../lib/config";
import { getServices } from "../../lib/services";
import { useCompany } from "../../state/session";
import {
  Button,
  FieldGroup,
  FieldRow,
  Group,
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
// text customers. Get a new one (area code, then pick), or use the shop's own; then the line's
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
    if (!res.ok && !data.error) data.error = `The server said ${res.status}.`;
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
      {state?.line ? (
        <CompanyNumber line={state.line} onCancel={() => void act("cancel")} />
      ) : state ? (
        <>
          <Notice tone="info">
            A company number is needed to text customers from Sundeck Pro. Get a new one, or use
            your shop’s own.
          </Notice>
          <NewNumber act={act} />
          <KeepNumber act={act} />
        </>
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

function CompanyNumber({ line, onCancel }: { line: Line; onCancel: () => void }) {
  return (
    <Section title="Company number">
      <View style={[styles.box, { backgroundColor: color.surface }]}>
        <Text style={[styles.number, { color: color.text }]} maxFontSizeMultiplier={MAX_TEXT_SCALE}>
          {formatPhone(line.number)}
        </Text>
        <T muted>
          {line.status === "active"
            ? "Working. Texts and calls show up in Messages."
            : "Your own number is being set up for texting. It usually takes a few days."}
        </T>
        {line.status === "pending" ? (
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
    </Section>
  );
}

type Act = (action: string, values?: object) => Promise<Result>;

function NewNumber({ act }: { act: Act }) {
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
    <Section
      title="Get a new number"
      footer="A local number that texts, sends photos, and takes calls. Included with Sundeck Pro."
    >
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
                detail="Use This Number"
                onPress={() =>
                  confirmDestructive({
                    title: `Use ${formatPhone(n.number)} as the company number?`,
                    message: "Customers text and call it. Included with Sundeck Pro.",
                    confirm: "Use This Number",
                    onConfirm: () => void act("take", { number: n.number }),
                  })
                }
              />
            ))}
          </Group>
        ) : null}
      </View>
    </Section>
  );
}

function KeepNumber({ act }: { act: Act }) {
  const [number, setNumber] = useState("");
  // A number typed but not sent asks before leaving (owner, 2026-10-20).
  useUnsavedChanges(number.trim() !== "");
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  async function keep() {
    const e164 = toE164(number);
    if (!e164) return setError("Enter the shop’s number, like (480) 555-0100.");
    setError(undefined);
    setBusy(true);
    const r = await act("keep", { number: e164 });
    setBusy(false);
    if (r.fields) setError(Object.values(r.fields)[0]);
  }
  return (
    <Section title="Or use your shop’s number">
      <View style={styles.part}>
        <FieldGroup labelWidth={100}>
          <FieldRow
            label="Number"
            value={number}
            onChangeText={setNumber}
            keyboardType="phone-pad"
            placeholder="(480) 555-0100"
            error={error}
            hint="Sundeck Pro registers it for texting. It takes a few days."
          />
        </FieldGroup>
        <Button
          title="Set Up My Number"
          kind="secondary"
          loading={busy}
          onPress={() => void keep()}
        />
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
