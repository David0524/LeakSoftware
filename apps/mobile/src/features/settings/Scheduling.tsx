import * as Location from "expo-location";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  CLEANING_MONTHS,
  cleaningDefaultMonths,
  cleaningMonthsLabel,
  formatAddress,
  maintenanceSettings,
  offersPool,
  propertyLocation,
  routingSettings,
  type ComponentType,
  type Property,
} from "@leakbook/core";
import type { JsonValue } from "@leakbook/sync";
import { useRows } from "../../data/hooks";
import { API_URL } from "../../lib/config";
import { currentPosition } from "../../lib/media";
import { getServices } from "../../lib/services";
import { useCompany } from "../../state/session";
import {
  Button,
  FieldGroup,
  FieldRow,
  Notice,
  Screen,
  Section,
  Segmented,
  T,
} from "../../ui/components";
import { haptics } from "../../ui/haptics";
import { color, face, minTap, MAX_TEXT_SCALE, space, type } from "../../ui/theme";
import { TimeField } from "../schedule/DateField";
import { ManagersOnly } from "./SettingsList";
import { formChanged } from "../../lib/discard";
import { useUnsavedChanges } from "../../ui/ModalSheet";

// Settings › Scheduling and Routes (the website's settings/scheduling): the working day, the
// usual cleaning frequencies, the shop's location (where every route starts and ends), and how
// drive times are counted. company.settings is synced; owners and admins save through sync.

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;
type Window = "0" | "60" | "120" | "240";

export function SchedulingSettings() {
  return (
    <ManagersOnly title="Scheduling and Routes">
      <SchedulingPage />
    </ManagersOnly>
  );
}

function SchedulingPage() {
  const company = useCompany();
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const said = (text: string, tone: "success" | "error" = "success") => setNotice({ tone, text });
  const types = useRows<ComponentType>("component_type", company.id).filter(
    (t) =>
      t.job_type === "maintenance" &&
      (t as { on_schedule?: boolean }).on_schedule &&
      t.active &&
      !(t as { deleted_at?: string | null }).deleted_at,
  );
  return (
    <Screen
      title="Scheduling and Routes"
      subtitle="Routes start and end at the shop, or at home for anyone who starts there."
    >
      {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}
      <WorkingDay onSaved={said} />
      {offersPool(company.settings) && types.length ? (
        <CleaningDefaults types={types} onSaved={said} />
      ) : null}
      <ShopLocation onSaved={said} />
      <DriveTimes />
    </Screen>
  );
}

type Said = (text: string, tone?: "success" | "error") => void;

