import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import {
  POOL_TYPE_LABELS,
  formatAddress,
  localDate,
  newJobRecords,
  validateNewJob,
  type Customer,
  type NewJobInput,
  type PoolType,
  type Property,
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
} from "../../../ui/components";
import { color, space } from "../../../ui/theme";

type When = "now" | "scheduled" | "later";

export default function NewJob() {
  const company = useCompany();
  const { services, user } = useSession();
  const customers = useRows<Customer>("customer", company.id);
  const properties = useRows<Property>("property", company.id);

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
  const [hasSpa, setHasSpa] = useState(false);
  const [accessNotes, setAccessNotes] = useState("");
  const [when, setWhen] = useState<When>("now");
  const [assignToMe, setAssignToMe] = useState(true);
  const [errors, setErrors] = useState<ReturnType<typeof validateNewJob>>({});

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
    if (Object.keys(e).length > 0) return;

    const records = newJobRecords(input, {
      poolType,
      hasSpa,
      accessNotes,
      assignedUserId: assignToMe ? (user?.id ?? null) : null,
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
    // Customer, property, and job are saved together or not at all.
    const jobId = sync.batch(() => {
      const cust = customerId ?? sync.insert("customer", company.id, records.customer!);
      const prop =
        propertyId ??
        sync.insert("property", company.id, { ...records.property!, customer_id: cust });
      return sync.insert("job", company.id, {
        ...records.job,
        property_id: prop,
        bill_to_customer_id: cust,
      });
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
              title="Change customer"
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
          </>
        )}
      </Section>

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
        <Choice
          options={[
            { value: "now", label: "Start now" },
            { value: "scheduled", label: "Schedule" },
            { value: "later", label: "Not scheduled" },
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
        <Toggle label="Assign to me" value={assignToMe} onChange={setAssignToMe} />
      </Section>

      {Object.keys(errors).length > 0 ? (
        <Notice tone="error">Fix the highlighted fields.</Notice>
      ) : null}
      <Button title={when === "now" ? "Create and start job" : "Create job"} onPress={save} />
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
