import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, RefreshControl, StyleSheet, View } from "react-native";
import {
  ACTIVITY_DASHBOARD_COUNT,
  ACTIVITY_EMPTY,
  ACTIVITY_OFFLINE,
  ACTIVITY_TITLE,
  JOB_STATUSES,
  JOB_STATUS_LABELS,
  SEARCH_WORDS,
  acceptanceRate,
  activityButtonLabel,
  activityRow,
  dashboardTotals,
  formatCents,
  monthLabel,
  type ActivityEvent,
  type Dashboard,
} from "@leakbook/core";
import { useActivityUnread } from "../../../../data/activity";
import { ActivityItem, ACTIVITY_SEPARATOR_INSET } from "../../../../features/activity/ActivityRow";
import { fetchActivity } from "../../../../lib/activity";
import { getServices } from "../../../../lib/services";
import { useCompany } from "../../../../state/session";
import { ManagersOnly } from "../../../../features/settings/SettingsList";
import { Button, Card, Empty, Group, ListRow, Notice, Screen, T } from "../../../../ui/components";
import { ModalSheet } from "../../../../ui/ModalSheet";
import { WebIcon } from "../../../../ui/WebIcon";
import { StepList } from "../../../../ui/Progress";
import { color, face, minTap, space, tabular } from "../../../../ui/theme";

// Dashboard (owner, 2026-10-20: "Dashboard should be in the apps"; reverses decision 12), as
// the website's: how the shop is doing. Jobs by status now; quotes and money over six months,
// from the owner_dashboard RPC. Owners and admins only.

const MONTHS = 6;
// The jobs list groups these as "Waiting on Customer".
const WAITING: string[] = ["report_sent", "quote_sent", "quote_accepted", "invoiced"];
const STEPS = [
  "Connecting to the office",
  `Adding up the last ${MONTHS} months`,
  "Getting it ready",
];

type Load =
  | { at: "loading"; step: number }
  | { at: "ready"; data: Dashboard }
  | { at: "error"; message: string };

export default function DashboardScreen() {
  return (
    <ManagersOnly title="Dashboard">
      <DashboardPage />
    </ManagersOnly>
  );
}

function DashboardPage() {
  const company = useCompany();
  const [load, setLoad] = useState<Load>({ at: "loading", step: 0 });
  const [refreshing, setRefreshing] = useState(false);
  // Pull to refresh asks for the latest activity again too.
  const [pulled, setPulled] = useState(0);
  const [activityOpen, setActivityOpen] = useState(false);
  const dot = useActivityUnread(company.id);

  const fetchDashboard = useCallback(
    async (quiet: boolean) => {
      const step = (n: number) => {
        if (!quiet) setLoad({ at: "loading", step: n });
      };
      try {
        step(0);
        const { supabase, sync } = getServices();
        if (!(await sync.accessToken())) throw new Error("Sign in again to see the dashboard.");
        step(1);
        const { data, error } = await supabase.rpc("owner_dashboard", {
          target_company: company.id,
          months: MONTHS,
        });
        if (error || !data) throw new Error(error?.message ?? "No data.");
        step(2);
        setLoad({ at: "ready", data: data as Dashboard });
      } catch (e) {
        const message = e instanceof Error ? e.message : "";
        setLoad({
          at: "error",
          message: /sign in/i.test(message)
            ? message
            : "The dashboard needs a connection. Try again when you have signal.",
        });
      }
    },
    [company.id],
  );

  useEffect(() => {
    const timer = setTimeout(() => void fetchDashboard(false), 0);
    return () => clearTimeout(timer);
  }, [fetchDashboard]);

  async function refresh() {
    setRefreshing(true);
    setPulled((n) => n + 1);
    await fetchDashboard(load.at === "ready");
    setRefreshing(false);
  }

  const d = load.at === "ready" ? load.data : null;
  const range =
    d && d.months.length
      ? `${monthLabel(d.months[0]!.month)} – ${monthLabel(d.months.at(-1)!.month)}`
      : null;

  return (
    <Screen
      title="Dashboard"
      subtitle={range ? `Last ${MONTHS} months · ${range}` : `Last ${MONTHS} months`}
      headerRight={() => <ActivityButton unread={dot} onPress={() => setActivityOpen(true)} />}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
    >
      <LatestActivity open={activityOpen} onClose={() => setActivityOpen(false)} pulled={pulled} />
      {load.at === "loading" ? (
        <Card>
          <StepList steps={STEPS} at={load.step} label="Loading the dashboard" />
        </Card>
      ) : load.at === "error" ? (
        <>
          <Notice tone="warning">{load.message}</Notice>
          <Button title="Try Again" kind="secondary" onPress={() => void fetchDashboard(false)} />
        </>
      ) : d ? (
        <DashboardBody d={d} />
      ) : null}
    </Screen>
  );
}

