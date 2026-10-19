import Constants from "expo-constants";
import { router } from "expo-router";
import { isManagerRole, offersPool } from "@leakbook/core";
import { useState, useSyncExternalStore } from "react";
import { ActivityIndicator, Alert, Linking, Pressable, StyleSheet, View } from "react-native";
import { call } from "../../../../../data/reports";
import { API_URL } from "../../../../../lib/config";
import { useSession, useSyncStatus } from "../../../../../state/session";
import { useWalkthrough } from "../../../../../state/walkthrough";
import { useDirectionsChoice, type DirectionsChoice } from "../../../../../state/directions";
import {
  Button,
  Card,
  Chevron,
  Field,
  Group,
  ListRow,
  Screen,
  Section,
  Segmented,
  T,
} from "../../../../../ui/components";
import { confirmDestructive, chooseAction } from "../../../../../ui/confirm";
import { syncSummary } from "../../../../../ui/SyncBar";
import { appearance, color, space, type Scheme } from "../../../../../ui/theme";

const DIRECTIONS: { value: DirectionsChoice; label: string }[] = [
  { value: "automatic", label: "Automatic" },
  { value: "apple", label: "Apple Maps" },
  { value: "google", label: "Google Maps" },
];

/**
 * More (spec 5.8): the sections that don't have a tab, then this person's account, this
 * phone's settings, Sync, Help, Sign Out and Delete My Account.
 */
