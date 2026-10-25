import { router, useLocalSearchParams } from "expo-router";
import { useRoute } from "expo-router/react-navigation";
import { useEffect, useRef, useState } from "react";
import { pageFits } from "../../../../../../lib/pageScroll";
import { Animated, Linking, StyleSheet, TextInput, View } from "react-native";
import Reanimated, { FadeIn, FadeInLeft, FadeInRight } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  MAPS_LABELS,
  JOB_TYPE_LABELS,
  POOL_TYPE_LABELS,
  intakeQuestionsFor,
  formatAddress,
  mapStatus,
  formatCents,
  formatSchedule,
  jobActionLabel,
  parseGallons,
  jobFeeLabel,
  jobHasWrapUp,
  jobHasChecklist,
  parseDollars,
  propertyLocation,
  toE164,
  type CompanySettings,
  REPAIR_ITEM_KEY,
  REPAIR_ITEM_LABEL,
  type Customer,
  type Job,
  type JobStatus,
  type Property,
  type PriceBookItem,
  COMPLETE_READY_LINE,
  checklistReady,
  visitReportBar,
  visitReportMode,
} from "@leakbook/core";
import * as WebBrowser from "expo-web-browser";
import type { JsonValue } from "@leakbook/sync";
import { useRow, useRows } from "../../../../../../data/hooks";
import { JobRepairs } from "../../../../../../features/job/Repairs";
import { useJobReports } from "../../../../../../data/reports";
import { API_URL } from "../../../../../../lib/config";
import { WrapUpList, useWrapUp, type WrapUpOpen } from "../../../../../../features/job/WrapUp";
import { AUTOSAVE_DELAY_MS } from "../../../../../../lib/autosave";
import {
  NEXT_STEP_LABELS,
  jobMoves,
  nextStepButtons,
  type NextStep,
} from "../../../../../../lib/nextStep";
import {
  useChecklistProgress,
  useInspectionConfig,
  useJobInspection,
} from "../../../../../../data/inspection";
import { useConversations, useLine } from "../../../../../../data/texting";
import { openDirections, useDirectionsChoice } from "../../../../../../state/directions";
import { useCompany, useSession } from "../../../../../../state/session";
import {
  Button,
  Group,
  ListRow,
  Notice,
  RoundButton,
  Screen,
  Section,
  Segmented,
  StatusChip,
  T,
  Toggle,
  useReduceMotion,
  useScreenChrome,
} from "../../../../../../ui/components";
import { BAR_HEIGHT, barState, setBarStill } from "../../../../../../ui/Bar";
import { confirmDestructive } from "../../../../../../ui/confirm";
import { Glass } from "../../../../../../ui/Glass";
import {
  CompleteBlockedNotice,
  confirmCompleteVisit,
  useCompleteJobBlocker,
} from "../../../../../../features/job/CompleteJob";
import {
  NEXT_STEP_BAR_HEIGHT,
  NEXT_STEP_NOTE_HEIGHT,
  NextStepBar,
  type NextStepButton,
} from "../../../../../../features/job/NextStepBar";
import { KeyboardAvoider } from "../../../../../../ui/keyboard";
import { SwipeNav, useNoSwipe } from "../../../../../../ui/SwipeNav";
import { usePinnedSyncBar } from "../../../../../../ui/SyncBar";
import { AddressLine, NotOnMapRow } from "../../../../../../ui/NotOnMap";
import { ModalSheet, useUnsavedChanges } from "../../../../../../ui/ModalSheet";
import { useTeam } from "../../../../../../data/schedule";
import { TechValue } from "../../../../../../ui/TechDot";
import { PoolForm } from "../../../../../../features/pool/PoolForm";
import { AccessNotesRow } from "../../../../../../features/pool/AccessNotes";
import { useRoutingOn } from "../../../../../../lib/routing";
import {
  color,
  drawnChrome,
  face,
  gutter,
  minTap,
  shape,
  space,
  tabular,
  type,
} from "../../../../../../ui/theme";
import { ChecklistTab } from "../../../../../../features/inspection/ChecklistTab";
import { DiagramPanel } from "../../../../../../features/inspection/DiagramPanel";
import { VisitChemicals } from "../../../../../../features/chemicals/VisitChemicals";
import { VisitCleanings } from "../../../../../../features/maintenance/Cleanings";
import { VisitReport } from "../../../../../../features/maintenance/VisitReport";
import { queueAutoVisitReport } from "../../../../../../lib/visitReports";
import { FindingsTab } from "../../../../../../features/inspection/FindingsTab";
import { TestsTab } from "../../../../../../features/inspection/TestsTab";
import { JobSchedule, showsJobSchedule } from "../../../../../../features/job/JobSchedule";
import { JobTimeline } from "../../../../../../features/job/Timeline";
import { useRememberOpened } from "../../../../../../features/search/useRememberOpened";
import { SampleJob } from "../../../../../../features/sample/SampleJob";
import { MediaSection, type MediaControls } from "../../../../../../features/media/MediaSection";
import { QuoteTab } from "../../../../../../features/quote/QuoteTab";
import { type ReportControls } from "../../../../../../features/report/ReportTab";