function DashboardBody({ d }: { d: Dashboard }) {
  const totals = dashboardTotals(d.months);
  const statuses = JOB_STATUSES.map((s) => ({ status: s, n: d.statuses[s] ?? 0 })).filter(
    (s) => s.n > 0,
  );
  const maxStatus = Math.max(1, ...statuses.map((s) => s.n));
  const maxCollected = Math.max(1, ...d.months.map((m) => m.collected_cents));

  return (
    <>
      <View style={styles.stats}>
        <Stat
          label="Collected"
          value={formatCents(totals.collected_cents)}
          note={`${MONTHS} months`}
        />
        <Stat
          label="Owed to you"
          value={formatCents(d.outstanding_cents)}
          note="Open invoices"
          onPress={() => router.push("/invoices?filter=open")}
        />
        <Stat
          label="Quotes accepted"
          value={acceptanceRate(totals.quotes_sent, totals.quotes_accepted)}
          note={`${totals.quotes_accepted} of ${totals.quotes_sent} sent`}
        />
        <Stat
          label="Invoiced"
          value={formatCents(totals.invoiced_cents)}
          note={`${MONTHS} months`}
        />
      </View>

      <Card style={styles.card}>
        <T variant="cardTitle">Collected by Month</T>
        <T variant="secondary" muted>
          Payments received, by card, bank, or check.
        </T>
        <View style={[styles.chart, { borderBottomColor: color.separator }]}>
          {d.months.map((m, i) => {
            const pct = (m.collected_cents / maxCollected) * 100;
            const last = i === d.months.length - 1;
            return (
              <View
                key={m.month}
                style={styles.column}
                accessible
                accessibilityLabel={`${monthLabel(m.month, true)}: ${formatCents(m.collected_cents)} collected`}
              >
                {last && m.collected_cents ? (
                  <T
                    variant="footnote"
                    style={[face.semiBold, tabular, styles.value, { bottom: `${pct}%` }]}
                  >
                    {formatCents(m.collected_cents)}
                  </T>
                ) : null}
                <View
                  style={[
                    styles.bar,
                    {
                      height: `${Math.max(pct, m.collected_cents ? 2 : 0)}%`,
                      backgroundColor: color.chart,
                    },
                  ]}
                />
              </View>
            );
          })}
        </View>
        <View style={styles.months} importantForAccessibility="no-hide-descendants">
          {d.months.map((m) => (
            <T key={m.month} variant="footnote" muted style={[styles.monthName, styles.center]}>
              {monthLabel(m.month).split(" ")[0]}
            </T>
          ))}
        </View>
      </Card>

      <Card style={styles.card}>
        <T variant="cardTitle">Jobs by Status</T>
        <T variant="secondary" muted>
          Every job, as of now.
        </T>
        {statuses.length === 0 ? (
          <Empty>No jobs yet.</Empty>
        ) : (
          <View>
            {statuses.map((s) => (
              <Pressable
                key={s.status}
                accessibilityRole="button"
                accessibilityLabel={`${JOB_STATUS_LABELS[s.status]}: ${s.n}`}
                onPress={() =>
                  router.navigate(
                    `/jobs?status=${WAITING.includes(s.status) ? "follow_up" : s.status}`,
                  )
                }
                style={({ pressed }) => [styles.statusRow, pressed && { opacity: 0.5 }]}
              >
                <T variant="secondary" style={styles.statusLabel}>
                  {JOB_STATUS_LABELS[s.status]}
                </T>
                <View style={styles.statusTrack}>
                  <View
                    style={[
                      styles.statusBar,
                      { width: `${(s.n / maxStatus) * 100}%`, backgroundColor: color.chart },
                    ]}
                  />
                </View>
                <T variant="bodyEmphasis" style={[tabular, styles.count]}>
                  {s.n}
                </T>
              </Pressable>
            ))}
          </View>
        )}
      </Card>

      <View style={{ gap: space["2"] }}>
        <T variant="sectionLabel">By month</T>
        <Group>
          {[...d.months].reverse().map((m) => (
            <ListRow
              key={m.month}
              title={monthLabel(m.month, true)}
              subtitle={`${m.quotes_accepted} of ${m.quotes_sent} quotes accepted${m.quotes_sent ? ` (${acceptanceRate(m.quotes_sent, m.quotes_accepted)})` : ""}\nInvoiced ${formatCents(m.invoiced_cents)} · still owed ${formatCents(m.outstanding_cents)}`}
              detail={`${formatCents(m.collected_cents)} collected`}
              chevron={false}
            />
          ))}
        </Group>
      </View>
    </>
  );
}

