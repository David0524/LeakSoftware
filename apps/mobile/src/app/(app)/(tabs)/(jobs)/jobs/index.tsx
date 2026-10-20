import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { Animated, Linking, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import {
  JOB_SORTS,
  JOB_TYPE_LABELS,
  canMakeJobs,
  formatAddress,
  formatSchedule,
  jobSort,
  sortJobs,
  type JobStatus,
} from "@leakbook/core";
import { useRows } from "../../../../../data/hooks";
import { useJobViews, type JobView } from "../../../../../data/jobs";
import type { ReportRecord } from "../../../../../data/reports";
import { useCompany, useSession } from "../../../../../state/session";
import {
  Chevron,
  Empty,
  FilterPills,
  HeaderButton,
  SearchField,
  Segmented,
  StatusChip,
  T,
  useScreenChrome,
} from "../../../../../ui/components";
import { haptics } from "../../../../../ui/haptics";
import { useMenu } from "../../../../../ui/Select";
import { SwipeActions } from "../../../../../ui/SwipeRow";
import { WebIcon } from "../../../../../ui/WebIcon";
import { SyncBar } from "../../../../../ui/SyncBar";
import { ScreenTip } from "../../../../../ui/Tip";
import { color, face, MAX_TEXT_SCALE, minTap, shape, space, type } from "../../../../../ui/theme";

const OPEN: JobStatus[] = [
  "unscheduled",
  "scheduled",
  "in_progress",
  "report_sent",
  "quote_sent",
  "quote_accepted",
  "invoiced",
];

/** The website's status filters, in its order (spec 5.2). */
const FILTERS: { value: string; label: string; statuses: JobStatus[] | null }[] = [
  { value: "open", label: "Open", statuses: OPEN },
  { value: "unscheduled", label: "Unscheduled", statuses: ["unscheduled"] },
  { value: "scheduled", label: "Scheduled", statuses: ["scheduled"] },
  { value: "in_progress", label: "In Progress", statuses: ["in_progress"] },
  {
    value: "follow_up",
    label: "Waiting on Customer",
    statuses: ["report_sent", "quote_sent", "quote_accepted", "invoiced"],
  },
  { value: "paid", label: "Paid", statuses: ["paid"] },
  { value: "done", label: "Done", statuses: ["done"] },
  { value: "canceled", label: "Canceled", statuses: ["canceled"] },
  { value: "all", label: "All", statuses: null },
];

/** The Sort picked, kept while the app runs (as the section a job opens on). */
let lastSort: string = "scheduled";

const REPORT_FILTERS = [
  { value: "all", label: "All" },
  { value: "sent", label: "Sent" },
  { value: "draft", label: "Drafts" },
];

type View_ = "jobs" | "reports";

/**
 * Jobs (spec 5.2) and Reports (5.3) in one tab: a segmented control switches the list and the
 * large title. The jobs list filters as you type from the phone's database.
 */
export default function Jobs() {
  const company = useCompany();
  const { services, membership } = useSession();
  const canAdd = canMakeJobs(membership?.role, company.settings);
  const jobs = useJobViews(company.id);
  const reports = useRows<ReportRecord>("report", company.id);
  const [view, setView] = useState<View_>("jobs");
  const [filter, setFilter] = useState("open");
  // Opened from the Dashboard on a status (`/jobs?status=paid`): show that filter.
  const { status: asked } = useLocalSearchParams<{ status?: string }>();
  const [seenStatus, setSeenStatus] = useState<string | undefined>(undefined);
  if (asked !== seenStatus) {
    setSeenStatus(asked);
    if (asked && FILTERS.some((f) => f.value === asked)) {
      setFilter(asked);
      setView("jobs");
    }
  }
  const [reportFilter, setReportFilter] = useState("all");
  const [search, setSearch] = useState("");
  // Sort, as Invoices sorts (owner, 2026-10-20: "Add sorting on the jobs page just like
  // invoices"): Scheduled Date first, kept while the app runs.
  const [sort, setSortState] = useState(() => jobSort(lastSort));
  const setSort = (v: string) => {
    lastSort = v;
    setSortState(jobSort(v));
  };
  const sortLabel = JOB_SORTS.find((x) => x.key === sort)?.label ?? "Scheduled Date";
  const menu = useMenu();
  const [refreshing, setRefreshing] = useState(false);
  const now = new Date();

  const shown = useMemo(() => {
    const statuses = FILTERS.find((f) => f.value === filter)?.statuses;
    const q = search.trim().toLowerCase().replace(/^#/, "");
    const matched = jobs
      .filter((j) => !j.deleted_at)
      .filter((j) => !statuses || statuses.includes(j.status))
      .filter(
        (j) =>
          !q ||
          String(j.number ?? "").includes(q) ||
          (j.customer?.name ?? "").toLowerCase().includes(q),
      );
    // core sortJobs, as the website: the customer's name as `customer`.
    const keyed = matched.map((j) => ({
      job: j,
      number: j.number,
      scheduled_start: j.scheduled_start,
      created_at: (j as { created_at?: string | null }).created_at ?? null,
      customer: j.customer?.name ?? null,
    }));
    return sortJobs(keyed, sort).map((k) => k.job);
  }, [jobs, filter, search, sort]);

  const reportRows = useMemo(() => {
    const byId = new Map(jobs.map((j) => [j.id, j]));
    return reports
      .filter((r) => r.status !== "superseded")
      .filter((r) => reportFilter === "all" || r.status === reportFilter)
      .map((r) => ({ report: r, job: byId.get(r.job_id) }))
      .sort((a, b) => (b.report.sent_at ?? "~").localeCompare(a.report.sent_at ?? "~"));
  }, [reports, jobs, reportFilter]);

  const team = services.sync.team();
  const techName = (id: string | null | undefined) => {
    if (!id) return null;
    const p = team.find((t) => t.id === id);
    return p?.full_name ?? p?.email ?? "Teammate";
  };

  const { header, ref, scrollProps, contentContainerStyle } = useScreenChrome({
    title: view === "jobs" ? "Jobs" : "Reports",
    headerRight:
      canAdd && view === "jobs"
        ? () => <HeaderButton title="New Job" icon="add" onPress={() => router.push("/jobs/new")} />
        : () => null,
  });

  async function refresh() {
    haptics.light();
    setRefreshing(true);
    await services.sync.syncNow();
    setRefreshing(false);
  }

  const top = (
    <View style={styles.top}>
      {header}
      <Segmented
        fill={false}
        minSegmentWidth={112}
        accessibilityLabel="Jobs or reports"
        options={[
          { value: "jobs", label: "Jobs" },
          { value: "reports", label: "Reports" },
        ]}
        value={view}
        onChange={setView}
      />
      <SyncBar onPress={() => router.push("/more/sync")} />
      {view === "jobs" ? (
        <>
          <ScreenTip screen="jobs" />
          <FilterPills label="Status" options={FILTERS} value={filter} onChange={setFilter} />
          <View style={styles.searchRow}>
            <View style={{ flex: 1 }}>
              <SearchField
                value={search}
                onChangeText={setSearch}
                placeholder="Customer name or job number"
              />
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Sort, ${sortLabel}`}
              onPress={() =>
                menu.open({
                  title: "Sort",
                  items: JOB_SORTS.map((x) => ({
                    label: x.label,
                    checked: x.key === sort,
                    onPress: () => setSort(x.key),
                  })),
                })
              }
              style={({ pressed }) => [styles.sort, pressed && { opacity: 0.5 }]}
            >
              <Text
                style={[type.secondary, face.semiBold, { color: color.link }]}
                maxFontSizeMultiplier={MAX_TEXT_SCALE}
              >
                {sortLabel}
              </Text>
              <WebIcon name="updown" size={16} color={color.link} strokeWidth={2} />
            </Pressable>
          </View>
          {menu.element}
        </>
      ) : (
        <FilterPills
          label="Reports"
          options={REPORT_FILTERS}
          value={reportFilter}
          onChange={setReportFilter}
        />
      )}
    </View>
  );

  const empty =
    view === "jobs" ? (
      <Empty>
        {search.trim()
          ? `No jobs match “${search.trim()}”.`
          : "No jobs here. Add one with New Job, or on the phone."}
      </Empty>
    ) : (
      <Empty>
        {reportFilter === "sent"
          ? "No reports sent yet."
          : reportFilter === "draft"
            ? "No drafts."
            : "No reports yet. A job’s report is drafted from its Wrap-Up."}
      </Empty>
    );

  const data: { key: string; node: (first: boolean, last: boolean) => React.ReactNode }[] =
    view === "jobs"
      ? shown.map((j) => ({
          key: j.id,
          node: (first, last) => (
            <JobRow
              job={j}
              tech={techName(j.assigned_user_id)}
              when={
                j.status === "in_progress" && j.started_at
                  ? "Started"
                  : formatSchedule(j.scheduled_start, now, company.timezone)
              }
              first={first}
              last={last}
            />
          ),
        }))
      : reportRows.map(({ report, job }) => ({
          key: report.id,
          node: (first, last) => <ReportRow report={report} job={job} first={first} last={last} />,
        }));

  return (
    <Animated.FlatList
      ref={ref as never}
      {...scrollProps}
      style={{ backgroundColor: color.bg }}
      contentContainerStyle={contentContainerStyle}
      data={data}
      keyExtractor={(d) => d.key}
      ListHeaderComponent={top}
      ListEmptyComponent={empty}
      renderItem={({ item, index }) => <>{item.node(index === 0, index === data.length - 1)}</>}
      initialNumToRender={20}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
    />
  );
}

/** One row of the inset grouped list; the rows share one rounded block. */
function GroupedRow({
  first,
  last,
  onPress,
  label,
  actions,
  onAction,
  children,
}: {
  first: boolean;
  last: boolean;
  onPress: () => void;
  label?: string;
  /** The row's swipe actions, for TalkBack and VoiceOver. */
  actions?: { name: string; label: string }[];
  onAction?: (name: string) => void;
  children: React.ReactNode;
}) {
  return (
    <View
      style={[
        styles.rowBox,
        { backgroundColor: color.surface },
        first && styles.rowFirst,
        last && styles.rowLast,
      ]}
    >
      {first ? null : <View style={[styles.separator, { backgroundColor: color.separator }]} />}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityActions={actions?.length ? actions : undefined}
        onAccessibilityAction={(e) => onAction?.(e.nativeEvent.actionName)}
        onPress={onPress}
        android_ripple={{ color: color.ripple }}
        style={({ pressed }) => [styles.row, pressed && { backgroundColor: color.rowPressed }]}
      >
        {children}
        <Chevron />
      </Pressable>
    </View>
  );
}

function JobRow({
  job,
  tech,
  when,
  first,
  last,
}: {
  job: JobView;
  tech: string | null;
  when: string;
  first: boolean;
  last: boolean;
}) {
  const phone = job.customer?.phone;
  // Swipe left to call (gestures spec section 5); the job's page keeps its Call button.
  const row = (
    <GroupedRow
      first={first}
      last={last}
      onPress={() => router.push(`/jobs/${job.id}`)}
      actions={
        phone ? [{ name: "call", label: `Call ${job.customer?.name ?? "the customer"}` }] : []
      }
      onAction={() => phone && void Linking.openURL(`tel:${phone}`)}
    >
      <View style={styles.rowBody}>
        <T variant="bodyEmphasis" numberOfLines={1}>
          {job.customer?.name ?? "Customer"}
        </T>
        <T variant="secondary" muted>
          {job.number ? `#${job.number}` : "New job"} · {JOB_TYPE_LABELS[job.type]}
        </T>
        {job.property ? (
          <T variant="secondary" muted numberOfLines={1}>
            {formatAddress(job.property)}
          </T>
        ) : null}
        <T variant="secondary">
          {when} · {tech ?? "Unassigned"}
        </T>
      </View>
      <StatusChip status={job.status} style={{ alignSelf: "center" }} />
    </GroupedRow>
  );
  return phone ? (
    <SwipeActions
      trailing={[
        { label: "Call", tint: color.link, onPress: () => void Linking.openURL(`tel:${phone}`) },
      ]}
    >
      {row}
    </SwipeActions>
  ) : (
    row
  );
}

function ReportRow({
  report,
  job,
  first,
  last,
}: {
  report: ReportRecord;
  job?: JobView;
  first: boolean;
  last: boolean;
}) {
  const sent = report.sent_at
    ? `Sent ${new Date(report.sent_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
    : "Draft";
  const template =
    report.template_key === "homeowner"
      ? job?.type === "inspection"
        ? "Pool inspection report"
        : "Homeowner report"
      : report.template_key === "maintenance"
        ? "Visit report"
        : "Partner report";
  return (
    <GroupedRow
      first={first}
      last={last}
      onPress={() => router.push(`/jobs/${report.job_id}?section=wrapup`)}
    >
      <View style={styles.rowBody}>
        <T numberOfLines={1}>
          <T variant="bodyEmphasis">{job?.customer?.name ?? "Customer"}</T>
          <T muted>{job?.number ? ` · Job #${job.number}` : ""}</T>
        </T>
        <T variant="secondary" muted numberOfLines={2}>
          {template} · version {report.version}
          {job?.property ? ` · ${job.property.address_line1}` : ""}
        </T>
      </View>
      <T muted>{sent}</T>
    </GroupedRow>
  );
}

const styles = StyleSheet.create({
  top: { gap: space["5"], marginBottom: space["5"] },
  rowBox: { overflow: "hidden" },
  rowFirst: { borderTopLeftRadius: shape.grouped, borderTopRightRadius: shape.grouped },
  rowLast: { borderBottomLeftRadius: shape.grouped, borderBottomRightRadius: shape.grouped },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: space["4"] },
  row: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: space["3"],
    paddingVertical: 10,
    paddingHorizontal: space["4"],
  },
  rowBody: { flex: 1, gap: 2 },
  searchRow: { flexDirection: "row", alignItems: "center", gap: space["3"] },
  sort: { minHeight: minTap, flexDirection: "row", alignItems: "center", gap: 4 },
});
