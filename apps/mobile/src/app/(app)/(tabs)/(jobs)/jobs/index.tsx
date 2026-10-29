import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { Animated, Linking, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import {
  JOB_SORTS,
  JOB_TYPE_FILTER_TITLE,
  JOB_TYPE_LABELS,
  REPORT_SORTS,
  canMakeJobs,
  companyServices,
  formatAddress,
  formatSchedule,
  jobReschedulable,
  jobSort,
  jobTypeFilter,
  jobsEmpty,
  jobTypeFilterLabel,
  jobTypeFilters,
  matchesJobType,
  propertyLocation,
  reportSort,
  reportsEmpty,
  sortJobs,
  toE164,
  type JobStatus,
  type JobTypeFilter,
} from "@leakbook/core";
import { useRows } from "../../../../../data/hooks";
import { useJobViews, type JobView } from "../../../../../data/jobs";
import type { ReportRecord } from "../../../../../data/reports";
import { useConversations, useLine } from "../../../../../data/texting";
import {
  confirmCompleteVisit,
  useCompleteJobBlocker,
} from "../../../../../features/job/CompleteJob";
import { useJobMove } from "../../../../../features/job/JobSchedule";
import {
  REPORT_SEARCH_PLACEHOLDER,
  listReports,
  reportsNoMatch,
} from "../../../../../lib/reportList";
import { bannerText } from "../../../../../lib/resultBanner";
import {
  jobCompletable,
  jobRowActions,
  menuTitle,
  reportRowActions,
  type JobActionId,
} from "../../../../../lib/rowActions";
import { queueAutoVisitReport } from "../../../../../lib/visitReports";
import { openDirections, useDirectionsChoice } from "../../../../../state/directions";
import { useCompany, useSession } from "../../../../../state/session";
import {
  Chevron,
  Empty,
  FilterPills,
  HeaderButton,
  Segmented,
  StatusChip,
  T,
  useScreenChrome,
  SamplePill,
} from "../../../../../ui/components";
import {
  ShopSearchField,
  ShopSearchResults,
  useShopSearchState,
} from "../../../../../features/search/ShopSearch";
import { haptics } from "../../../../../ui/haptics";
import { useResultBanner } from "../../../../../ui/ResultBanner";
import { rowGestures, useRowMenu, type RowGestures } from "../../../../../ui/RowMenu";
import { MenuButton, useMenu } from "../../../../../ui/Select";
import { SwipeActions } from "../../../../../ui/SwipeRow";
import { SyncBar } from "../../../../../ui/SyncBar";
import { color, shape, space } from "../../../../../ui/theme";

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
/** The Type picked (owner, 2026-10-22), kept the same way. */
let lastType: string = "all";
/** Reports' Sort (owner, 2026-10-25), kept the same way; Type is shared with Jobs. */
let lastReportSort: string = "newest";

const REPORT_FILTERS = [
  { value: "all", label: "All" },
  { value: "sent", label: "Sent" },
  { value: "draft", label: "Drafts" },
];

type View_ = "jobs" | "reports";

/**
 * Jobs (spec 5.2) and Reports (5.3) in one tab: a segmented control switches the list and the
 * large title. Under the Jobs title, one search across the shop (owner, 2026-10-20; docs/plans/
 * search-and-activity.md), as the phone website's: while it's in use its results take the
 * list's place, and Cancel puts the list back. It replaces the jobs-only search.
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
  const shop = useShopSearchState();
  const searching = view === "jobs" && shop.searching;
  // Sort, as Invoices sorts (owner, 2026-10-20: "Add sorting on the jobs page just like
  // invoices"): Scheduled Date first, kept while the app runs.
  const [sort, setSortState] = useState(() => jobSort(lastSort));
  const setSort = (v: string) => {
    lastSort = v;
    setSortState(jobSort(v));
  };
  const sortLabel = JOB_SORTS.find((x) => x.key === sort)?.label ?? "Scheduled Date";
  // Type (owner, 2026-10-22: "Add a filter on the jobs and activity pages for job type"): the
  // shop's job types, with the status filter and Sort; kept while the app runs.
  const shopServices = companyServices(company.settings);
  const types = jobTypeFilters(shopServices);
  const [typeKey, setTypeKey] = useState(lastType);
  const jobType = jobTypeFilter(typeKey, shopServices);
  const setType = (v: string) => {
    lastType = v;
    setTypeKey(v);
  };
  const [reportSortKey, setReportSortKey] = useState(() => reportSort(lastReportSort));
  const setReportSort = (v: string) => {
    lastReportSort = v;
    setReportSortKey(reportSort(v));
  };
  const reportSortLabel = REPORT_SORTS.find((x) => x.key === reportSortKey)?.label ?? "Newest";
  // Reports' own search (owner, 2026-10-25): the customer's name or the job number.
  const reportSearch = useShopSearchState();
  const reportQuery = reportSearch.query;
  const menu = useMenu();
  const [refreshing, setRefreshing] = useState(false);
  const now = new Date();
  // Swipe actions and touch-and-hold menus (gestures spec section 12): each does what the job
  // page's own button does, and says so in the top banner.
  const banner = useResultBanner();
  const rowMenu = useRowMenu();
  const mover = useJobMove((r) =>
    banner.show(
      r.error
        ? { tone: "error", message: r.error }
        : { tone: "success", ...bannerText(r.message ?? "Moved."), undo: r.undo },
    ),
  );
  const line = useLine(company.id);
  const conversations = useConversations(company.id);
  const [choice] = useDirectionsChoice();

  /** The job page's Call, Text, Directions, Change Schedule and Complete Job. */
  function runJob(j: JobView, id: JobActionId, complete: () => void) {
    const phone = j.customer?.phone;
    if (id === "open") router.push(`/jobs/${j.id}`);
    if (id === "call" && phone) void Linking.openURL(`tel:${phone}`);
    if (id === "message" && phone) {
      if (line?.status !== "active") return void Linking.openURL(`sms:${phone}`);
      const e164 = toE164(phone);
      const c = e164 ? conversations.find((x) => x.phone === e164) : undefined;
      router.push(c ? `/messages/${c.id}` : `/messages/new?customer=${j.customer?.id}&job=${j.id}`);
    }
    if (id === "directions" && j.property)
      openDirections(
        { address: formatAddress(j.property), location: propertyLocation(j.property) },
        choice,
      );
    if (id === "move") mover.open(j);
    if (id === "complete") complete();
  }

  function gesturesFor(j: JobView, complete: () => void): RowGestures {
    const actions = jobRowActions({
      status: j.status,
      type: j.type,
      phone: j.customer?.phone,
      hasAddress: Boolean(j.property),
      reschedulable: jobReschedulable(j),
    });
    const run = (id: JobActionId) => runJob(j, id, complete);
    return rowGestures(actions, run, () =>
      rowMenu.open(
        menuTitle(j.customer?.name, j.number ? `#${j.number}` : null),
        actions.menu,
        run,
      ),
    );
  }

  /**
   * Complete Job, as the job page's (the shop's checklist and photo rules, the question before
   * an automatic visit report); the banner says it's done, with Undo back to where it was.
   */
  function completeJob(j: JobView, blocker: string | null) {
    if (blocker) {
      banner.show({ tone: "error", message: blocker, detail: "Open the job to finish it." });
      return;
    }
    const before = j.status;
    confirmCompleteVisit(j, j.customer?.name, company.settings, () => {
      services.sync.write("job", j.id, company.id, { status: "done" });
      queueAutoVisitReport(j, company.settings);
      banner.show({
        tone: "success",
        message: `${j.customer?.name ?? "The visit"} done`,
        undo: () => services.sync.write("job", j.id, company.id, { status: before }),
      });
    });
  }

  const shown = useMemo(() => {
    const statuses = FILTERS.find((f) => f.value === filter)?.statuses;
    const matched = jobs
      .filter((j) => !j.deleted_at)
      .filter((j) => !statuses || statuses.includes(j.status))
      .filter((j) => matchesJobType(j.type, jobType));
    // core sortJobs, as the website: the customer's name as `customer`.
    const keyed = matched.map((j) => ({
      job: j,
      number: j.number,
      scheduled_start: j.scheduled_start,
      created_at: (j as { created_at?: string | null }).created_at ?? null,
      customer: j.customer?.name ?? null,
    }));
    return sortJobs(keyed, sort).map((k) => k.job);
  }, [jobs, filter, sort, jobType]);

  const reportRows = useMemo(() => {
    const byId = new Map(jobs.map((j) => [j.id, j]));
    return listReports(
      reports.map((r) => ({ ...r, job: byId.get(r.job_id) })),
      { status: reportFilter, type: jobType, search: reportQuery, sort: reportSortKey },
    ).map((r) => ({ report: r as ReportRecord, job: r.job }));
  }, [reports, jobs, reportFilter, jobType, reportQuery, reportSortKey]);

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

  // One tree whether searching or not, so the field keeps its focus as the results appear.
  const top = (
    <View style={styles.top}>
      {header}
      {view === "jobs" ? (
        <ShopSearchField search={shop} />
      ) : (
        <ShopSearchField search={reportSearch} placeholder={REPORT_SEARCH_PLACEHOLDER} />
      )}
      {searching ? (
        <ShopSearchResults search={shop} />
      ) : (
        <>
          <Segmented
            fill={false}
            minSegmentWidth={88}
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
              <FilterPills label="Status" options={FILTERS} value={filter} onChange={setFilter} />
              {/* Type and Sort, as the website's; the search across the shop above replaces the
                  old jobs-only search. */}
              <TypeAndSort
                menu={menu}
                types={types}
                jobType={jobType}
                onType={setType}
                sorts={JOB_SORTS}
                sort={sort}
                sortLabel={sortLabel}
                onSort={setSort}
              />
              {menu.element}
            </>
          ) : (
            <>
              <FilterPills
                label="Reports"
                options={REPORT_FILTERS}
                value={reportFilter}
                onChange={setReportFilter}
              />
              <TypeAndSort
                menu={menu}
                types={types}
                jobType={jobType}
                onType={setType}
                sorts={REPORT_SORTS}
                sort={reportSortKey}
                sortLabel={reportSortLabel}
                onSort={setReportSort}
              />
              {menu.element}
            </>
          )}
        </>
      )}
    </View>
  );

  const empty = searching ? null : view === "jobs" ? (
    <Empty>{jobsEmpty(jobType)}</Empty>
  ) : (
    <Empty>
      {reportSearch.query.trim()
        ? reportsNoMatch(reportSearch.query)
        : (reportsEmpty(jobType) ??
          (reportFilter === "sent"
            ? "No reports sent yet."
            : reportFilter === "draft"
              ? "No drafts."
              : "No reports yet. A job’s report is drafted from its Wrap-Up."))}
    </Empty>
  );

  const data: { key: string; node: (first: boolean, last: boolean) => React.ReactNode }[] =
    searching
      ? []
      : view === "jobs"
        ? shown.map((j) => ({
            key: j.id,
            node: (first, last) => (
              <JobRow
                job={j}
                gestures={gesturesFor}
                onComplete={completeJob}
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
            node: (first, last) => (
              <ReportRow
                report={report}
                job={job}
                first={first}
                last={last}
                onMenu={(open) =>
                  rowMenu.open(
                    menuTitle(job?.customer?.name, job?.number ? `#${job.number}` : null),
                    reportRowActions().menu,
                    open,
                  )
                }
              />
            ),
          }));

  return (
    <View style={{ flex: 1, backgroundColor: color.bg }}>
      <Animated.FlatList
        ref={ref as never}
        {...scrollProps}
        style={{ backgroundColor: color.bg }}
        contentContainerStyle={contentContainerStyle}
        data={data}
        keyExtractor={(d) => d.key}
        ListHeaderComponent={top}
        ListEmptyComponent={empty}
        // Results stay tappable with the keyboard up; scrolling puts it away.
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        renderItem={({ item, index }) => <>{item.node(index === 0, index === data.length - 1)}</>}
        initialNumToRender={20}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      />
      {rowMenu.element}
      {mover.element}
      {banner.element}
    </View>
  );
}

