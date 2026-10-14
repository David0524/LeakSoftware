import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import {
  POOL_TYPE_LABELS,
  formatAddress,
  localDate,
  newJobRecords,
  validateNewJob,
  planComponents,
  parseDollars,
  splitEmails,
  type ComponentType,
  type PriceBookItem,
  type Customer,
  type NewJobInput,
  type DiagramShape,
  type PoolType,
  type Property,
  seesAllJobs,
} from "@leakbook/core";
import { useRows } from "../../../data/hooks";
import { useCompany, useSession } from "../../../state/session";
import {
  Button,
  Card,
  Choice,
  Field,
  Notice,
  Screen,
  Section,
  T,
  Toggle,
  Segmented,
} from "../../../ui/components";
import { ShapePicker } from "../../../ui/ShapePicker";
import { color, space } from "../../../ui/theme";

type When = "now" | "scheduled" | "later";

export default function NewJob() {
  const company = useCompany();
  const { services, user, membership } = useSession();
  const seesAll = seesAllJobs(membership?.role, company.settings);
  const customers = useRows<Customer>("customer", company.id);
  const properties = useRows<Property>("property", company.id);
  const componentTypes = useRows<ComponentType>("component_type", company.id);
  const priceBook = useRows<PriceBookItem>("price_book_item", company.id);
  const questions = company.settings.intake_questions ?? [];
  const team = services.sync.team().filter((p) => p.id !== user?.id);

  const [customerId, setCustomerId] = useState<string | undefined>();
  const [search, setSearch] = useState("");
  const [propertyId, setPropertyId] = useState<string | undefined>();
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
  // The detection fee starts from the price book (pool, or pool and spa).
  const detection = priceBook
    .filter((i) => i.active && i.category === "Detection")
    .sort((a, b) => a.sort_order - b.sort_order);
  const spaChosen = propertyId
    ? (properties.find((p) => p.id === propertyId)?.has_spa ?? false)
    : hasSpa;
  const suggestedFee = (spaChosen ? detection[1] : detection[0]) ?? detection[0];
  const feeText = fee ?? (suggestedFee ? (suggestedFee.price_cents / 100).toFixed(2) : "");

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
    setErrors(e);
    const feeCents = feeText.trim() ? parseDollars(feeText) : null;
    const badFee = Boolean(feeText.trim()) && (feeCents === null || feeCents < 0);
    setFeeError(badFee ? "Enter a price like 649." : undefined);
    if (Object.keys(e).length > 0 || badFee) return;

    const records = newJobRecords(input, {
      poolType,
      hasSpa,
      accessNotes,
      assignedUserId: assignToMe || !seesAll ? (user?.id ?? null) : null,
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
        });
      const job = sync.insert("job", company.id, {
        ...records.job,
        property_id: prop,
        bill_to_customer_id: cust,
        fee_cents: feeCents,
        second_tech_id: secondTech === "none" ? null : secondTech,
        intake: answers,
      });
      // The checklist is ready the moment the job opens, even offline.
      const existingProperty = properties.find((p) => p.id === prop);
      const spa = existingProperty ? existingProperty.has_spa : hasSpa;
      const type = existingProperty ? (existingProperty.pool_type ?? null) : poolType;
      for (const planned of planComponents(componentTypes, {
        has_pool: true,
        has_spa: spa,
        pool_type: type,
      })) {
        const componentId = sync.insert("job_component", company.id, { job_id: job, ...planned });
        sync.insert("checklist_item_result", company.id, {
          job_id: job,
          job_component_id: componentId,
          status: "pending",
        });
      }
      return job;
    });
    router.replace(`/jobs/${jobId}`);
  }

  return (
    <Screen>
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
                setPropertyId(undefined);
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
            {matches.map((c) => (
              <Pressable
                key={c.id}
                accessibilityRole="button"
                onPress={() => {
                  setCustomerId(c.id);
                  setSearch("");
                  const props = properties.filter((p) => p.customer_id === c.id);
                  setPropertyId(props.length === 1 ? props[0]!.id : undefined);
                }}
                style={styles.match}
              >
                <T variant="strong">{c.name}</T>
                <T variant="muted">
                  {[c.phone, c.email].filter(Boolean).join(" · ") || "No contact details"}
                </T>
              </Pressable>
            ))}
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

      {questions.length > 0 ? (
        <Section title="Booking">
          {questions.map((q) =>
            q.type === "multi" ? (
              <View key={q.key} style={{ gap: 4 }}>
                <T variant="label">{q.label}</T>
                {(q.options ?? []).map((o) => {
                  const picked = ((answers[q.key] as string[] | undefined) ?? []).includes(o);
                  return (
                    <Toggle
                      key={o}
                      label={o}
                      value={picked}
                      onChange={(on) =>
                        setAnswers((a) => {
                          const list = ((a[q.key] as string[] | undefined) ?? []).filter(
                            (x) => x !== o,
                          );
                          return { ...a, [q.key]: on ? [...list, o] : list };
                        })
                      }
                    />
                  );
                })}
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
            label="Detection fee ($)"
            value={feeText}
            onChangeText={setFee}
            keyboardType="decimal-pad"
            error={feeError}
            hint="Shown on the report."
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
            onChange={(v) => setPropertyId(v === "new" ? undefined : v)}
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
            <ShapePicker
              value={shape}
              onChange={setShape}
              label="Pool shape (optional)"
              hint="Leave it blank if you don’t know yet; set it later on Findings."
            />
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
                <Field
                  label="Date"
                  value={form.scheduleDate}
                  onChangeText={set("scheduleDate")}
                  placeholder="YYYY-MM-DD"
                  error={errors.scheduleDate}
                  keyboardType="numbers-and-punctuation"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Field
                  label="Time"
                  value={form.scheduleTime}
                  onChangeText={set("scheduleTime")}
                  placeholder="08:00"
                  error={errors.scheduleTime}
                  keyboardType="numbers-and-punctuation"
                />
              </View>
            </View>
          </>
        ) : null}
        {/* When techs see only their own jobs, a tech's new job is always theirs. */}
        {seesAll ? (
          <Toggle label="Assign to me" value={assignToMe} onChange={setAssignToMe} />
        ) : null}
        {team.length > 0 ? (
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

      {Object.keys(errors).length > 0 ? (
        <Notice tone="error">Fix the highlighted fields.</Notice>
      ) : null}
      <Button title={when === "now" ? "Create and Start Job" : "Create Job"} onPress={save} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  cols: { flexDirection: "row", gap: space["3"] },
  match: {
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: 10,
    padding: space["3"],
    gap: 2,
  },
});