function WorkingDay({ onSaved }: { onSaved: Said }) {
  const company = useCompany();
  const s = routingSettings(company.settings);
  const m = maintenanceSettings(company.settings);
  const pool = offersPool(company.settings);
  const [f, setF] = useState({
    start: s.dayStart,
    end: s.dayEnd,
    hours: String(s.jobMinutes / 60),
    visit: String(m.visitMinutes),
    weeks: String(m.weeksAhead),
  });
  const [days, setDays] = useState<number[]>(s.workDays);
  const [window, setWindow] = useState<Window>(String(s.windowMin) as Window);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  // Unsaved entries ask before leaving (owner, 2026-10-20: "Discard changes?" everywhere).
  const entries = { ...f, days: [...days].sort(), window };
  const [startEntries, setStartEntries] = useState(entries);
  useUnsavedChanges(formChanged(startEntries, entries));
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));

  function save() {
    const e: Record<string, string> = {};
    if (!CLOCK.test(f.start)) e.start = "Pick a time.";
    if (!CLOCK.test(f.end)) e.end = "Pick a time.";
    else if (CLOCK.test(f.start) && f.end <= f.start) e.end = "End after the start.";
    const hours = Number(f.hours.trim());
    if (!(hours >= 0.25 && hours <= 12)) e.hours = "Enter 0.25 to 12 hours.";
    if (days.length === 0) e.days = "Pick at least one day.";
    const visit = Number(f.visit.trim());
    if (!(Number.isInteger(visit) && visit >= 10 && visit <= 240))
      e.visit = "Enter 10 to 240 minutes.";
    const weeks = Number(f.weeks.trim());
    if (!(Number.isInteger(weeks) && weeks >= 1 && weeks <= 12)) e.weeks = "Enter 1 to 12 weeks.";
    setErrors(e);
    if (Object.keys(e).length) return;
    const settings = company.settings as unknown as Record<string, JsonValue>;
    getServices().sync.write("company", company.id, company.id, {
      settings: {
        ...settings,
        routing: {
          day_start: f.start,
          day_end: f.end,
          arrival_window_minutes: Number(window),
          job_minutes: Math.round(hours * 60),
          work_days: [...new Set(days)].sort(),
        },
        // Other maintenance settings (the usual cleaning frequencies) stay as they are.
        maintenance: {
          ...((settings.maintenance ?? {}) as Record<string, JsonValue>),
          visit_minutes: visit,
          weeks_ahead: weeks,
        },
      },
    });
    haptics.success();
    setStartEntries(entries);
    onSaved("Saved.");
  }

  const toggleDay = (d: number) =>
    setDays((all) => (all.includes(d) ? all.filter((x) => x !== d) : [...all, d]));

  return (
    <Section title="Working day">
      <View style={styles.part}>
        <TimeField
          label="Day starts"
          value={f.start}
          onChange={set("start")}
          error={errors.start}
        />
        <TimeField
          label="Back at the shop by"
          value={f.end}
          onChange={set("end")}
          error={errors.end}
        />
        <FieldGroup labelWidth={190}>
          <FieldRow
            label="Usual job length (hours)"
            value={f.hours}
            onChangeText={set("hours")}
            keyboardType="decimal-pad"
            error={errors.hours}
            hint="For jobs booked without an end time."
          />
          {pool ? (
            <FieldRow
              label="Maintenance visit (minutes)"
              value={f.visit}
              onChangeText={set("visit")}
              keyboardType="number-pad"
              error={errors.visit}
              hint="For new maintenance plans."
            />
          ) : null}
          {pool ? (
            <FieldRow
              label="Schedule maintenance ahead (weeks)"
              value={f.weeks}
              onChangeText={set("weeks")}
              keyboardType="number-pad"
              error={errors.weeks}
              hint="How far ahead plans put visits on the schedule."
            />
          ) : null}
        </FieldGroup>
        <View style={{ gap: space["1"] }}>
          <T variant="bodyMedium">Working days</T>
          <T variant="secondary" muted>
            Suggested times use these days.
          </T>
          {/* Each day is a round toggle, filled when it's a working day. */}
          <View style={styles.days}>
            {DAYS.map((d, i) => {
              const on = days.includes(i);
              return (
                <Pressable
                  key={d}
                  accessibilityRole="checkbox"
                  accessibilityLabel={DAY_NAMES[i]}
                  accessibilityState={{ checked: on }}
                  onPress={() => toggleDay(i)}
                  style={({ pressed }) => [
                    styles.day,
                    { backgroundColor: on ? color.link : color.fill },
                    pressed && { opacity: 0.8 },
                  ]}
                >
                  <Text
                    style={[
                      type.secondary,
                      face.medium,
                      { color: on ? color.onPrimary : color.text },
                    ]}
                    maxFontSizeMultiplier={MAX_TEXT_SCALE}
                  >
                    {d}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {errors.days ? (
            <T variant="secondary" style={{ color: color.fail }}>
              {errors.days}
            </T>
          ) : null}
        </View>
        <View style={{ gap: space["1"] }}>
          <Segmented
            label="Arrival time customers are told"
            value={window}
            onChange={setWindow}
            options={[
              { value: "0", label: "Exact" },
              { value: "60", label: "1 Hour" },
              { value: "120", label: "2 Hours" },
              { value: "240", label: "4 Hours" },
            ]}
          />
          <T variant="secondary" muted>
            {window === "0"
              ? "On My Way texts say “about 10:15 AM”."
              : `On My Way texts give a ${Number(window) / 60}-hour window, like “between 10:00 AM and ${
                  window === "60" ? "11:00 AM" : window === "120" ? "12:00 PM" : "2:00 PM"
                }”.`}
          </T>
        </View>
        <Button title="Save" wide onPress={save} />
      </View>
    </Section>
  );
}

/** How often the shop usually does each cleaning, for new plans. */
function CleaningDefaults({ types, onSaved }: { types: ComponentType[]; onSaved: Said }) {
  const company = useCompany();
  const [months, setMonths] = useState<Record<string, number>>(() =>
    Object.fromEntries(types.map((t) => [t.key, cleaningDefaultMonths(company.settings, t.key)])),
  );
  // Unsaved entries ask before leaving (owner, 2026-10-20: "Discard changes?" everywhere).
  const entries = months;
  const [startEntries, setStartEntries] = useState(entries);
  useUnsavedChanges(formChanged(startEntries, entries));
  function save() {
    const settings = company.settings as unknown as Record<string, JsonValue>;
    const maintenance = (settings.maintenance ?? {}) as Record<string, JsonValue>;
    getServices().sync.write("company", company.id, company.id, {
      settings: {
        ...settings,
        maintenance: {
          ...maintenance,
          cleaning_months: {
            ...((maintenance.cleaning_months ?? {}) as Record<string, JsonValue>),
            ...months,
          },
        },
      },
    });
    haptics.success();
    setStartEntries(entries);
    onSaved("Saved for new plans.");
  }
  return (
    <Section title="Regular cleanings">
      <View style={styles.part}>
        {types.map((t) => (
          <Segmented
            key={t.id}
            label={t.name}
            value={String(months[t.key] ?? 3)}
            onChange={(v) => setMonths((x) => ({ ...x, [t.key]: Number(v) }))}
            options={CLEANING_MONTHS.map((m) => ({
              value: String(m),
              label: cleaningMonthsLabel(m),
            }))}
          />
        ))}
        <T variant="secondary" muted>
          New plans use these. To change a plan that’s already running, open it on the customer’s
          page.
        </T>
        <Button title="Save" kind="secondary" onPress={save} />
      </View>
    </Section>
  );
}

function ShopLocation({ onSaved }: { onSaved: Said }) {
  const company = useCompany();
  const row = company as unknown as Record<string, unknown>;
  const address = formatAddress(row as unknown as Parameters<typeof formatAddress>[0]);
  const at = propertyLocation(row as { latitude?: number | null; longitude?: number | null });
  const [busy, setBusy] = useState<"find" | "here" | null>(null);

  /** The server looks the address up on the map (POST /api/locate); it syncs back. */
  async function find() {
    if (!API_URL) return;
    if (!address) return onSaved("Add the shop’s address in Settings › Company first.", "error");
    setBusy("find");
    try {
      const { sync } = getServices();
      await sync.syncNow();
      const token = await sync.accessToken();
      const res = await fetch(`${API_URL}/api/locate`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ company_id: company.id, shop: true }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok || data.error)
        return onSaved(data.error ?? "That address wasn’t found.", "error");
      await sync.syncNow();
      onSaved("Shop location found.");
    } catch {
      onSaved("You’re offline. Try again with signal.", "error");
    } finally {
      setBusy(null);
    }
  }

  /** Standing at the shop: the phone's location, saved through sync. */
  async function here() {
    setBusy("here");
    try {
      await Location.requestForegroundPermissionsAsync().catch(() => undefined);
      const p = await currentPosition();
      if (!p) return onSaved("Couldn’t get your location. Allow location and try again.", "error");
      getServices().sync.write("company", company.id, company.id, {
        latitude: p.latitude,
        longitude: p.longitude,
        geocoded_address: address || null,
      });
      haptics.success();
      onSaved("Shop location saved.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Section title="Shop location">
      <View style={[styles.box, { backgroundColor: color.surface }]}>
        <T variant="bodyEmphasis">{address || "No address yet."}</T>
        <T variant="secondary" muted>
          {at
            ? row.geocoded_address === address
              ? "On the map."
              : "On the map, from an earlier address or the shop’s GPS."
            : "Not on the map yet, so routes can’t count the drive from the shop."}{" "}
          <Text
            accessibilityRole="link"
            onPress={() => router.push("/settings/company")}
            style={{ color: color.link, textDecorationLine: "underline" }}
          >
            Change the address
          </Text>
        </T>
        <View style={styles.buttons}>
          {API_URL ? (
            <Button
              title={busy === "find" ? "Finding…" : "Find From Address"}
              kind="secondary"
              disabled={busy !== null}
              onPress={() => void find()}
            />
          ) : null}
          <Button
            title="Use My Location (at the Shop)"
            kind="secondary"
            disabled={busy !== null}
            onPress={() => void here()}
          />
        </View>
      </View>
    </Section>
  );
}

function DriveTimes() {
  const company = useCompany();
  const pools = useRows<Property & { deleted_at?: string | null }>("property", company.id);
  const unlocated = pools.filter((p) => !p.deleted_at && !propertyLocation(p)).length;
  return (
    <Section title="Drive times">
      <View style={[styles.box, { backgroundColor: color.surface }]}>
        <T>
          Drive times come from road maps when Sundeck Pro’s routing service is connected, and are
          estimated from the distance between pools otherwise.
        </T>
        <T variant="secondary" muted>
          {unlocated
            ? `${unlocated} ${unlocated === 1 ? "pool has" : "pools have"} no map location yet.`
            : "Every pool is on the map."}{" "}
          Pools are found from their address when a route is planned.
        </T>
      </View>
    </Section>
  );
}

const styles = StyleSheet.create({
  part: { gap: space["3"] },
  days: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: space["1"] },
  day: {
    width: minTap,
    height: minTap,
    borderRadius: minTap / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  box: { borderRadius: 12, padding: space["4"], gap: space["2"] },
  buttons: { flexDirection: "row", flexWrap: "wrap", gap: space["2"], marginTop: space["1"] },
});