/** The Type and Sort menu buttons, on Jobs and Reports alike. */
function TypeAndSort({
  menu,
  types,
  jobType,
  onType,
  sorts,
  sort,
  sortLabel,
  onSort,
}: {
  menu: ReturnType<typeof useMenu>;
  types: { key: string; label: string }[];
  jobType: string;
  onType: (v: string) => void;
  sorts: { key: string; label: string }[];
  sort: string;
  sortLabel: string;
  onSort: (v: string) => void;
}) {
  return (
    <View style={styles.searchRow}>
      <MenuButton
        title={JOB_TYPE_FILTER_TITLE}
        value={jobTypeFilterLabel(jobType as JobTypeFilter)}
        icon="filter"
        onPress={() =>
          menu.open({
            title: JOB_TYPE_FILTER_TITLE,
            items: types.map((x) => ({
              label: x.label,
              checked: x.key === jobType,
              onPress: () => onType(x.key),
            })),
          })
        }
      />
      <MenuButton
        title="Sort"
        value={sortLabel}
        icon="updown"
        onPress={() =>
          menu.open({
            title: "Sort",
            items: sorts.map((x) => ({
              label: x.label,
              checked: x.key === sort,
              onPress: () => onSort(x.key),
            })),
          })
        }
      />
    </View>
  );
}

