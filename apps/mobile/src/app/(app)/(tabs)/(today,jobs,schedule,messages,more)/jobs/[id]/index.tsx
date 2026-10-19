import { router, useLocalSearchParams } from "expo-router";
import { useRoute } from "expo-router/react-navigation";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  KeyboardAvoidingView,
  Linking,
  Platform,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  JOB_TYPE_LABELS,
  POOL_TYPE_LABELS,
  checklistTally,
  formatAddress,
  formatCents,
  formatSchedule,
  jobActionLabel,
  parseGallons,
  jobFeeLabel,
  parseDollars,
  propertyLocation,
  toE164,
  userTransitions,
  type CompanySettings,
  REPAIR_ITEM_KEY,
  REPAIR_ITEM_LABEL,
  type Customer,
  type Job,
  type JobStatus,
  type Property,
} from "@leakbook/core";
import type { JsonValue } from "@leakbook/sync";
import { useRow } from "../../../../../../data/hooks";
import { useJobInspection } from "../../../../../../data/inspection";
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
  useScreenChrome,
} from "../../../../../../ui/components";
import { BAR_HEIGHT, barState } from "../../../../../../ui/Bar";
import { confirmDestructive } from "../../../../../../ui/confirm";
import { Glass } from "../../../../../../ui/Glass";
import {
  FinishPhotoNotice,
  useNeedsFinishPhoto,
} from "../../../../../../features/media/FinishPhoto";
import { SyncBar } from "../../../../../../ui/SyncBar";
import { ScreenTip } from "../../../../../../ui/Tip";
import {
  color,
  drawnChrome,
  face,
  gutter,
  minTap,
  shape,
  space,
  tabular,
} from "../../../../../../ui/theme";
import { ChecklistTab } from "../../../../../../features/inspection/ChecklistTab";
import { DiagramPanel } from "../../../../../../features/inspection/DiagramPanel";
import { ChemicalInline } from "../../../../../../features/chemicals/Calculator";
import { VisitCleanings } from "../../../../../../features/maintenance/Cleanings";
import { FindingsTab } from "../../../../../../features/inspection/FindingsTab";
import { TestsTab } from "../../../../../../features/inspection/TestsTab";
import { JobSchedule, showsJobSchedule } from "../../../../../../features/job/JobSchedule";
import { JobTimeline } from "../../../../../../features/job/Timeline";
import { MediaSection } from "../../../../../../features/media/MediaSection";
import { InvoiceSection } from "../../../../../../features/invoice/InvoiceSection";
import { QuoteTab } from "../../../../../../features/quote/QuoteTab";
import { ReportTab, Signatures } from "../../../../../../features/report/ReportTab";

type JobSection = "details" | "checklist" | "findings" | "photos" | "wrapup";

/** The section shown, per job, while the app runs (the website keeps it in the URL). */
const lastSection = new Map<string, JobSection>();

/**
 * The job page (spec 5.4): the header with the status and its next steps, then the section
 * switcher (Details, Checklist, Findings, Photos, Wrap-Up), pinned under the bar once
 * scrolled. The sections hold the existing parts for now; each gets the website's look in the
 * screen-by-screen restyle.
 */