type JobSection = "details" | "checklist" | "findings" | "photos" | "wrapup";

/** The section shown, per job, while the app runs (the website keeps it in the URL). */
const lastSection = new Map<string, JobSection>();

/**
 * The job page (spec 5.4): the header with the status and its next steps, then the section
 * switcher (Details, Checklist, Findings, Photos, Wrap-Up), pinned under the bar once
 * scrolled. The sections hold the existing parts for now; each gets the website's look in the
 * screen-by-screen restyle. The Next Step bar above the tab bar holds the likely next step
 * (owner, 2026-10-20: one-handed use, item 1), and the sync bar stays pinned under the bar.
 */
export default function JobDetail() {
  const { id, section: asked } = useLocalSearchParams<{ id: string; section?: string }>();
  const company = useCompany();
  const { services } = useSession();
  const job = useRow<Job>("job", id);
  const property = useRow<Property>("property", job?.property_id);
  const customer = useRow<Customer>("customer", job?.bill_to_customer_id ?? property?.customer_id);
  // First under Recent in search (docs/plans/search-and-activity.md), as the website's.
  useRememberOpened(
    job
      ? {
          kind: "job",
          id: job.id,
          title: `${job.number ? `Job #${job.number}` : "New job"} · ${JOB_TYPE_LABELS[job.type] ?? "Job"}`,
          detail: customer?.name ?? null,
        }
      : null,
  );
  const insp = useJobInspection(company.id, id);
  const insets = useSafeAreaInsets();
  const [section, setSectionState] = useState<JobSection>(
    // Wrap-Up from a report link; Checklist from Today's card's Open Checklist (2026-10-20).
    () => (asked === "wrapup" || asked === "checklist" ? asked : lastSection.get(id)) ?? "details",
  );
  const [switcherY, setSwitcherY] = useState<number | null>(null);
  // Complete Job waits for the checklist or a photo when the shop asks (owner, 2026-10-19).
  const blocker = useCompleteJobBlocker({ id, company_id: company.id, type: job?.type });
  // A pool inspection counts only the questions its gates leave open (2026-10-20).
  const progress = useChecklistProgress(company.id, id, job?.type);
  const [completeAsked, setCompleteAsked] = useState<"header" | "checklist" | null>(null);
  const config = useInspectionConfig(company.id);
  const reports = useJobReports(company.id, id);
  // Wrap-Up's open step (owner, 2026-10-22: the finish list), also opened by the bar.
  const [wrapUpOpen, setWrapUpOpen] = useState<WrapUpOpen | null>(null);
  // A done maintenance visit's Visit Report sheet (owner, 2026-10-22: "really buried").
  const [visitSheet, setVisitSheet] = useState(false);
  const wrap = useWrapUp(
    id,
    job?.type ?? "detection",
    customer?.name ?? null,
    insp.findings.length,
    insp.tests.length,
  );
  const mediaControls = useRef<MediaControls | null>(null);
  const reportControls = useRef<ReportControls | null>(null);
  const sync = usePinnedSyncBar(() => router.push("/more/sync"));
  const {
    header: titleBlock,
    ref: scroll,
    scrollProps,
    contentContainerStyle,
  } = useScreenChrome({
    // The customer's name on top, the job number smaller below (owner, 2026-10-20).
    title: job ? (customer?.name ?? (job.number ? `Job #${job.number}` : "New Job")) : "Job",
    topInset: sync.height,
  });
  const routeKey = useRoute().key;
  const barY = barState(routeKey).y;
  const reduceMotion = useReduceMotion();
  // Each section keeps its scroll position (gestures spec section 4): where the page was when
  // the tech left it, put back when they come back to it.
  const scrollY = useRef(0);
  const positions = useRef(new Map<JobSection, number>());
  const restoreTo = useRef<number | null>(null);
  useEffect(() => {
    const listener = barY.addListener(({ value }) => {
      scrollY.current = value;
    });
    return () => barY.removeListener(listener);
  }, [barY]);
  // A page that fits on the screen doesn't scroll, so its large title never shrinks on a bounce
  // (owner, 2026-10-20: "it doesn't make sense for the nav bar to shrink on scroll" on a short
  // Findings tile). Sizes from the scroll view itself.
  const [viewHeight, setViewHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  const fits = pageFits(contentHeight, viewHeight);
  // Which way the section changed, for the slide in (none on the first draw).
  const [enterFrom, setEnterFrom] = useState<1 | -1 | null>(null);

  const sectionRef = useRef(section);
  useEffect(() => {
    sectionRef.current = section;
  });
  // Every section sits on tiles: the bar keeps its large title on all of them, so switching
  // sections never moves it, as on the website and the iPhone app (owner, 2026-10-21: on
  // Findings and Wrap Up "the navigation bar should not shrink").
  useEffect(() => {
    setBarStill(routeKey, true);
    return () => setBarStill(routeKey, false);
  }, [routeKey]);

  function scrollTo(y: number) {
    (
      scroll.current as unknown as { scrollTo?: (o: { y: number; animated: boolean }) => void }
    )?.scrollTo?.({ y, animated: false });
  }

  function setSection(next: JobSection, dir?: 1 | -1) {
    if (next === sectionRef.current) return;
    positions.current.set(sectionRef.current, scrollY.current);
    lastSection.set(id, next);
    setEnterFrom(dir ?? null);
    setSectionState(next);
    // Back where it was, once the section has drawn (onContentSizeChange), else the top.
    restoreTo.current = positions.current.get(next) ?? 0;
    if (restoreTo.current === 0) {
      scrollTo(0);
      barY.setValue(0);
    }
  }

  if (!job) {
    return (
      <Screen title="Job">
        <Notice tone="warning">This job isn’t on this phone.</Notice>
      </Screen>
    );
  }
  // The sample job opens to its finished report (owner, 2026-10-22: first win).
  if (job.sample) return <SampleJob job={job} customer={customer?.name ?? "Sample Customer"} />;

  const maintenance = job.type === "maintenance";
  const { tally, inspection } = progress;
  const sections: { value: JobSection; label: string; badge?: number }[] = [
    { value: "details", label: "Details" },
    // A repair job has no checklist (owner, 2026-10-22: "Remove the checklist entirely for
    // repair jobs."); rows an older one has are kept, not shown.
    ...(jobHasChecklist(job.type)
      ? [{ value: "checklist" as const, label: "Checklist", badge: progress.toDo || undefined }]
      : []),
    ...(maintenance ? [] : [{ value: "findings" as const, label: "Findings" }]),
    { value: "photos", label: "Photos" },
    // Visits end with Complete Job and are billed monthly: no Wrap-Up (owner, 2026-10-19).
    ...(jobHasWrapUp(job.type) ? [{ value: "wrapup" as const, label: "Wrap-Up" }] : []),
  ];
  const shown = sections.some((s) => s.value === section) ? section : "details";
  const shownAt = sections.findIndex((s) => s.value === shown);

  const update = (values: Record<string, JsonValue>) =>
    services.sync.write("job", job.id, company.id, values);
  function changeStatus(to: JobStatus, from: "header" | "checklist" = "header") {
    if (to === "done" && blocker) return setCompleteAsked(from);
    setCompleteAsked(null);
    const apply = () => {
      const values: Record<string, JsonValue> = { status: to };
      if (to === "in_progress" && !job!.started_at) values.started_at = new Date().toISOString();
      update(values);
      // Automatic visit reports: sent once the completed visit reaches the server.
      if (to === "done") queueAutoVisitReport(job!, company.settings);
    };
    // Completing asks first when it sends the visit report (owner, 2026-10-20).
    if (to === "done") return confirmCompleteVisit(job!, customer?.name, company.settings, apply);
    apply();
  }
  // Start Job moved to the Next Step bar (owner, 2026-10-20); the other moves stay here.
  const startable = job.status === "scheduled" || job.status === "unscheduled";
  const transitions = jobMoves(job.status, job.type).filter(
    (to) => to !== "canceled" && !(to === "in_progress" && startable),
  );

  // A maintenance visit's report on the bar (core visitReportBar), and its page once sent.
  const visitLatest = reports.find((r) => r.template_key === "maintenance" && r.status === "sent");
  const visitToken = visitLatest?.token ?? null;
  const visitBar = maintenance
    ? visitReportBar({
        jobType: job.type,
        status: job.status,
        mode: visitReportMode(company.settings),
        sentAt: visitLatest?.sent_at ?? null,
        now: new Date(),
        timeZone: company.timezone,
      })
    : null;

  // The Next Step bar: first match wins (lib/nextStep).
  const steps = nextStepButtons({
    section: shown,
    status: job.status,
    jobType: job.type,
    hasTestTypes: config.testTypes.length > 0,
    wrapUpAction: jobHasWrapUp(job.type) ? (wrap.next?.action ?? null) : null,
    visitAction: visitBar?.action ?? null,
  });
  const act: Record<NextStep, () => void> = {
    start: () => changeStatus("in_progress"),
    complete: () => changeStatus("done", "checklist"),
    "add-test": () => router.push(`/jobs/${job.id}/test/new`),
    "add-finding": () => router.push(`/jobs/${job.id}/finding/new`),
    "add-photo": () => mediaControls.current?.photo(),
    "add-video": () => mediaControls.current?.video(),
    // As tapping the next row, except Review with Customer, which starts the review at once.
    "wrap-up": () => {
      const next = wrap.next;
      if (!next) return;
      if (next.step === "sign") router.push(`/jobs/${job.id}/review?template=homeowner`);
      else setWrapUpOpen({ step: next.step, id: next.id });
    },
    "visit-report": () => {
      if (visitBar?.action === "view" && visitToken && API_URL)
        void WebBrowser.openBrowserAsync(`${API_URL}/r/${visitToken}`);
      else setVisitSheet(true);
    },
  };
  // Everything on the visit's checklist is done: Complete Job is the last thing (owner,
  // 2026-10-22), so the bar says so and the button scales in once.
  const listed = tally.pass + tally.attention + tally.leaking + tally.notApplicable + tally.pending;
  const ready =
    maintenance && steps.includes("complete") && checklistReady(listed - tally.pending, listed);
  const barButtons: NextStepButton[] = steps.map((step, i) => ({
    title:
      step === "wrap-up"
        ? (wrap.next?.action ?? NEXT_STEP_LABELS[step])
        : step === "visit-report"
          ? (visitBar?.label ?? NEXT_STEP_LABELS[step])
          : NEXT_STEP_LABELS[step],
    kind: i === 0 ? "primary" : "secondary",
    onPress: act[step],
  }));

  const switcher = (
    <Segmented
      variant="switcher"
      accessibilityLabel="Job sections"
      options={sections}
      value={shown}
      onChange={(v) => {
        const to = sections.findIndex((x) => x.value === v);
        setSection(v, to > shownAt ? 1 : -1);
      }}
    />
  );

  // Drawn bar (Android, browser): a copy of the switcher pinned under the bar once the page
  // has scrolled it there. iPhone pins the switcher itself (a sticky header).
  const barBottom = insets.top + BAR_HEIGHT;
  const pinned =
    drawnChrome && switcherY != null
      ? barY.interpolate({
          inputRange: [
            switcherY - barBottom - sync.height - 1,
            switcherY - barBottom - sync.height,
          ],
          outputRange: [0, 1],
          extrapolate: "clamp",
        })
      : null;

  return (
    // Fields stay above the keyboard, edge to edge on Android too (owner, 2026-10-20).
    <KeyboardAvoider style={{ flex: 1, backgroundColor: color.bg }}>
      <Animated.ScrollView
        ref={scroll}
        {...scrollProps}
        contentContainerStyle={[
          contentContainerStyle,
          // The last row scrolls clear of the Next Step bar.
          barButtons.length > 0 && {
            paddingBottom:
              (contentContainerStyle.paddingBottom as number) +
              NEXT_STEP_BAR_HEIGHT +
              space["2"] +
              (ready ? NEXT_STEP_NOTE_HEIGHT : 0),
          },
        ]}
        stickyHeaderIndices={drawnChrome ? undefined : [1]}
        scrollEnabled={!fits}
        alwaysBounceVertical={false}
        overScrollMode={fits ? "never" : "auto"}
        onLayout={(e) => setViewHeight(e.nativeEvent.layout.height)}
        onContentSizeChange={(_w, h) => {
          setContentHeight(h);
          if (restoreTo.current != null && restoreTo.current > 0) {
            scrollTo(Math.min(restoreTo.current, Math.max(0, h - viewHeight)));
            restoreTo.current = null;
          }
        }}
      >
        <View style={styles.header}>
          {titleBlock}
          <View style={styles.subtitle}>
            {customer && job.number ? <T muted>{`Job #${job.number}`}</T> : null}
            <StatusChip status={job.status} />
            <T muted>{JOB_TYPE_LABELS[job.type]}</T>
          </View>
          <T muted>
            {job.status === "in_progress" && job.started_at
              ? `Started ${formatSchedule(job.started_at, new Date(), company.timezone)}`
              : formatSchedule(job.scheduled_start, new Date(), company.timezone)}
          </T>
          {transitions.length > 0 ? (
            <View style={styles.actions}>
              {transitions.map((to) => (
                <Button
                  key={to}
                  title={jobActionLabel(job.status, to)}
                  kind={to === "in_progress" ? "primary" : "secondary"}
                  onPress={() => changeStatus(to)}
                />
              ))}
            </View>
          ) : null}
          {completeAsked === "header" && blocker ? (
            <CompleteBlockedNotice jobId={job.id} message={blocker} />
          ) : null}
        </View>
        <View
          style={[styles.switcher, !drawnChrome && { backgroundColor: color.bg }]}
          onLayout={(e) => setSwitcherY(e.nativeEvent.layout.y)}
        >
          {switcher}
        </View>
        {/* Swipe sideways for the section before or after (owner, 2026-10-19); the switcher
            above stays the visible way. */}
        <SwipeNav
          style={styles.content}
          onPrevious={() => {
            const to = sections[shownAt - 1];
            if (to) setSection(to.value, -1);
            return Boolean(to);
          }}
          onNext={() => {
            const to = sections[shownAt + 1];
            if (to) setSection(to.value, 1);
            return Boolean(to);
          }}
        >
          {sync.inline}
          {/* The new section slides in from the side it came from; with Reduce Motion it
              cross-fades (gestures spec section 4). */}
          <Reanimated.View
            key={shown}
            style={styles.pageBody}
            entering={
              enterFrom == null
                ? undefined
                : reduceMotion
                  ? FadeIn.duration(200)
                  : (enterFrom === 1 ? FadeInRight : FadeInLeft).duration(220)
            }
          >
            {shown === "details" ? (
              <Details
                job={job}
                property={property}
                customer={customer}
                update={update}
                onCancel={
                  jobMoves(job.status, job.type).includes("canceled")
                    ? () =>
                        confirmDestructive({
                          title: "Cancel this job?",
                          confirm: "Cancel Job",
                          cancel: "Keep Job",
                          onConfirm: () => changeStatus("canceled"),
                        })
                    : undefined
                }
              />
            ) : null}
            {shown === "checklist" ? (
              <View style={styles.part}>
                {/* Chemicals first, at the top of the checklist (owner, 2026-10-19 and 2026-10-24),
                    as the website: readings, what to add, and what was added. */}
                {maintenance && property ? (
                  <VisitChemicals
                    pool={property}
                    jobId={job.id}
                    customerName={customer?.name ?? null}
                    visitDay={
                      (job as { plan_date?: string | null }).plan_date ??
                      job.scheduled_start ??
                      job.completed_at ??
                      null
                    }
                  />
                ) : null}
                {/* Its filter and salt cell cleanings (owner, 2026-10-19), as the website. */}
                {maintenance ? <VisitCleanings job={job} /> : null}
                <View style={styles.heading}>
                  <T variant="sectionHeading">Checklist</T>
                  <T muted>
                    {insp.components.length === 0
                      ? "No checklist yet."
                      : inspection
                        ? `${inspection.answered} of ${inspection.total} answered · ${inspection.attention} need attention · ${inspection.leaking} leaking`
                        : maintenance
                          ? `${tally.pass} done · ${tally.attention} need attention · ${tally.notApplicable} skipped · ${tally.pending} to do`
                          : `${tally.pass} not leaking · ${tally.attention} attention · ${tally.leaking} leaking · ${tally.notApplicable} not applicable · ${tally.pending} to do`}
                  </T>
                </View>
                <ChecklistTab job={job} property={property} />
                {/* Complete Job is in the Next Step bar (owner, 2026-10-20); what stops it shows
                  here, under the list. */}
                {completeAsked === "checklist" && blocker ? (
                  <CompleteBlockedNotice jobId={job.id} message={blocker} />
                ) : null}
              </View>
            ) : null}
            {shown === "findings" ? (
              <View style={styles.parts}>
                {property ? (
                  <View style={styles.part}>
                    <T variant="sectionHeading">Pool Diagram</T>
                    <DiagramPanel job={job} property={property} />
                  </View>
                ) : null}
                <View style={styles.part}>
                  <T variant="sectionHeading">Tests</T>
                  <TestsTab job={job} />
                </View>
                <View style={styles.part}>
                  <T variant="sectionHeading">Findings</T>
                  <FindingsTab job={job} />
                </View>
              </View>
            ) : null}
            {shown === "photos" ? (
              <View style={styles.part}>
                <T variant="sectionHeading">Photos and Recordings</T>
                <MediaSection
                  target={{ jobId: job.id }}
                  layout="cards"
                  controls={mediaControls}
                  targets={[
                    ...[...insp.findings]
                      .sort((a, b) => a.id.localeCompare(b.id))
                      .map((f) => ({ value: `finding:${f.id}`, label: `Finding: ${f.title}` })),
                    ...insp.components.map((c) => ({ value: `component:${c.id}`, label: c.label })),
                  ]}
                />
              </View>
            ) : null}
            {shown === "wrapup" ? (
              <View style={styles.part}>
                <WrapUpList
                  job={job}
                  customer={customer}
                  list={wrap}
                  open={wrapUpOpen}
                  onOpen={setWrapUpOpen}
                  reportControls={reportControls}
                />
              </View>
            ) : null}
          </Reanimated.View>
        </SwipeNav>
      </Animated.ScrollView>
      {sync.overlay}
      {pinned ? (
        <Animated.View
          pointerEvents="box-none"
          style={[styles.pinned, { top: barBottom + sync.height, opacity: pinned }]}
        >
          <Glass variant="bar" style={styles.pinnedBar}>
            {switcher}
          </Glass>
        </Animated.View>
      ) : null}
      <NextStepBar
        buttons={barButtons}
        note={ready ? COMPLETE_READY_LINE : null}
        // The visit report's status, with its button or above Complete Job (Automatic shops).
        status={
          visitBar && (steps.includes("visit-report") || steps.includes("complete"))
            ? { text: visitBar.line, onPress: () => setVisitSheet(true) }
            : null
        }
      />
      {maintenance ? (
        <ModalSheet
          visible={visitSheet}
          onClose={() => setVisitSheet(false)}
          title="Visit Report"
          cancel="Done"
        >
          <VisitReport job={job} customer={customer} heading={false} />
        </ModalSheet>
      ) : null}
    </KeyboardAvoider>
  );
}

/** Details (spec 5.4): customer, messages, pool, who's assigned, intake, the on-site form. */
function Details({
  job,
  property,
  customer,
  update,
  onCancel,
}: {
  job: Job;
  property: Property | undefined;
  customer: Customer | undefined;
  update: (values: Record<string, JsonValue>) => void;
  onCancel?: () => void;
}) {
  const company = useCompany();
  const { services } = useSession();
  const line = useLine(company.id);
  const conversations = useConversations(company.id);
  const [choice] = useDirectionsChoice();
  const routing = useRoutingOn();
  // Typing never changes the job section (owner, 2026-10-20).
  const noSwipe = useNoSwipe();
  const [notes, setNotes] = useState<string | null>(null);
  const [fee, setFee] = useState<string | null>(null);
  const [gallons, setGallons] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [editingPool, setEditingPool] = useState(false);
  // Notes save shortly after typing stops and when leaving the screen: leaving the field
  // often doesn't blur it on iPhone.
  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<string | null>(null);
  const flush = useRef(() => {});
  useEffect(() => {
    flush.current = () => {
      if (notesTimer.current) clearTimeout(notesTimer.current);
      notesTimer.current = null;
      const value = pending.current;
      pending.current = null;
      if (value !== null && value !== (job.summary_notes ?? "")) update({ summary_notes: value });
    };
  });
  useEffect(() => () => flush.current(), []);

  const team = services.sync.team();
  const members = useTeam(company.id);
  const colorOf = (uid: string) => members.find((m) => m.user_id === uid)?.color ?? null;
  const nameOf = (uid: string | null | undefined) => {
    if (!uid) return null;
    const p = team.find((t) => t.id === uid);
    return p?.full_name ?? p?.email ?? "Teammate";
  };
  const texting = line?.status === "active";
  const phone = customer?.phone ? toE164(customer.phone) : null;
  const conversation = phone ? conversations.find((c) => c.phone === phone) : undefined;
  const address = property ? formatAddress(property) : "";
  // Only leak detection marks a leak's location (owner, 2026-10-19: no leak checkbox on
  // maintenance visits) and calls its price a detection fee.
  const detection = job.type === "detection";
  const repair = job.type === "repair";
  const priceBook = useRows<PriceBookItem>("price_book_item", company.id);
  // Only this job type's questions (a pool inspection asks its own, 2026-10-20).
  const questions = intakeQuestionsFor(
    (company.settings as Partial<CompanySettings>).intake_questions ?? [],
    job.type,
  );
  const answers = [
    // From the Customer on a repair (owner, 2026-10-19): what the customer needs. A repair job
    // lists them under Repairs instead (owner, 2026-10-22).
    ...(job.type === "repair"
      ? []
      : [
          {
            q: { key: REPAIR_ITEM_KEY, label: REPAIR_ITEM_LABEL },
            a: job.intake?.[REPAIR_ITEM_KEY],
          },
        ]),
    ...questions.map((q) => ({ q, a: job.intake?.[q.key] })),
  ].filter(({ a }) => (Array.isArray(a) ? a.length > 0 : Boolean(a)));
  const textCustomer = () =>
    router.push(
      conversation
        ? `/messages/${conversation.id}`
        : `/messages/new?customer=${customer?.id}&job=${job.id}`,
    );

  function saveFee() {
    if (fee === null) return;
    const cents = fee.trim() ? parseDollars(fee) : null;
    if (cents === null && fee.trim()) return setFee(null);
    update({ fee_cents: cents });
    setFee(null);
  }

  // The pool's gallons (owner, 2026-10-19: "In job details you should be able to include pool
  // size in gallons"), saved on the pool so the customer and Chemical see it. Blank clears.
  const gallonsShown =
    gallons ?? (property?.approx_gallons ? property.approx_gallons.toLocaleString("en-US") : "");
  function saveGallons() {
    if (gallons === null || !property) return;
    const value = gallons ? parseGallons(gallons) : null;
    if (value !== (property.approx_gallons ?? null))
      services.sync.write("property", property.id, property.company_id, { approx_gallons: value });
    setGallons(null);
  }

  // A fee or gallons typed but not saved yet asks before leaving (owner, 2026-10-20); notes
  // save by themselves.
  const savedFee = job.fee_cents != null ? (job.fee_cents / 100).toFixed(2) : "";
  useUnsavedChanges(
    (fee !== null && (fee.trim() ? parseDollars(fee) : null) !== (job.fee_cents ?? null)) ||
      (gallons !== null &&
        (gallons ? parseGallons(gallons) : null) !== (property?.approx_gallons ?? null)),
  );

  return (
    <>
      <Section title="Customer">
        <Group>
          <ListRow>
            <T variant="bodyEmphasis">{customer?.name ?? "No customer"}</T>
          </ListRow>
          {customer?.phone || customer?.email ? (
            <ListRow
              trailing={
                <View style={styles.contact}>
                  {customer.phone ? (
                    <RoundButton
                      icon="phone"
                      label={`Call ${customer.name}, ${customer.phone}`}
                      onPress={() => void Linking.openURL(`tel:${customer.phone}`)}
                    />
                  ) : null}
                  {customer.phone ? (
                    <RoundButton
                      icon="message"
                      label={`Text ${customer.name}`}
                      onPress={() =>
                        texting ? textCustomer() : void Linking.openURL(`sms:${customer.phone}`)
                      }
                    />
                  ) : null}
                  {customer.email ? (
                    <RoundButton
                      icon="mail"
                      label={`Email ${customer.name}, ${customer.email}`}
                      onPress={() => void Linking.openURL(`mailto:${customer.email}`)}
                    />
                  ) : null}
                </View>
              }
            >
              {customer.phone ? <T>{customer.phone}</T> : null}
              {customer.email ? (
                <T variant="secondary" numberOfLines={1}>
                  {customer.email}
                </T>
              ) : null}
            </ListRow>
          ) : null}
        </Group>
      </Section>

      {customer && (conversation || texting) ? (
        <Section title="Messages">
          <Group>
            {conversation ? (
              <ListRow onPress={textCustomer}>
                <T>{conversation.name}</T>
                <T variant="secondary" muted numberOfLines={1}>
                  {conversation.last_preview ?? ""}
                </T>
              </ListRow>
            ) : null}
            {texting ? (
              <ListRow
                title={`Text ${customer.name}`}
                tone="link"
                onPress={() => router.push(`/messages/new?customer=${customer.id}&job=${job.id}`)}
              />
            ) : null}
          </Group>
        </Section>
      ) : null}

      <Section title="Pool">
        <Group>
          {property ? (
            // The address opens the pool's details to edit; the pin opens Maps (owner,
            // 2026-10-20), as the website's Pool group.
            <View style={styles.poolRow}>
              <View style={{ flex: 1 }}>
                <ListRow
                  chevron={false}
                  accessibilityLabel={`${address}, Pool Details`}
                  accessibilityHint="Edits the pool’s address and details"
                  onPress={() => setEditingPool(true)}
                >
                  <AddressLine
                    notOnMap={mapStatus(property, routing) === "missing"}
                    lineHeight={type.body.lineHeight!}
                    size={17}
                  >
                    <T variant="bodyEmphasis">{address}</T>
                  </AddressLine>
                  <T variant="secondary" muted>
                    {[
                      property.pool_type ? POOL_TYPE_LABELS[property.pool_type] : null,
                      property.has_spa ? "Pool and spa" : "Pool",
                      property.approx_gallons
                        ? `${property.approx_gallons.toLocaleString("en-US")} gallons`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </T>
                </ListRow>
              </View>
              <RoundButton
                icon="pin"
                label={MAPS_LABELS.openInMaps}
                onPress={() =>
                  openDirections({ address, location: propertyLocation(property) }, choice)
                }
              />
            </View>
          ) : (
            <ListRow subtitle="Address not on this phone yet." />
          )}
          {/* Right under the address, editable here (owner, 2026-10-20). */}
          {property ? <AccessNotesRow property={property} /> : null}
          {mapStatus(property, routing) === "missing" ? <NotOnMapRow /> : null}
        </Group>
      </Section>
      <ModalSheet
        visible={editingPool && property != null}
        onClose={() => setEditingPool(false)}
        title="Pool Details"
      >
        {editingPool && property ? (
          <PoolForm pool={property} onSaved={() => setEditingPool(false)} />
        ) : null}
      </ModalSheet>

      <Section title="Assigned to">
        <Group>
          {/* Each tech with their color dot (team and week spec section 3). */}
          <ListRow
            title="Tech"
            detail={
              job.assigned_user_id ? (
                <TechValue
                  name={nameOf(job.assigned_user_id) ?? "Teammate"}
                  tech={colorOf(job.assigned_user_id)}
                />
              ) : (
                "Nobody yet"
              )
            }
          />
          {job.second_tech_id ? (
            <ListRow
              title="With"
              detail={
                <TechValue
                  name={nameOf(job.second_tech_id) ?? "Teammate"}
                  tech={colorOf(job.second_tech_id)}
                />
              }
            />
          ) : null}
          {job.fee_cents != null && !repair ? (
            <ListRow
              title={jobFeeLabel(job.type)}
              detail={
                <T muted style={tabular}>
                  {formatCents(job.fee_cents)}
                </T>
              }
            />
          ) : null}
        </Group>
      </Section>

      {/* A repair job's repairs and its price (owner, 2026-10-22). */}
      {repair ? <JobRepairs job={job} priceBook={priceBook} /> : null}

      {answers.length > 0 ? (
        <Section title="From the Customer">
          <Group>
            {answers.map(({ q, a }) => (
              <ListRow key={q.key}>
                <T variant="secondary" muted>
                  {q.label}
                </T>
                <T>{Array.isArray(a) ? a.join(", ") : a}</T>
              </ListRow>
            ))}
          </Group>
        </Section>
      ) : null}

      <Section
        title="On site"
        footer={
          repair
            ? undefined
            : detection
              ? "The detection fee is shown on the report."
              : "Billed on the invoice."
        }
      >
        <Group>
          {/* A repair job's price is its repairs' (Repairs, owner 2026-10-22). */}
          {repair ? null : (
            <ListRow>
              <View style={styles.feeRow}>
                <T style={{ flex: 1 }}>{jobFeeLabel(job.type)}</T>
                <T muted>$</T>
                <TextInput
                  {...noSwipe}
                  accessibilityLabel={`${jobFeeLabel(job.type)} in dollars`}
                  value={fee ?? savedFee}
                  onChangeText={setFee}
                  onBlur={saveFee}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={color.placeholder}
                  style={[
                    styles.feeInput,
                    tabular,
                    {
                      color: color.text,
                      borderColor: color.controlBorder,
                      backgroundColor: color.surface,
                    },
                  ]}
                />
              </View>
            </ListRow>
          )}
          {property ? (
            <ListRow>
              <View style={styles.feeRow}>
                <T style={{ flex: 1 }}>Pool gallons</T>
                <TextInput
                  {...noSwipe}
                  accessibilityLabel="Pool gallons"
                  value={gallonsShown}
                  onChangeText={(v) => {
                    const digits = v.replace(/\D/g, "").slice(0, 7);
                    setGallons(digits ? Number(digits).toLocaleString("en-US") : "");
                  }}
                  onBlur={saveGallons}
                  keyboardType="number-pad"
                  placeholder="20,000"
                  placeholderTextColor={color.placeholder}
                  style={[
                    styles.feeInput,
                    tabular,
                    {
                      color: color.text,
                      borderColor: color.controlBorder,
                      backgroundColor: color.surface,
                    },
                  ]}
                />
              </View>
            </ListRow>
          ) : null}
          {detection ? (
            <Toggle
              inList
              label="Leak location marked"
              value={job.location_marked ?? false}
              onChange={(v) => update({ location_marked: v })}
            />
          ) : null}
          <View style={styles.notes}>
            <T variant="secondary" muted>
              Job notes
            </T>
            <TextInput
              {...noSwipe}
              accessibilityLabel="Job notes"
              value={notes ?? job.summary_notes ?? ""}
              onChangeText={(v) => {
                setNotes(v);
                setSaved(false);
                pending.current = v;
                if (notesTimer.current) clearTimeout(notesTimer.current);
                notesTimer.current = setTimeout(() => flush.current(), AUTOSAVE_DELAY_MS);
              }}
              onBlur={() => {
                flush.current();
                setNotes(null);
              }}
              multiline
              placeholder="Anything the office should know"
              placeholderTextColor={color.placeholder}
              style={[
                styles.textArea,
                {
                  color: color.text,
                  borderColor: color.controlBorder,
                  backgroundColor: color.surface,
                },
              ]}
            />
          </View>
        </Group>
      </Section>
      <View style={styles.saveRow}>
        <Button
          title="Save"
          kind="secondary"
          onPress={() => {
            saveFee();
            saveGallons();
            flush.current();
            setSaved(true);
          }}
        />
        {saved ? <T style={[face.semiBold, { color: color.pass }]}>Saved.</T> : null}
      </View>

      {showsJobSchedule(job) ? <JobSchedule jobId={job.id} /> : null}
      <JobTimeline jobId={job.id} />

      {/* A visit's report for the customer (owner, 2026-10-20), above its quotes. */}
      {/* Once the visit is done its report is on the Next Step bar (owner, 2026-10-22); until
          then it stays here, so it can still be sent early. */}
      {job.type === "maintenance" && job.status !== "done" ? (
        <VisitReport job={job} customer={customer} />
      ) : null}

      {/* A visit has no Wrap-Up; the repairs it quotes are here (owner, 2026-10-19). */}
      {jobHasWrapUp(job.type) ? null : (
        <View style={{ gap: space["3"] }}>
          <T variant="sectionHeading">Quotes</T>
          <QuoteTab job={job} />
        </View>
      )}

      {onCancel ? (
        <View style={{ marginTop: space["2"] }}>
          <Button title="Cancel Job" kind="danger" onPress={onCancel} />
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  header: { gap: space["1"] },
  // The address row with the round Open in Maps button at its trailing edge.
  poolRow: { flexDirection: "row", alignItems: "center", paddingRight: space["4"] },
  subtitle: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space["3"] },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space["3"], marginTop: space["3"] },
  switcher: {
    marginTop: space["4"],
    paddingVertical: space["2"],
    marginHorizontal: -gutter,
    paddingHorizontal: gutter,
  },
  content: { gap: space["5"], marginTop: space["2"] },
  pageBody: { gap: space["5"] },
  part: { gap: space["3"] },
  // Parts of a section are 32 apart (spec 3.5).
  parts: { gap: space["6"] },
  heading: { gap: space["1"] },
  pinned: { position: "absolute", left: 0, right: 0 },
  pinnedBar: { paddingHorizontal: gutter, paddingVertical: space["2"] },
  contact: { flexDirection: "row", gap: space["2"] },
  feeRow: { flexDirection: "row", alignItems: "center", gap: space["2"] },
  feeInput: {
    width: 112,
    minHeight: minTap,
    borderWidth: 1,
    borderRadius: shape.field,
    paddingHorizontal: space["3"],
    textAlign: "right",
    ...face.regular,
    fontSize: 17,
  },
  notes: { paddingHorizontal: space["4"], paddingVertical: 10, gap: space["1"] },
  textArea: {
    minHeight: 96,
    borderWidth: 1,
    borderRadius: shape.field,
    paddingHorizontal: space["3"],
    paddingVertical: space["2"],
    textAlignVertical: "top",
    ...face.regular,
    fontSize: 17,
  },
  saveRow: { flexDirection: "row", alignItems: "center", gap: space["3"], marginTop: -space["2"] },
});