/** One row of the inset grouped list; the rows share one rounded block. */
function GroupedRow({
  first,
  last,
  onPress,
  label,
  gestures,
  children,
}: {
  first: boolean;
  last: boolean;
  onPress: () => void;
  label?: string;
  /** Its swipe actions, for TalkBack and VoiceOver too, and touch and hold for its menu. */
  gestures?: RowGestures;
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
        accessibilityActions={
          gestures?.accessibilityActions.length ? gestures.accessibilityActions : undefined
        }
        onAccessibilityAction={gestures?.onAccessibilityAction}
        onPress={onPress}
        onLongPress={gestures?.onLongPress}
        android_ripple={{ color: color.ripple }}
        style={({ pressed }) => [styles.row, pressed && { backgroundColor: color.rowPressed }]}
      >
        {children}
        <Chevron />
      </Pressable>
    </View>
  );
}

function JobRow(props: JobRowProps) {
  // Only a visit that can be completed checks the shop's rules for Complete Job.
  return jobCompletable(props.job) ? <CompletableJobRow {...props} /> : <JobRowFace {...props} />;
}

interface JobRowProps {
  job: JobView;
  gestures: (job: JobView, complete: () => void) => RowGestures;
  onComplete: (job: JobView, blocker: string | null) => void;
  tech: string | null;
  when: string;
  first: boolean;
  last: boolean;
}