export default function More() {
  const { services, user, company, companies, membership, setActiveCompany, signOut } =
    useSession();
  const walkthrough = useWalkthrough();
  const status = useSyncStatus();
  const sync = syncSummary(status);
  const manager = isManagerRole(membership?.role);
  const scheme = useSyncExternalStore(appearance.subscribe, () => appearance.scheme);
  const [directions, setDirections] = useDirectionsChoice();
  const team = services.sync.team();
  const me = team.find((t) => t.id === user?.id);

  function confirmSignOut() {
    const changes = status.pending + status.problems.length;
    const files = status.uploads.waiting;
    const parts = [
      changes > 0 ? `${changes} change${changes === 1 ? "" : "s"}` : null,
      files > 0
        ? `${files} photo${files === 1 ? "" : "s"} or recording${files === 1 ? "" : "s"}`
        : null,
    ].filter(Boolean);
    confirmDestructive({
      title: "Sign out?",
      message:
        parts.length > 0
          ? `${parts.join(" and ")} haven’t reached the office yet. Signing out deletes them from this phone.`
          : "Your work is saved to the office. Signing out removes it from this phone.",
      confirm: "Sign Out",
      cancel: "Stay Signed In",
      onConfirm: () => void signOut(),
    });
  }

  const open = (path: string) => API_URL && void Linking.openURL(`${API_URL}${path}`);
  const version = Constants.expoConfig?.version ?? "dev";
  const build = Constants.nativeBuildVersion;

  return (
    <Screen title="More" subtitle={me?.full_name ?? user?.email ?? undefined}>
      <Group>
        <ListRow title="Customers" onPress={() => router.push("/customers")} />
        <ListRow title="Invoices" onPress={() => router.push("/invoices")} />
        {company && offersPool(company.settings) ? (
          <ListRow title="Chemical Calculator" onPress={() => router.push("/chemicals")} />
        ) : null}
        {manager ? <ListRow title="Settings" onPress={() => router.push("/settings")} /> : null}
      </Group>

      <Section title="Your account">
        <Group>
          {API_URL ? (
            // Set up on the website, where the code can be scanned (owner, 2026-10-16).
            <ListRow
              title="Two-Step Sign-In"
              subtitle="A code from your phone after your password"
              accessibilityRole="link"
              onPress={() => open("/more/two-step")}
            />
          ) : null}
          <ListRow title="My Mobile Number" onPress={() => router.push("/more/phone")} />
          {companies.length > 1 ? (
            <ListRow
              title="Company"
              detail={company?.name ?? ""}
              onPress={() =>
                chooseAction({
                  title: "Company",
                  actions: companies.map((c) => ({
                    label: c.id === company?.id ? `${c.name} ✓` : c.name,
                    onPress: () => setActiveCompany(c.id),
                  })),
                })
              }
            />
          ) : (
            <ListRow title="Company" detail={company?.name ?? ""} />
          )}
        </Group>
      </Section>

      <Section title="On this device">
        <Group>
          <View style={styles.controlRow}>
            <T style={{ flex: 1 }}>Appearance</T>
            <Segmented
              fill={false}
              minSegmentWidth={80}
              accessibilityLabel="Appearance"
              options={[
                { value: "light", label: "Light" },
                { value: "dark", label: "Dark" },
              ]}
              value={scheme}
              onChange={(v: Scheme) => appearance.set(v)}
            />
          </View>
          <View style={styles.controlRow}>
            <T variant="bodyEmphasis" style={{ flex: 1 }}>
              Directions open in
            </T>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Directions open in, ${DIRECTIONS.find((d) => d.value === directions)?.label}`}
              onPress={() =>
                chooseAction({
                  title: "Directions open in",
                  actions: DIRECTIONS.map((d) => ({
                    label: d.value === directions ? `${d.label} ✓` : d.label,
                    onPress: () => setDirections(d.value),
                  })),
                })
              }
              style={[styles.select, { borderColor: color.controlBorder }]}
            >
              <T style={{ color: color.link }}>
                {DIRECTIONS.find((d) => d.value === directions)?.label}
              </T>
              <Chevron />
            </Pressable>
          </View>
        </Group>
      </Section>

      <Section title="Sync">
        <Group>
          <ListRow
            onPress={() => router.push("/more/sync")}
            leading={
              status.problems.length > 0 ? (
                <View style={[styles.dot, { backgroundColor: color.fail }]} />
              ) : undefined
            }
          >
            <T>Sync</T>
            <T variant="secondary" muted>
              {sync.label}
            </T>
          </ListRow>
        </Group>
      </Section>

      <Section title="Help">
        <Group>
          <ListRow
            title="Help and Support"
            accessibilityRole="link"
            onPress={() => void Linking.openURL("mailto:support@sundeckpro.com")}
          />
          {API_URL ? (
            <ListRow
              title="Privacy Policy"
              accessibilityRole="link"
              onPress={() => open("/privacy")}
            />
          ) : null}
          {API_URL ? (
            <ListRow
              title="Terms of Service"
              accessibilityRole="link"
              onPress={() => open("/terms")}
            />
          ) : null}
          {API_URL ? (
            <ListRow
              title="System Status"
              accessibilityRole="link"
              onPress={() => open("/status")}
            />
          ) : null}
          {/* Every tip comes back, starting with the welcome cards (walkthrough, 2026-10-16). */}
          <ListRow
            title="Show Tips Again"
            tone="link"
            onPress={() => {
              walkthrough.reset();
              router.push("/welcome");
            }}
          />
          <ListRow title="Version" detail={build ? `${version} (${build})` : version} />
        </Group>
      </Section>

      <Group>
        <ListRow title="Sign Out" tone="destructive" onPress={confirmSignOut} />
      </Group>

      {API_URL ? <DeleteAccount onDeleted={signOut} /> : null}
    </Screen>
  );
}

/**
 * Delete My Account (App Store rule 5.1.1(v); Google Play's account deletion rule): a card
 * that opens to explain, asks for DELETE, then asks the server. It deletes now, or records a
 * request when the shop's data has to go too.
 */
function DeleteAccount({ onDeleted }: { onDeleted: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);
  function remove() {
    setDeleting(true);
    void call<{ status: "deleted" | "requested"; message?: string }>("/api/account/delete", {})
      .then(async (r) => {
        if (r.status === "deleted") return onDeleted();
        Alert.alert("Request sent", r.message ?? "We’ll email you when it’s done.");
      })
      .catch((e: unknown) =>
        Alert.alert("Couldn’t delete", e instanceof Error ? e.message : String(e)),
      )
      .finally(() => setDeleting(false));
  }
  return (
    <Card padding={0} style={{ paddingHorizontal: space["4"], paddingVertical: 6 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((o) => !o)}
        style={styles.disclosure}
      >
        <T variant="bodyMedium" style={{ color: color.fail, flex: 1 }}>
          Delete My Account
        </T>
        {deleting ? <ActivityIndicator color={color.fail} /> : null}
      </Pressable>
      {open ? (
        <View style={{ gap: space["3"], paddingBottom: space["3"] }}>
          <T variant="secondary" muted>
            Removes your sign-in. The jobs, reports, and invoices you worked on stay with the shop.
            If you’re the shop’s only owner, we’ll delete the shop’s data too, within 30 days.
          </T>
          <Field
            label="Type DELETE to confirm"
            value={typed}
            onChangeText={setTyped}
            autoCapitalize="characters"
            autoCorrect={false}
          />
          <Button
            title="Delete My Account"
            kind="danger"
            disabled={typed.trim() !== "DELETE"}
            loading={deleting}
            onPress={remove}
          />
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  controlRow: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: space["3"],
    paddingHorizontal: space["4"],
    paddingVertical: 10,
  },
  select: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: space["3"],
    flexDirection: "row",
    alignItems: "center",
    gap: space["2"],
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  disclosure: { minHeight: 48, flexDirection: "row", alignItems: "center" },
});