export default function JobDetail() {
  const { id, section: asked } = useLocalSearchParams<{ id: string; section?: string }>();
  const company = useCompany();
  const { services } = useSession();
  const job = useRow<Job>("job", id);
  const property = useRow<Property>("property", job?.property_id);
  const customer = useRow<Customer>("customer", job?.bill_to_customer_id ?? property?.customer_id);
  const insp = useJobInspection(company.id, id);
  const insets = useSafeAreaInsets();
  const [section, setSectionState] = useState<JobSection>(
    () => (asked === "wrapup" ? "wrapup" : lastSection.get(id)) ?? "details",
  );
  const [switcherY, setSwitcherY] = useState<number | null>(null);
  // Mark Done waits for a photo when the shop requires one (owner setting, 2026-10-19).
  const needsPhoto = useNeedsFinishPhoto(id);
  const [photoAsked, setPhotoAsked] = useState(false);
  const {
    header: titleBlock,
    ref: scroll,
    scrollProps,
    contentContainerStyle,
  } = useScreenChrome({
    title: job ? (job.number ? `Job #${job.number}` : "New Job") : "Job",
  });
  const barY = barState(useRoute().key).y;

  function setSection(next: JobSection) {
    lastSection.set(id, next);
    setSectionState(next);
    // Changing section starts at the top of the page.
    (
      scroll.current as unknown as { scrollTo?: (o: { y: number; animated: boolean }) => void }
    )?.scrollTo?.({ y: 0, animated: false });
  }

  if (!job) {
    return (
      <Screen title="Job">
        <Notice tone="warning">This job isn’t on this phone.</Notice>
      </Screen>
    );
  }

  const maintenance = job.type === "maintenance";
  const tally = checklistTally(insp.components, insp.results);
  const sections: { value: JobSection; label: string; badge?: number }[] = [
    { value: "details", label: "Details" },
    { value: "checklist", label: "Checklist", badge: tally.pending || undefined },
    ...(maintenance ? [] : [{ value: "findings" as const, label: "Findings" }]),
    { value: "photos", label: "Photos" },
    { value: "wrapup", label: "Wrap-Up" },
  ];
  const shown = sections.some((s) => s.value === section) ? section : "details";

  const update = (values: Record<string, JsonValue>) =>
    services.sync.write("job", job.id, company.id, values);
  function changeStatus(to: JobStatus) {
    if (to === "done" && needsPhoto) return setPhotoAsked(true);
    setPhotoAsked(false);
    const values: Record<string, JsonValue> = { status: to };
    if (to === "in_progress" && !job!.started_at) values.started_at = new Date().toISOString();
    update(values);
  }
  const transitions = userTransitions(job.status, job.type).filter((to) => to !== "canceled");

  const switcher = (
    <Segmented
      variant="switcher"
      accessibilityLabel="Job sections"
      options={sections}
      value={shown}
      onChange={setSection}
    />
  );

  // Drawn bar (Android, browser): a copy of the switcher pinned under the bar once the page
  // has scrolled it there. iPhone pins the switcher itself (a sticky header).
  const barBottom = insets.top + BAR_HEIGHT;
  const pinned =
    drawnChrome && switcherY != null
      ? barY.interpolate({
          inputRange: [switcherY - barBottom - 1, switcherY - barBottom],
          outputRange: [0, 1],
          extrapolate: "clamp",
        })
      : null;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: color.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Animated.ScrollView
        ref={scroll}
        {...scrollProps}
        contentContainerStyle={contentContainerStyle}
        stickyHeaderIndices={drawnChrome ? undefined : [1]}
      >
        <View style={styles.header}>
          {titleBlock}
          <View style={styles.subtitle}>
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
          {photoAsked && needsPhoto ? <FinishPhotoNotice jobId={job.id} /> : null}
        </View>
        <View
          style={[styles.switcher, !drawnChrome && { backgroundColor: color.bg }]}
          onLayout={(e) => setSwitcherY(e.nativeEvent.layout.y)}
        >
          {switcher}
        </View>
        <View style={styles.content}>
          <SyncBar onPress={() => router.push("/more/sync")} />
          {shown === "details" ? (
            <Details
              job={job}
              property={property}
              customer={customer}
              update={update}
              onCancel={
                userTransitions(job.status, job.type).includes("canceled")
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
              {/* Chemical first, at the top of the checklist (owner, 2026-10-19), as the website. */}
              {maintenance && property ? (
                <ChemicalInline pool={property} jobId={job.id} name={customer?.name ?? null} />
              ) : null}
              {/* Its filter and salt cell cleanings (owner, 2026-10-19), as the website. */}
              {maintenance ? <VisitCleanings job={job} /> : null}
              <View style={styles.heading}>
                <T variant="sectionHeading">Checklist</T>
                <T muted>
                  {insp.components.length === 0
                    ? "No checklist yet."
                    : maintenance
                      ? `${tally.pass} done · ${tally.attention} need attention · ${tally.notApplicable} skipped · ${tally.pending} to do`
                      : `${tally.pass} not leaking · ${tally.attention} attention · ${tally.leaking} leaking · ${tally.notApplicable} not applicable · ${tally.pending} to do`}
                </T>
              </View>
              {job.type === "repair" ? null : (
                <ScreenTip screen="job" pkg={maintenance ? "pool" : "leak"} />
              )}
              <ChecklistTab job={job} property={property} />
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
            <View style={styles.parts}>
              <View style={styles.part}>
                <T variant="sectionHeading">Report and Sign-Off</T>
                <T variant="secondary" muted>
                  Write Draft fills in the report from this job’s checklist, tests, and findings.
                  Read and edit it before sending.
                </T>
                {job.type === "detection" ? <ScreenTip screen="report" pkg="leak" /> : null}
                <ReportTab job={job} customer={customer} />
              </View>
              <View style={styles.part}>
                <T variant="sectionHeading">Signatures</T>
                <Signatures job={job} />
              </View>
              {job.type === "detection" || maintenance ? (
                <View style={styles.part}>
                  <T variant="sectionHeading">Quotes</T>
                  <QuoteTab job={job} />
                </View>
              ) : null}
              <View style={styles.part}>
                <T variant="sectionHeading">Invoice</T>
                <InvoiceSection job={job} customer={customer} />
              </View>
            </View>
          ) : null}
        </View>
      </Animated.ScrollView>
      {pinned ? (
        <Animated.View
          pointerEvents="box-none"
          style={[styles.pinned, { top: barBottom, opacity: pinned }]}
        >
          <Glass variant="bar" style={styles.pinnedBar}>
            {switcher}
          </Glass>
        </Animated.View>
      ) : null}
    </KeyboardAvoidingView>
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
  const [notes, setNotes] = useState<string | null>(null);
  const [fee, setFee] = useState<string | null>(null);
  const [gallons, setGallons] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
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
  const questions = (company.settings as Partial<CompanySettings>).intake_questions ?? [];
  const answers = [
    // From the Customer on a repair (owner, 2026-10-19): what the customer needs.
    { q: { key: REPAIR_ITEM_KEY, label: REPAIR_ITEM_LABEL }, a: job.intake?.[REPAIR_ITEM_KEY] },
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
            <ListRow
              accessibilityRole="link"
              accessibilityHint="Directions"
              chevron={false}
              onPress={() =>
                openDirections({ address, location: propertyLocation(property) }, choice)
              }
            >
              <T style={{ color: color.link }}>{address}</T>
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
          ) : (
            <ListRow subtitle="Address not on this phone yet." />
          )}
          {property?.access_notes ? (
            <ListRow>
              <T variant="secondary" muted>
                Access
              </T>
              <T>{property.access_notes}</T>
            </ListRow>
          ) : null}
        </Group>
      </Section>

      <Section title="Assigned to">
        <Group>
          <ListRow title="Tech" detail={nameOf(job.assigned_user_id) ?? "Nobody yet"} />
          {job.second_tech_id ? (
            <ListRow title="With" detail={nameOf(job.second_tech_id) ?? "Teammate"} />
          ) : null}
          {job.fee_cents != null ? (
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
        footer={detection ? "The detection fee is shown on the report." : "Billed on the invoice."}
      >
        <Group>
          <ListRow>
            <View style={styles.feeRow}>
              <T style={{ flex: 1 }}>{jobFeeLabel(job.type)}</T>
              <T muted>$</T>
              <TextInput
                accessibilityLabel={`${jobFeeLabel(job.type)} in dollars`}
                value={fee ?? (job.fee_cents != null ? (job.fee_cents / 100).toFixed(2) : "")}
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
          {property ? (
            <ListRow>
              <View style={styles.feeRow}>
                <T style={{ flex: 1 }}>Pool gallons</T>
                <TextInput
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
              accessibilityLabel="Job notes"
              value={notes ?? job.summary_notes ?? ""}
              onChangeText={(v) => {
                setNotes(v);
                setSaved(false);
                pending.current = v;
                if (notesTimer.current) clearTimeout(notesTimer.current);
                notesTimer.current = setTimeout(() => flush.current(), 1500);
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
  subtitle: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space["3"] },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space["3"], marginTop: space["3"] },
  switcher: {
    marginTop: space["4"],
    paddingVertical: space["2"],
    marginHorizontal: -gutter,
    paddingHorizontal: gutter,
  },
  content: { gap: space["5"], marginTop: space["2"] },
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
