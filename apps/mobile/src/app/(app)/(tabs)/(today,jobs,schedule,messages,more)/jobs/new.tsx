import { router } from "expo-router";
import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import {
  POOL_TYPE_LABELS,
  formatAddress,
  localDate,
  newJobRecords,
  validateNewJob,
  planComponents,
  parseDollars,
  parseGallons,
  splitEmails,
  formatCents,
  REPAIR_ITEM_KEY,
  REPAIR_LABELS,
  EMPTY_REPAIR_DRAFT,
  checkRepairDrafts,
  repairBookingName,
  repairsFee,
  repairsTotal,
  type RepairCheck,
  type RepairDraft,
  type ComponentType,
  type PriceBookItem,
  type Customer,
  type NewJobInput,
  type DiagramShape,
  type PoolType,
  type Property,
  seesAllJobs,
  canMakeJobs,
  companyServices,
  newJobTypes,
  intakeQuestionsFor,
  toggleChoice,
  isManagerRole,
  maintenanceSettings,
  clockToMinutes,
  minutesLabel,
  usualVisit,
  type JobType,
  type PlanRepeat as Repeat,
} from "@leakbook/core";
import { useRows, useSyncStatus } from "../../../../../data/hooks";
import { AddressSuggestions } from "../../../../../features/address/AddressSuggestions";
import { locateAfterSync } from "../../../../../lib/locate";
import { useTeam } from "../../../../../data/schedule";
import {
  checkPlan,
  firstVisitHint,
  isNetworkError,
  type PlanErrors,
} from "../../../../../features/maintenance/plan";
import { PlanRepeat } from "../../../../../features/maintenance/PlanRepeat";
import { ChipToggles } from "../../../../../features/inspection/ChoicePills";
import { Select } from "../../../../../ui/Select";
import { AddRepairButton, RepairFields, repairItemsOf } from "../../../../../features/job/Repairs";
import { useCompany, useSession } from "../../../../../state/session";
import {
  Button,
  Card,
  Choice,
  Field,
  Group,
  ListRow,
  Notice,
  Screen,
  Section,
  T,
  Toggle,
  Segmented,
} from "../../../../../ui/components";
import { jobDateError } from "../../../../../lib/limits";
import { useDiscardChanges } from "../../../../../ui/discard";
import { haptics } from "../../../../../ui/haptics";
import { DateField, TimeField } from "../../../../../features/schedule/DateField";
import { ShapePicker } from "../../../../../ui/ShapePicker";
import { color, space, tabular } from "../../../../../ui/theme";

type When = "now" | "scheduled" | "later";

export default function NewJob() {
  const company = useCompany();
  const { membership } = useSession();
  // Owners can stop techs making jobs (owner setting, 2026-10-18).
  if (!canMakeJobs(membership?.role, company.settings))
    return (
      <Screen title="New Job">
        <Notice tone="info">
          Your office makes new jobs. Ask an owner or admin to add this one.
        </Notice>
      </Screen>
    );
  return <NewJobForm />;
}