/**
 * The Activity button at the right of the navigation bar, at the large title's level (owner,
 * 2026-10-21: "make activity a dropdown on the right side at the same level as the title
 * text"): a tinted pill with a chevron and the blue dot when something is new, as the
 * website's.
 */
function ActivityButton({ unread, onPress }: { unread: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={activityButtonLabel(unread)}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [
        styles.activityButton,
        { backgroundColor: pressed ? color.tintedPressed : color.tinted },
      ]}
    >
      {unread ? <View style={[styles.dot, { backgroundColor: color.primary }]} /> : null}
      <T variant="bodyEmphasis" style={{ color: color.link }}>
        {ACTIVITY_TITLE}
      </T>
      <WebIcon name="chevronDown" size={16} color={color.link} strokeWidth={2.6} />
    </Pressable>
  );
}

/**
 * The Activity sheet: the latest few events, then See All (owner, 2026-10-20: "a shortcut to
 * it on the owner's dashboard page"); as the website's Dashboard.
 */
function LatestActivity({
  open,
  onClose,
  pulled,
}: {
  open: boolean;
  onClose: () => void;
  pulled: number;
}) {
  const company = useCompany();
  const [events, setEvents] = useState<ActivityEvent[] | "offline" | null>(null);
  useEffect(() => {
    if (!open) return;
    let live = true;
    fetchActivity(getServices().supabase, company.id, null, ACTIVITY_DASHBOARD_COUNT).then(
      (page) => live && setEvents(page.events),
      () => live && setEvents((had) => (Array.isArray(had) ? had : "offline")),
    );
    return () => {
      live = false;
    };
  }, [company.id, pulled, open]);
  const now = new Date();
  return (
    <ModalSheet visible={open} onClose={onClose} title={ACTIVITY_TITLE} cancel="Close">
      {events === null ? null : events === "offline" ? (
        <Empty>{ACTIVITY_OFFLINE}</Empty>
      ) : events.length === 0 ? (
        <Empty>{ACTIVITY_EMPTY}</Empty>
      ) : (
        <Group separatorInset={ACTIVITY_SEPARATOR_INSET}>
          {events.map((e) => (
            <ActivityItem key={e.id} row={activityRow(e, now, company.timezone)} onOpen={onClose} />
          ))}
        </Group>
      )}
      <Button
        title={SEARCH_WORDS.seeAll}
        kind="quiet"
        wide
        accessibilityLabel={`${SEARCH_WORDS.seeAll} ${ACTIVITY_TITLE}`}
        onPress={() => {
          onClose();
          router.push("/activity" as never);
        }}
      />
    </ModalSheet>
  );
}

function Stat({
  label,
  value,
  note,
  onPress,
}: {
  label: string;
  value: string;
  note: string;
  onPress?: () => void;
}) {
  const body = (
    <Card style={styles.stat}>
      <T variant="secondary" muted>
        {label}
      </T>
      <T variant="sectionHeading" style={tabular}>
        {value}
      </T>
      <T variant="secondary" style={onPress ? { color: color.link } : undefined} muted={!onPress}>
        {note}
      </T>
    </Card>
  );
  if (!onPress) return <View style={styles.statCell}>{body}</View>;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${label}: ${value}. ${note}`}
      onPress={onPress}
      style={({ pressed }) => [styles.statCell, pressed && { opacity: 0.6 }]}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: "row", flexWrap: "wrap", gap: space["3"] },
  statCell: { flexBasis: "47%", flexGrow: 1 },
  stat: { gap: 2, flexGrow: 1 },
  card: { gap: space["2"] },
  chart: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: space["2"],
    height: 180,
    paddingTop: 24,
    marginTop: space["2"],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  column: { flex: 1, height: "100%", justifyContent: "flex-end" },
  bar: {
    width: "100%",
    maxWidth: 48,
    alignSelf: "center",
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  months: { flexDirection: "row", gap: space["2"] },
  monthName: { flex: 1 },
  center: { textAlign: "center" },
  // The latest month's amount, just above its bar, as wide as it needs.
  value: { position: "absolute", right: 0, width: 140, textAlign: "right", marginBottom: 2 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: space["3"], minHeight: minTap },
  statusLabel: { width: 120 },
  statusTrack: { flex: 1 },
  statusBar: { height: 12, borderTopRightRadius: 4, borderBottomRightRadius: 4 },
  count: { width: 40, textAlign: "right" },
  activityButton: {
    minHeight: minTap,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: space["4"],
    borderRadius: minTap / 2,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