function CompletableJobRow(props: JobRowProps) {
  const blocker = useCompleteJobBlocker(props.job);
  return <JobRowFace {...props} blocker={blocker} />;
}

function JobRowFace({
  job,
  gestures,
  onComplete,
  tech,
  when,
  first,
  last,
  blocker = null,
}: JobRowProps & { blocker?: string | null }) {
  // Swipe left to Call or get Directions, right to Mark Complete; touch and hold for the menu
  // (gestures spec section 12). The job's page keeps every one of these as a button.
  const g = gestures(job, () => onComplete(job, blocker));
  const row = (
    <GroupedRow
      first={first}
      last={last}
      onPress={() => router.push(`/jobs/${job.id}`)}
      gestures={g}
    >
      <View style={styles.rowBody}>
        <View style={styles.nameRow}>
          <T variant="bodyEmphasis" numberOfLines={1} style={{ flexShrink: 1 }}>
            {job.customer?.name ?? "Customer"}
          </T>
          {job.sample ? <SamplePill /> : null}
        </View>
        <T variant="secondary" muted>
          {job.number ? `#${job.number}` : job.sample ? "Sample job" : "New job"} ·{" "}
          {JOB_TYPE_LABELS[job.type]}
        </T>
        {job.property ? (
          <T variant="secondary" muted numberOfLines={1}>
            {formatAddress(job.property)}
          </T>
        ) : null}
        <T variant="secondary">
          {when}
          {/* The dot stays with the time, so a wrapped line never starts with it. */}
          {"\u00a0· "}
          {tech ?? "Unassigned"}
        </T>
      </View>
      <StatusChip status={job.status} style={{ alignSelf: "center" }} />
    </GroupedRow>
  );
  return g.leading || g.trailing.length ? (
    <SwipeActions leading={g.leading} trailing={g.trailing}>
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
  onMenu,
}: {
  report: ReportRecord;
  job?: JobView;
  first: boolean;
  last: boolean;
  /** Touch and hold: the report's menu, given what Open does. */
  onMenu: (open: () => void) => void;
}) {
  const open = () => router.push(`/jobs/${report.job_id}?section=wrapup`);
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
        : report.template_key === "maintenance_month"
          ? "Monthly service report"
          : "Partner report";
  return (
    <GroupedRow
      first={first}
      last={last}
      onPress={open}
      gestures={rowGestures(reportRowActions(), open, () => onMenu(open))}
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
  nameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: space["3"],
  },
});
