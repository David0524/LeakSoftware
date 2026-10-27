import { router, useLocalSearchParams } from "expo-router";
import { DraftNote } from "../../../../../ui/DraftNote";
import { useDraft } from "../../../../../ui/useDraft";
import {
  CUSTOMER_EMAILS_LABEL,
  CUSTOMER_EMAILS_OFF_LABEL,
  JOB_TYPE_LABELS,
  POOL_TYPE_LABELS,
  formatAddress,
  mapStatus,
  formatPhone,
  formatSchedule,
  isManagerRole,
  localDate,
  offersLeak,
  offersPool,
  propertyLocation,
  readingSummary,
  splitEmails,
  type PoolType,
  type Property,
  friendlyError,
} from "@leakbook/core";
import type { JsonValue } from "@leakbook/sync";
import { useState } from "react";
import { Alert, Linking, StyleSheet, Text, View } from "react-native";
import { latestByPool, useChemicalLog } from "../../../../../data/chemicals";
import { KIND_LABELS, useCustomerData } from "../../../../../data/customers";
import { MaintenancePlans } from "../../../../../features/maintenance/MaintenancePlans";
import { useRememberOpened } from "../../../../../features/search/useRememberOpened";
import { useTeam } from "../../../../../data/schedule";
import { useLine } from "../../../../../data/texting";
import { useRoutingOn } from "../../../../../lib/routing";
import { AddressLine } from "../../../../../ui/NotOnMap";
import { PoolForm } from "../../../../../features/pool/PoolForm";
import { getServices } from "../../../../../lib/services";
import { openDirections, useDirectionsChoice } from "../../../../../state/directions";
import { useCompany, useSession } from "../../../../../state/session";
import {
  Button,
  FieldGroup,
  FieldRow,
  Group,
  ListRow,
  Notice,
  RoundButton,
  Screen,
  Section,
  StatusChip,
  T,
  Toggle,
} from "../../../../../ui/components";
import { confirmDestructive } from "../../../../../ui/confirm";
import { haptics } from "../../../../../ui/haptics";
import { formChanged } from "../../../../../lib/discard";
import { ModalSheet, useUnsavedChanges } from "../../../../../ui/ModalSheet";
import { Select } from "../../../../../ui/Select";
import { color, face, MAX_TEXT_SCALE, space, type } from "../../../../../ui/theme";

/**
 * A customer (spec 5.9; the website's customers/[id]): call, text, and email up top, the
 * contact details as grouped rows, each pool with its jobs, and each group's details edited in
 * a sheet. Edits save through the sync layer.
 */