function NewJobForm() {
  const company = useCompany();
  const { services, user, membership } = useSession();
  const seesAll = seesAllJobs(membership?.role, company.settings);
  const customers = useRows<Customer>("customer", company.id);
  const properties = useRows<Property>("property", company.id);
  const componentTypes = useRows<ComponentType>("component_type", company.id);
  const priceBook = useRows<PriceBookItem>("price_book_item", company.id);
  const team = services.sync.team().filter((p) => p.id !== user?.id);
  // What the shop does decides the kind of job (company services setting, 2026-10-16).
  const offered = companyServices(company.settings);
  const [jobType, setJobType] = useState<JobType>(offered === "pool" ? "maintenance" : "detection");
  const maintenance = jobType === "maintenance";
  const leak = jobType === "detection";
  // Pool Inspection (2026-10-20): a price and its own booking questions, like leak detection.
  const inspection = jobType === "inspection";
  const repair = jobType === "repair";
  // From the Customer asks this job type's own questions (a pool inspection its features).
  const questions = intakeQuestionsFor(company.settings.intake_questions ?? [], jobType);
  // Owners and admins can start a maintenance plan here: visits that repeat (website's New Job).
  const canPlan = isManagerRole(membership?.role);
  const [repeat, setRepeat] = useState<Repeat | "0">("0");
  const plan = maintenance && canPlan && repeat !== "0";
  const members = useTeam(company.id);
  const offline = useSyncStatus().phase === "offline";
  const [days, setDays] = useState<number[]>([]);
  const [planForm, setPlanForm] = useState({
    startsOn: "",
    time: "",
    minutes: String(maintenanceSettings(company.settings).visitMinutes),
    endsOn: "",
    tech: "",
    price: "",
    notes: "",
  });
  const [planErrors, setPlanErrors] = useState<PlanErrors>({});
  const [starting, setStarting] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const setPlan = (k: keyof typeof planForm) => (v: string) =>
    setPlanForm((f) => ({ ...f, [k]: v }));

  const [customerId, setCustomerId] = useState<string | undefined>();
  const [search, setSearch] = useState("");
  const [propertyId, setPropertyId] = useState<string | undefined>();
  // The customer's usual start time (owner, 2026-10-26: "pre-fill what the app already knows"):
  // put in Time (and a plan's time) when their pool is picked, from the time most of its last
  // jobs share (core usualVisit). The tech stays Assign to me: this form has no tech picker.
  const jobRows = useRows<{
    property_id: string | null;
    assigned_user_id: string | null;
    scheduled_start: string | null;
    status: string;
  }>("job", company.id);
  const [usualNote, setUsualNote] = useState("");
  function pickPool(id: string | undefined) {
    setPropertyId(id);
    const usual = id
      ? usualVisit(
          jobRows.filter((j) => j.property_id === id && j.status !== "canceled"),
          company.timezone,
        )
      : null;
    const time = usual?.time ?? null;
    setUsualNote(time ? `Usually ${minutesLabel(clockToMinutes(time))}.` : "");
    if (time) {
      setForm((f) => ({ ...f, scheduleTime: time }));
      setPlanForm((p) => ({ ...p, time }));
    }
  }
  const [form, setForm] = useState<NewJobInput>({
    customerName: "",
    customerPhone: "",
    customerEmail: "",
    addressLine1: "",
    city: "",
    state: "",
    postalCode: "",
    scheduleDate: "",
    scheduleTime: "",
  });
  const [poolType, setPoolType] = useState<PoolType>("gunite_plaster");
  const [shape, setShape] = useState<DiagramShape | null>(null);
  const [hasSpa, setHasSpa] = useState(false);
  const [accessNotes, setAccessNotes] = useState("");
  const [when, setWhen] = useState<When>("now");
  const [assignToMe, setAssignToMe] = useState(true);
  const [errors, setErrors] = useState<ReturnType<typeof validateNewJob>>({});
  const [otherEmails, setOtherEmails] = useState("");
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [secondTech, setSecondTech] = useState<string>("none");
  const [fee, setFee] = useState<string | null>(null);
  const [feeError, setFeeError] = useState<string | undefined>();
  const [repairErrors, setRepairErrors] = useState<RepairCheck["errors"][]>([]);
  // The detection fee starts from the price book (pool, or pool and spa).
  const detection = priceBook
    .filter((i) => i.active && i.category === "Detection")
    .sort((a, b) => a.sort_order - b.sort_order);
  const spaChosen = propertyId
    ? (properties.find((p) => p.id === propertyId)?.has_spa ?? false)
    : hasSpa;
  // A pool inspection's price is the price book's Inspection item, as the website.
  const inspectionItem = priceBook.find(
    (i) => i.active && !i.deleted_at && i.category === "Inspection",
  );
  const suggestedFee = inspection
    ? inspectionItem
    : ((spaChosen ? detection[1] : detection[0]) ?? detection[0]);
  const feeText = fee ?? (suggestedFee ? (suggestedFee.price_cents / 100).toFixed(2) : "");
  // From the Customer (owner, 2026-10-19), as the website: a repair is booked for a price book
  // item, the ones the owner picked for it or every active one when none are picked yet.
  const live = priceBook
    .filter((i) => i.active && !i.deleted_at)
    .sort((a, b) => a.sort_order - b.sort_order);
  const picked = live.filter((i) => (i as { on_repair_call?: boolean }).on_repair_call);
  const repairItems = repairItemsOf(picked.length ? picked : live);
  // One or more repairs (owner, 2026-10-22: "add additional repair"), each with its own key.
  const [repairs, setRepairs] = useState<{ key: number; draft: RepairDraft }[]>([
    { key: 0, draft: EMPTY_REPAIR_DRAFT },
  ]);
  const [nextRepairKey, setNextRepairKey] = useState(1);
  const [repairNotes, setRepairNotes] = useState("");
  // The pool's gallons (owner, 2026-10-19: it replaced "Size of the pool"), saved on the pool:
  // an existing pool's fills in; blank keeps what the pool has.
  const [gallonsTyped, setGallonsTyped] = useState<{ pool: string; text: string } | null>(null);
  const knownGallons = propertyId
    ? (properties.find((p) => p.id === propertyId)?.approx_gallons ?? null)
    : null;
  const gallonsText =
    gallonsTyped && gallonsTyped.pool === (propertyId ?? "new")
      ? gallonsTyped.text
      : knownGallons
        ? knownGallons.toLocaleString("en-US")
        : "";
  const [gallonsError, setGallonsError] = useState<string | undefined>();
  const gallonsField = (
    <Field
      label="Gallons (optional)"
      value={gallonsText}
      onChangeText={(v) => {
        const digits = v.replace(/\D/g, "").slice(0, 7);
        setGallonsTyped({
          pool: propertyId ?? "new",
          text: digits ? Number(digits).toLocaleString("en-US") : "",
        });
      }}
      keyboardType="number-pad"
      placeholder="20,000"
      error={gallonsError}
      hint="Saved on the pool for the Chemical calculator."
    />
  );
  /** The gallons to save on the pool, null to leave it, or false when they can't be read. */
  function gallonsToSave(): number | null | false {
    if (!gallonsText.trim()) return null;
    const g = parseGallons(gallonsText);
    setGallonsError(g === null ? "Enter the gallons as a number, like 20,000." : undefined);
    return g === null ? false : g;
  }

  const set = (k: keyof NewJobInput) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const selectedCustomer = customers.find((c) => c.id === customerId);
  const customerProperties = properties.filter((p) => p.customer_id === customerId);
  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return customers
      .filter((c) => [c.name, c.phone, c.email].some((v) => v?.toLowerCase().includes(q)))
      .slice(0, 6);
  }, [customers, search]);

  const [{ today, tomorrow }] = useState(() => {
    const now = new Date();
    return {
      today: localDate(now, company.timezone),
      tomorrow: localDate(new Date(now.getTime() + 86_400_000), company.timezone),
    };
  });

  // Anything typed or picked yet? Then closing the sheet asks first, and on iPhone a swipe
  // down doesn't close it by accident.
  const dirty = Boolean(
    customerId ||
    search.trim() ||
    accessNotes.trim() ||
    otherEmails.trim() ||
    shape ||
    fee !== null ||
    repairs.some((r) => r.draft.pick || r.draft.description.trim() || r.draft.price.trim()) ||
    repairs.length > 1 ||
    repairNotes.trim() ||
    Boolean(gallonsTyped?.text) ||
    repeat !== "0" ||
    planForm.price.trim() ||
    planForm.notes.trim() ||
    Object.keys(answers).length > 0 ||
    Object.values(form).some((v) => v.trim()),
  );

  // New Job is a pushed screen (spec decision 3): leaving it with entries asks first.
  const leave = useDiscardChanges(dirty);

  /**
   * Start a maintenance plan (owners and admins), with a new customer and pool if needed, in
   * one step on the server (create_service_plan): its visits are made there, so this needs a
   * connection.
   */
  async function startPlan() {
    const input: NewJobInput = {
      ...form,
      customerId,
      propertyId,
      scheduleDate: "",
      scheduleTime: "",
    };
    const e = validateNewJob(input);
    setErrors(e);
    const checked = checkPlan(
      { repeat: repeat as Repeat, days, ...planForm },
      "End on or after the first visit.",
    );
    setPlanErrors(checked.errors ?? {});
    setPlanError(null);
    const gallons = gallonsToSave();
    if (Object.keys(e).length > 0 || !checked.values || gallons === false) return;
    if (offline) {
      setPlanError(
        "You’re offline. Starting a plan needs a connection; try again once you’re back online.",
      );
      return;
    }
    setStarting(true);
    try {
      const { supabase, sync } = services;
      const { data, error } = await supabase.rpc("create_service_plan", {
        target_company: company.id,
        new_customer: customerId
          ? null
          : {
              name: input.customerName.trim(),
              phone: input.customerPhone.trim() || null,
              email: input.customerEmail.trim() || null,
              cc_emails: splitEmails(otherEmails),
            },
        existing_customer: customerId ?? null,
        new_property: propertyId
          ? null
          : {
              address_line1: input.addressLine1.trim(),
              city: input.city.trim() || null,
              state: input.state.trim().toUpperCase() || null,
              postal_code: input.postalCode.trim() || null,
              pool_type: poolType,
              has_spa: hasSpa,
              access_notes: accessNotes.trim() || null,
            },
        existing_property: propertyId ?? null,
        plan: checked.values,
      });
      if (error) throw new Error(error.message);
      // Bring the new customer, pool, plan, and its visits to the phone before opening them.
      await sync.syncNow();
      // Gallons go on the pool, through sync (the server's plan function doesn't take them).
      const newCustomer = (data as { customer: string }).customer;
      const pool =
        propertyId ??
        sync
          .list("property", company.id)
          .find(
            (p) => p.customer_id === newCustomer && p.address_line1 === input.addressLine1.trim(),
          )?.id;
      if (gallons && typeof pool === "string")
        sync.write("property", pool, company.id, { approx_gallons: gallons });
      haptics.success();
      leave(() => router.replace(`/customers/${(data as { customer: string }).customer}`));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setPlanError(
        isNetworkError(message)
          ? "You’re offline. Starting a plan needs a connection; try again once you’re back online."
          : message,
      );
    } finally {
      setStarting(false);
    }
  }

  function save() {
    const input: NewJobInput = {
      ...form,
      customerId,
      propertyId,
      scheduleDate: when === "scheduled" ? form.scheduleDate : "",
      scheduleTime: when === "scheduled" ? form.scheduleTime : "",
    };
    const e = validateNewJob(input);
    if (when === "scheduled" && !input.scheduleDate) e.scheduleDate = "Pick a date.";
    // Years 2000 to 2100 and a real day, as the website (owner, 2026-10-20).
    else if (when === "scheduled" && !e.scheduleDate && jobDateError(input.scheduleDate))
      e.scheduleDate = jobDateError(input.scheduleDate)!;
    setErrors(e);
    const feeCents = feeText.trim() ? parseDollars(feeText) : null;
    const badFee =
      (leak || inspection) && Boolean(feeText.trim()) && (feeCents === null || feeCents < 0);
    setFeeError(badFee ? "Enter a price like 649." : undefined);
    const checkedRepairs = checkRepairDrafts(
      repairs.map((r) => r.draft),
      repairItems,
    );
    setRepairErrors(repair ? checkedRepairs.errors : []);
    const badPrice = repair && !checkedRepairs.ok;
    const gallons = gallonsToSave();
    if (Object.keys(e).length > 0 || badFee || badPrice || gallons === false) return;
    const booked = repair ? checkedRepairs.repairs : [];
    const bookedName = repairBookingName(booked);

    const records = newJobRecords(input, {
      poolType,
      hasSpa,
      accessNotes,
      assignedUserId: assignToMe || !seesAll ? (user?.id ?? null) : null,
      jobType,
      timing:
        when === "now"
          ? { kind: "now", at: new Date() }
          : when === "scheduled"
            ? {
                kind: "scheduled",
                date: input.scheduleDate,
                time: input.scheduleTime,
                timeZone: company.timezone,
              }
            : { kind: "later" },
    });
    const { sync } = services;
    // Customer, property, job, and its checklist are saved together or not at all.
    let newPool: string | null = null;
    const jobId = sync.batch(() => {
      const cust =
        customerId ??
        sync.insert("customer", company.id, {
          ...records.customer!,
          cc_emails: splitEmails(otherEmails),
        });
      const prop =
        propertyId ??
        sync.insert("property", company.id, {
          ...records.property!,
          customer_id: cust,
          diagram_shape: shape,
          ...(gallons ? { approx_gallons: gallons } : {}),
        });
      if (!propertyId) newPool = prop;
      if (propertyId && gallons && gallons !== knownGallons)
        sync.write("property", propertyId, company.id, { approx_gallons: gallons });
      const job = sync.insert("job", company.id, {
        ...records.job,
        property_id: prop,
        bill_to_customer_id: cust,
        // Leak detection has a detection fee and booking questions, a pool inspection its price
        // and its own questions; a repair its price and what they need (From the Customer), as
        // the website. Pool service visits have no second tech.
        fee_cents: leak || inspection ? feeCents : repair ? repairsFee(booked) : null,
        second_tech_id: maintenance || secondTech === "none" ? null : secondTech,
        intake:
          leak || inspection
            ? Object.fromEntries(
                questions.filter((q) => q.key in answers).map((q) => [q.key, answers[q.key]!]),
              )
            : bookedName
              ? { [REPAIR_ITEM_KEY]: bookedName }
              : {},
        ...(repair && repairNotes.trim() ? { summary_notes: repairNotes.trim() } : {}),
      });
      // Each repair is its own row, with the job (offline too).
      booked.forEach((r, i) =>
        sync.insert("job_repair", company.id, { job_id: job, ...r, sort_order: i }),
      );
      // The checklist is ready the moment the job opens, even offline.
      const existingProperty = properties.find((p) => p.id === prop);
      const spa = existingProperty ? existingProperty.has_spa : hasSpa;
      const type = existingProperty ? (existingProperty.pool_type ?? null) : poolType;
      for (const planned of planComponents(
        componentTypes,
        { has_pool: true, has_spa: spa, pool_type: type },
        jobType,
      )) {
        const componentId = sync.insert("job_component", company.id, { job_id: job, ...planned });
        sync.insert("checklist_item_result", company.id, {
          job_id: job,
          job_component_id: componentId,
          status: "pending",
        });
      }
      return job;
    });
    // A new pool is found on the map from its address once it's up.
    if (newPool) void locateAfterSync(company.id, { property_id: newPool });
    haptics.success();
    leave(() => router.replace(`/jobs/${jobId}`));
  }

  const jobTypes = newJobTypes(offered);
  return (
    <Screen
      title="New Job"
      subtitle={
        offered === "pool"
          ? "A pool service visit, a plan that repeats, or a repair. Accepted quotes make their own repair jobs."
          : "Accepted quotes make their own repair jobs."
      }
    >
      {/* Service, Repair, Leak, Inspection (owner, 2026-10-20: "Repair is cut off"): short
          labels with tight sides, so all four fit across a phone. */}
      <Segmented
        label="Job"
        value={jobType}
        onChange={setJobType}
        options={jobTypes}
        compact={jobTypes.length > 3}
      />
      <Section title="Customer">
        {selectedCustomer ? (
          <Card>
            <T variant="strong">{selectedCustomer.name}</T>
            {selectedCustomer.phone ? <T variant="muted">{selectedCustomer.phone}</T> : null}
            <Button
              title="Change Customer"
              kind="quiet"
              onPress={() => {
                setCustomerId(undefined);
                pickPool(undefined);
              }}
            />
          </Card>
        ) : (
          <>
            {customers.length > 0 ? (
              <Field
                label="Find an existing customer"
                value={search}
                onChangeText={setSearch}
                placeholder="Name, phone, or email"
              />
            ) : null}
            {matches.length > 0 ? (
              <Group>
                {matches.map((c) => (
                  <ListRow
                    key={c.id}
                    chevron={false}
                    onPress={() => {
                      setCustomerId(c.id);
                      setSearch("");
                      const props = properties.filter((p) => p.customer_id === c.id);
                      pickPool(props.length === 1 ? props[0]!.id : undefined);
                    }}
                  >
                    <T variant="strong">{c.name}</T>
                    <T variant="muted">
                      {[c.phone, c.email].filter(Boolean).join(" · ") || "No contact details"}
                    </T>
                  </ListRow>
                ))}
              </Group>
            ) : null}
            <T variant="muted">Or add a new customer:</T>
            <Field
              label="Name"
              value={form.customerName}
              onChangeText={set("customerName")}
              error={errors.customerName}
              autoCapitalize="words"
            />
            <Field
              label="Phone"
              value={form.customerPhone}
              onChangeText={set("customerPhone")}
              keyboardType="phone-pad"
            />
            <Field
              label="Email"
              value={form.customerEmail}
              onChangeText={set("customerEmail")}
              error={errors.customerEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <Field
              label="Other emails (optional)"
              value={otherEmails}
              onChangeText={setOtherEmails}
              keyboardType="email-address"
              autoCapitalize="none"
              hint="They get the report too. Separate with spaces."
            />
          </>
        )}
      </Section>

      {leak || inspection ? (
        <Section title="From the Customer">
          {gallonsField}
          {questions.map((q) =>
            q.type === "multi" ? (
              <View key={q.key} style={{ gap: space["2"] }}>
                <T variant="label">{q.label}</T>
                {/* Tap all that apply (Pool Inspection's features, 2026-10-20), as the website. */}
                <ChipToggles
                  label={q.label}
                  options={q.options ?? []}
                  value={(answers[q.key] as string[] | undefined) ?? []}
                  onToggle={(o) =>
                    setAnswers((a) => ({
                      ...a,
                      [q.key]: toggleChoice(
                        (q.options ?? []).map((label) => ({ label })),
                        (a[q.key] as string[] | undefined) ?? [],
                        o,
                      ),
                    }))
                  }
                />
              </View>
            ) : q.type === "single" ? (
              <Choice
                key={q.key}
                label={q.label}
                options={(q.options ?? []).map((o) => ({ value: o, label: o }))}
                value={(answers[q.key] as string | undefined) ?? null}
                onChange={(v) => setAnswers((a) => ({ ...a, [q.key]: v }))}
              />
            ) : (
              <Field
                key={q.key}
                label={q.label}
                value={(answers[q.key] as string | undefined) ?? ""}
                onChangeText={(v) => setAnswers((a) => ({ ...a, [q.key]: v }))}
              />
            ),
          )}
          <Field
            label={inspection ? "Price ($)" : "Detection fee ($)"}
            value={feeText}
            onChangeText={setFee}
            keyboardType="decimal-pad"
            error={feeError}
            hint={
              inspection
                ? "Billed on the invoice. Add parts there before sending."
                : "Shown on the report."
            }
          />
        </Section>
      ) : null}

      {repair ? (
        <Section title="From the Customer">
          {repairs.map(({ key, draft }, index) => (
            <View key={key} style={index > 0 ? styles.addedRepair : undefined}>
              {index > 0 ? (
                <View style={styles.repairHead}>
                  <T variant="bodyEmphasis">{REPAIR_LABELS.additional}</T>
                  <Button
                    title={REPAIR_LABELS.remove}
                    kind="danger"
                    small
                    accessibilityLabel={`${REPAIR_LABELS.remove} ${REPAIR_LABELS.additional.toLowerCase()} ${index}`}
                    onPress={() => setRepairs((rs) => rs.filter((r) => r.key !== key))}
                  />
                </View>
              ) : null}
              <RepairFields
                draft={draft}
                items={repairItems}
                label={index === 0 ? REPAIR_LABELS.first : REPAIR_LABELS.item}
                errors={repairErrors[index]}
                onChange={(d) =>
                  setRepairs((rs) => rs.map((r) => (r.key === key ? { key, draft: d } : r)))
                }
              />
            </View>
          ))}
          <AddRepairButton
            onPress={() => {
              setRepairs((rs) => [...rs, { key: nextRepairKey, draft: EMPTY_REPAIR_DRAFT }]);
              setNextRepairKey((k) => k + 1);
            }}
          />
          {repairs.length > 1 ? (
            <View style={styles.repairHead}>
              <T variant="bodyEmphasis">{REPAIR_LABELS.total}</T>
              <T variant="bodyEmphasis" style={tabular}>
                {formatCents(
                  repairsTotal(
                    repairs.map((r) => ({
                      price_cents: Math.max(parseDollars(r.draft.price) ?? 0, 0),
                    })),
                  ),
                )}
              </T>
            </View>
          ) : null}
          <T variant="secondary" muted>
            {REPAIR_LABELS.footer}
          </T>
          <Field
            label="What they said (optional)"
            value={repairNotes}
            onChangeText={setRepairNotes}
            multiline
            hint="Shown to the tech with the job."
          />
        </Section>
      ) : null}

      <Section title="Pool address">
        {customerProperties.length > 0 ? (
          <Choice
            options={[
              ...customerProperties.map((p) => ({ value: p.id, label: p.address_line1 })),
              { value: "new", label: "New address" },
            ]}
            value={propertyId ?? "new"}
            onChange={(v) => pickPool(v === "new" ? undefined : v)}
          />
        ) : null}
        {propertyId ? (
          <Card>
            <T variant="small">{formatAddress(properties.find((p) => p.id === propertyId)!)}</T>
          </Card>
        ) : (
          <>
            <Field
              label="Street address"
              value={form.addressLine1}
              onChangeText={set("addressLine1")}
              error={errors.addressLine1}
            />
            <AddressSuggestions
              street={form.addressLine1}
              onPick={(s) =>
                setForm((f) => ({
                  ...f,
                  addressLine1: s.line1,
                  city: s.city,
                  state: s.state,
                  postalCode: s.postal_code,
                }))
              }
            />
            <View style={styles.cols}>
              <View style={{ flex: 2 }}>
                <Field label="City" value={form.city} onChangeText={set("city")} />
              </View>
              <View style={{ flex: 1 }}>
                <Field
                  label="State"
                  value={form.state}
                  onChangeText={set("state")}
                  autoCapitalize="characters"
                  maxLength={2}
                />
              </View>
            </View>
            <Field
              label="ZIP"
              value={form.postalCode}
              onChangeText={set("postalCode")}
              keyboardType="number-pad"
              maxLength={10}
            />
            <Choice
              label="Pool type"
              options={(Object.keys(POOL_TYPE_LABELS) as PoolType[]).map((k) => ({
                value: k,
                label: POOL_TYPE_LABELS[k],
              }))}
              value={poolType}
              onChange={setPoolType}
            />
            <Toggle label="Has a spa" value={hasSpa} onChange={setHasSpa} />
            {leak || inspection ? null : gallonsField}
            {leak ? (
              <ShapePicker
                value={shape}
                onChange={setShape}
                label="Pool shape (optional)"
                hint="Leave it blank if you don’t know yet; set it later on Findings."
              />
            ) : null}
            <Field
              label="Access notes"
              value={accessNotes}
              onChangeText={setAccessNotes}
              placeholder="Gate code, dogs, where to park"
              multiline
            />
          </>
        )}
      </Section>

      <Section title="When">
        {maintenance && canPlan ? (
          <PlanRepeat
            once
            value={repeat}
            onChange={setRepeat}
            days={days}
            onDaysChange={setDays}
            error={planErrors.weekdays}
          />
        ) : null}
        {plan ? (
          <>
            <DateField
              label="First visit"
              value={planForm.startsOn}
              onChange={setPlan("startsOn")}
              today={today}
              hint={firstVisitHint(repeat as Repeat, true)}
              error={planErrors.startsOn}
            />
            <TimeField
              label="Time (optional)"
              value={planForm.time}
              onChange={setPlan("time")}
              placeholder="Any time"
              hint="Blank: route planning picks it."
              clearLabel="Any Time"
              error={planErrors.time}
            />
            <Field
              label="Visit length (minutes)"
              value={planForm.minutes}
              onChangeText={setPlan("minutes")}
              keyboardType="number-pad"
              error={planErrors.minutes}
            />
            <DateField
              label="Last visit (optional)"
              value={planForm.endsOn}
              onChange={setPlan("endsOn")}
              today={planForm.startsOn || today}
              min={planForm.startsOn || undefined}
              placeholder="No end date"
              clearLabel="No End Date"
              error={planErrors.endsOn}
            />
            <Select
              label="Tech"
              value={planForm.tech}
              onChange={setPlan("tech")}
              options={[
                { value: "", label: "Nobody yet" },
                ...members
                  .filter((m) => m.status === "active")
                  .map((m) => ({ value: m.user_id, label: m.name })),
              ]}
            />
            <Field
              label="Price per month ($)"
              value={planForm.price}
              onChangeText={setPlan("price")}
              keyboardType="decimal-pad"
              hint="Billed monthly with the customer's other visits."
              error={planErrors.price}
            />
            <Field
              label="Notes for the tech (optional)"
              value={planForm.notes}
              onChangeText={setPlan("notes")}
              multiline
            />
          </>
        ) : (
          <>
            <Segmented
              options={[
                { value: "now", label: "Start Now" },
                { value: "scheduled", label: "Schedule" },
                { value: "later", label: "Later" },
              ]}
              value={when}
              onChange={setWhen}
            />
            {when === "scheduled" ? (
              <>
                <Choice
                  options={[
                    { value: today, label: "Today" },
                    { value: tomorrow, label: "Tomorrow" },
                  ]}
                  value={
                    form.scheduleDate === today || form.scheduleDate === tomorrow
                      ? form.scheduleDate
                      : null
                  }
                  onChange={set("scheduleDate")}
                />
                <View style={styles.cols}>
                  <View style={{ flex: 1 }}>
                    <DateField
                      label="Date"
                      value={form.scheduleDate}
                      onChange={set("scheduleDate")}
                      today={today}
                      error={errors.scheduleDate}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <TimeField
                      label="Time"
                      value={form.scheduleTime}
                      onChange={set("scheduleTime")}
                      error={errors.scheduleTime}
                    />
                  </View>
                </View>
                {usualNote ? (
                  <T variant="secondary" style={{ color: color.pass }}>
                    {usualNote}
                  </T>
                ) : null}
              </>
            ) : null}
          </>
        )}
        {/* When techs see only their own jobs, a tech's new job is always theirs. */}
        {seesAll && !plan ? (
          <Toggle label="Assign to me" value={assignToMe} onChange={setAssignToMe} />
        ) : null}
        {team.length > 0 && !maintenance ? (
          <Choice
            label="Second tech"
            options={[
              { value: "none", label: "None" },
              ...team.map((p) => ({ value: p.id, label: p.full_name ?? p.email ?? "Teammate" })),
            ]}
            value={secondTech}
            onChange={setSecondTech}
          />
        ) : null}
      </Section>

      {Object.keys(errors).length > 0 || (plan && Object.keys(planErrors).length > 0) ? (
        <Notice tone="error">Fix the highlighted fields.</Notice>
      ) : null}
      {plan && planError ? <Notice tone="error">{planError}</Notice> : null}
      {plan && offline && !planError ? (
        <Notice tone="warning">
          You’re offline. Starting a plan needs a connection, since the visits are made on the
          server.
        </Notice>
      ) : null}
      {plan ? (
        <Button
          title={starting ? "Starting…" : "Start Plan"}
          loading={starting}
          disabled={offline}
          onPress={() => void startPlan()}
        />
      ) : (
        <Button title={when === "now" ? "Create and Start Job" : "Create Job"} onPress={save} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  cols: { flexDirection: "row", gap: space["3"] },
  // Each added repair under a hairline, its name and Remove on one line.
  addedRepair: {
    gap: space["3"],
    paddingTop: space["3"],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.separator,
  },
  repairHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
});