export default function CustomerPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const company = useCompany();
  const { membership } = useSession();
  const manager = isManagerRole(membership?.role);
  const { customers, properties, plans, jobs } = useCustomerData(company.id);
  const team = useTeam(company.id);
  // Each pool's latest chemical log entry (owner, 2026-10-19), as the website.
  const lastReadings = latestByPool(useChemicalLog(company.id));
  const line = useLine(company.id);
  const [choice] = useDirectionsChoice();
  const routing = useRoutingOn();
  const [editing, setEditing] = useState<"contact" | Property | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const customer = customers.find((c) => c.id === id && !c.deleted_at);
  // First under Recent in search (docs/plans/search-and-activity.md), as the website's.
  useRememberOpened(
    customer
      ? {
          kind: "customer",
          id: customer.id,
          title: customer.name,
          detail: customer.phone?.trim() || customer.email?.trim() || null,
        }
      : null,
  );

  if (!customer) {
    return (
      <Screen title="Customer">
        <T muted>This customer isn’t on this phone.</T>
      </Screen>
    );
  }
  const pools = properties.filter((p) => p.customer_id === customer.id && !p.deleted_at);
  const techName = (uid: string | null | undefined) =>
    uid ? team.find((t) => t.user_id === uid)?.name : undefined;
  const cc = customer.cc_emails ?? [];
  const now = new Date();
  const today = localDate(now, company.timezone);
  const techs = team
    .filter((t) => t.status === "active")
    .map((t) => ({ id: t.user_id, name: t.name }));
  const doneCounts: Record<string, number> = {};
  for (const j of jobs)
    if (j.service_plan_id && j.status === "done" && !j.deleted_at)
      doneCounts[j.service_plan_id] = (doneCounts[j.service_plan_id] ?? 0) + 1;
  const subtitle = [KIND_LABELS[customer.kind], customer.company_name].filter(Boolean).join(" · ");

  function remove() {
    confirmDestructive({
      title: `Delete ${customer!.name}?`,
      message:
        "Only possible when every job is paid or canceled; finished jobs, reports, and invoices are kept.",
      confirm: "Delete Customer",
      onConfirm: () =>
        void (async () => {
          const { supabase, sync } = getServices();
          const { error } = await supabase.rpc("delete_customer", {
            target_customer: customer!.id,
          });
          if (error) {
            Alert.alert("Couldn’t Delete", friendlyError(error.message));
            return;
          }
          await sync.syncNow();
          router.back();
        })(),
    });
  }

  return (
    <>
      <Screen title={customer.name} subtitle={subtitle || undefined}>
        {notice ? <Notice tone="success">{notice}</Notice> : null}
        {customer.phone || customer.email ? (
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
                  line?.status === "active"
                    ? router.push(`/messages/new?customer=${customer.id}`)
                    : void Linking.openURL(`sms:${customer.phone!.replace(/[^\d+]/g, "")}`)
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
            <T variant="secondary" muted numberOfLines={1} style={{ flex: 1 }}>
              {customer.phone ? formatPhone(customer.phone) : customer.email}
            </T>
          </View>
        ) : null}

        <Section title="Contact">
          <Group>
            <ListRow title="Phone" detail={customer.phone ? formatPhone(customer.phone) : "None"} />
            <ListRow title="Email" detail={customer.email ?? "None"} />
            {cc.length ? <ListRow title="Other emails" subtitle={cc.join(", ")} /> : null}
            <ListRow
              title={CUSTOMER_EMAILS_LABEL}
              detail={customer.marketing_opt_out ? "Off" : "On"}
            />
            {customer.notes ? <ListRow title="Notes" subtitle={customer.notes} /> : null}
            <ListRow
              title="Edit Contact Details"
              tone="link"
              onPress={() => {
                setNotice(null);
                setEditing("contact");
              }}
            />
          </Group>
        </Section>

        {pools.length === 0 ? <T muted>No pools.</T> : null}
        {pools.map((p, i) => {
          const address = formatAddress(p);
          const visits = jobs
            .filter((j) => j.property_id === p.id && j.type !== "maintenance" && !j.deleted_at)
            .sort((a, b) =>
              (b.scheduled_start ?? b.created_at ?? "").localeCompare(
                a.scheduled_start ?? a.created_at ?? "",
              ),
            );
          const poolPlans = plans.filter((plan) => plan.property_id === p.id && !plan.deleted_at);
          return (
            <View key={p.id} style={{ gap: space["6"] }}>
              <Section title={pools.length > 1 ? `Pool ${i + 1}` : "Pool"}>
                <Group>
                  <ListRow
                    onPress={() => {
                      setNotice(null);
                      setEditing(p);
                    }}
                    chevron={false}
                    accessibilityLabel={`${address}, Edit Pool Details`}
                    trailing={<T style={{ color: color.link }}>Edit</T>}
                  >
                    <AddressLine
                      notOnMap={mapStatus(p, routing) === "missing"}
                      lineHeight={type.body.lineHeight!}
                      size={17}
                    >
                      <T variant="bodyEmphasis">{address}</T>
                    </AddressLine>
                    <T variant="secondary" muted>
                      {[
                        p.pool_type ? POOL_TYPE_LABELS[p.pool_type as PoolType] : null,
                        p.has_spa ? "Pool and spa" : "Pool",
                        p.approx_gallons
                          ? `${p.approx_gallons.toLocaleString("en-US")} gallons`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </T>
                  </ListRow>
                  {p.access_notes ? (
                    <ListRow title="Access notes" subtitle={p.access_notes} />
                  ) : null}
                  {offersPool(company.settings) ? (
                    <ListRow
                      title="Chemical"
                      tone="link"
                      chevron
                      subtitle={(() => {
                        const last = lastReadings.get(p.id);
                        return last
                          ? `Last: ${readingSummary(last)} · ${formatSchedule(last.recorded_at, new Date(), company.timezone)}`
                          : "Readings and the chemical log";
                      })()}
                      onPress={() =>
                        router.push({ pathname: "/chemicals", params: { property: p.id } })
                      }
                    />
                  ) : null}
                  <ListRow
                    title="Get Directions"
                    tone="link"
                    onPress={() =>
                      openDirections({ address, location: propertyLocation(p) }, choice)
                    }
                  />
                </Group>
              </Section>
              {offersPool(company.settings) ? (
                <MaintenancePlans
                  customerId={customer.id}
                  propertyId={p.id}
                  plans={poolPlans}
                  techs={techs}
                  today={today}
                  doneCounts={doneCounts}
                  canEdit={manager}
                  onNotice={setNotice}
                />
              ) : null}
              <Section
                title={offersLeak(company.settings) ? "Leak detection and repairs" : "Repairs"}
              >
                <Group>
                  {visits.length === 0 ? (
                    <ListRow>
                      <T muted>No visits yet</T>
                    </ListRow>
                  ) : (
                    visits.map((j) => (
                      <ListRow
                        key={j.id}
                        onPress={() => router.push(`/jobs/${j.id}`)}
                        trailing={<StatusChip status={j.status} style={{ alignSelf: "center" }} />}
                      >
                        <Text
                          style={[type.body, { color: color.text }]}
                          maxFontSizeMultiplier={MAX_TEXT_SCALE}
                        >
                          <Text style={face.semiBold}>
                            {j.number ? `Job #${j.number}` : "New job"}
                          </Text>
                          <Text style={{ color: color.textMuted }}>
                            {" "}
                            · {JOB_TYPE_LABELS[j.type]}
                          </Text>
                        </Text>
                        <T variant="secondary" muted>
                          {formatSchedule(
                            j.scheduled_start ?? j.started_at ?? null,
                            now,
                            company.timezone,
                          )}
                          {techName(j.assigned_user_id) ? ` · ${techName(j.assigned_user_id)}` : ""}
                        </T>
                      </ListRow>
                    ))
                  )}
                </Group>
              </Section>
            </View>
          );
        })}

        {manager ? (
          <View style={{ gap: space["2"] }}>
            <Button title="Delete Customer" kind="danger" wide onPress={remove} />
            <T variant="footnote" muted style={{ paddingHorizontal: space["4"] }}>
              Removes {customer.name} and their pools from Sundeck Pro. Only possible when every job
              is paid or canceled; finished jobs, reports, and invoices are kept.
            </T>
          </View>
        ) : null}
      </Screen>

      <ModalSheet
        visible={editing === "contact"}
        onClose={() => setEditing(null)}
        title="Contact Details"
      >
        {editing === "contact" ? (
          <ContactForm
            customer={customer}
            onSaved={() => {
              setEditing(null);
              setNotice("Saved.");
            }}
          />
        ) : null}
      </ModalSheet>
      <ModalSheet
        visible={editing != null && editing !== "contact"}
        onClose={() => setEditing(null)}
        title="Pool Details"
      >
        {editing && editing !== "contact" ? (
          <PoolForm
            pool={editing}
            onSaved={() => {
              setEditing(null);
              setNotice("Saved.");
            }}
          />
        ) : null}
      </ModalSheet>
    </>
  );
}

type CustomerFields = ReturnType<typeof useCustomerData>["customers"][number];

function ContactForm({ customer, onSaved }: { customer: CustomerFields; onSaved: () => void }) {
  const company = useCompany();
  const [f, setF] = useState({
    name: customer.name,
    kind: customer.kind as string,
    company_name: customer.company_name ?? "",
    phone: customer.phone ?? "",
    email: customer.email ?? "",
    cc: (customer.cc_emails ?? []).join(" "),
    notes: customer.notes ?? "",
    optOut: Boolean(customer.marketing_opt_out),
  });
  // Unsaved entries ask before closing (owner, 2026-10-20: "Discard changes?" everywhere).
  const [startF] = useState(f);
  // Typed text is kept as a draft until it's saved or discarded (owner, 2026-10-27).
  const draft = useDraft({
    form: "customer",
    id: customer.id,
    fields: {
      name: f.name,
      company_name: f.company_name,
      phone: f.phone,
      email: f.email,
      cc: f.cc,
      notes: f.notes,
    },
    restore: (c) => setF((old) => ({ ...old, ...c })),
  });
  useUnsavedChanges(formChanged(startF, f), draft);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });

  function save() {
    const e: Record<string, string> = {};
    if (!f.name.trim()) e.name = "Enter the customer’s name.";
    if (f.email.trim() && !/^\S+@\S+\.\S+$/.test(f.email.trim()))
      e.email = "Enter an email like name@example.com.";
    const cc = splitEmails(f.cc);
    if (f.cc.split(/[\s,;]+/).filter(Boolean).length !== cc.length)
      e.cc = "One of these isn’t an email address.";
    setErrors(e);
    if (Object.keys(e).length) return;
    getServices().sync.write("customer", customer.id, company.id, {
      name: f.name.trim(),
      kind: f.kind,
      company_name: f.company_name.trim() || null,
      phone: f.phone.trim() || null,
      email: f.email.trim() || null,
      cc_emails: cc,
      notes: f.notes.trim() || null,
      marketing_opt_out: f.optOut,
    } as Record<string, JsonValue>);
    haptics.success();
    draft.clear();
    onSaved();
  }

  return (
    <>
      <DraftNote draft={draft} />
      <FieldGroup labelWidth={104}>
        <FieldRow label="Name" value={f.name} onChangeText={set("name")} error={errors.name} />
        <FieldRow
          label="Company"
          value={f.company_name}
          onChangeText={set("company_name")}
          placeholder="Optional"
        />
        <FieldRow
          label="Phone"
          value={f.phone}
          onChangeText={set("phone")}
          keyboardType="phone-pad"
        />
        <FieldRow
          label="Email"
          value={f.email}
          onChangeText={set("email")}
          keyboardType="email-address"
          autoCapitalize="none"
          error={errors.email}
        />
      </FieldGroup>
      <Select
        label="Type"
        value={f.kind}
        onChange={set("kind")}
        options={Object.entries(KIND_LABELS).map(([value, label]) => ({ value, label }))}
      />
      <FieldGroup footer="They get reports too. Separate with spaces.">
        <FieldRow
          label="Other emails"
          layout="stacked"
          value={f.cc}
          onChangeText={set("cc")}
          autoCapitalize="none"
          keyboardType="email-address"
          error={errors.cc}
        />
      </FieldGroup>
      <FieldGroup>
        <FieldRow label="Notes" value={f.notes} onChangeText={set("notes")} multiline />
        <Toggle
          inList
          label={CUSTOMER_EMAILS_OFF_LABEL}
          value={f.optOut}
          onChange={(v) => setF({ ...f, optOut: v })}
        />
      </FieldGroup>
      <Button title="Save" wide onPress={save} />
    </>
  );
}

const styles = StyleSheet.create({
  contact: { flexDirection: "row", alignItems: "center", gap: space["2"] },
});
