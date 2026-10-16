import { router, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Linking, Platform, Pressable, StyleSheet, TextInput, View } from "react-native";
import {
  JOB_STATUS_LABELS,
  POOL_TYPE_LABELS,
  formatAddress,
  formatSchedule,
  nativeMapsUrl,
  propertyLocation,
  parseDollars,
  userTransitions,
  type Customer,
  type Job,
  type JobStatus,
  type Property,
} from "@leakbook/core";
import type { JsonValue } from "@leakbook/sync";
import { useRow } from "../../../../data/hooks";
import { useCompany, useSession } from "../../../../state/session";
import {
  Button,
  Field,
  Group,
  ListRow,
  Notice,
  Row,
  Screen,
  StatusChip,
  T,
  Segmented,
  Toggle,
} from "../../../../ui/components";
import { confirmDestructive } from "../../../../ui/confirm";
import { Icon } from "../../../../ui/Icon";
import { color, face, radius, space, touch } from "../../../../ui/theme";
import { ChecklistTab } from "../../../../features/inspection/ChecklistTab";
import { FindingsTab } from "../../../../features/inspection/FindingsTab";
import { TestsTab } from "../../../../features/inspection/TestsTab";
import { MediaSection } from "../../../../features/media/MediaSection";
import { InvoiceSection } from "../../../../features/invoice/InvoiceSection";
import { QuoteTab } from "../../../../features/quote/QuoteTab";
import { ReportTab } from "../../../../features/report/ReportTab";

const ACTION_LABELS: Partial<Record<JobStatus, string>> = {
  in_progress: "Start Job",
  scheduled: "Back to Scheduled",
  unscheduled: "Reopen Job",
  canceled: "Cancel Job",
  done: "Mark Done",
};

type Tab = "checklist" | "tests" | "findings" | "report" | "quote";

export default function JobDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const company = useCompany();
  const { services } = useSession();
  const job = useRow<Job>("job", id);
  const property = useRow<Property>("property", job?.property_id);
  const customer = useRow<Customer>("customer", job?.bill_to_customer_id ?? property?.customer_id);
  const [tab, setTab] = useState<Tab>("checklist");
  const [notes, setNotes] = useState<string | null>(null);
  const [fee, setFee] = useState<string | null>(null);
  // Notes save shortly after typing stops and when leaving the screen. Relying on blur
  // alone lost edits on iPhone, where leaving the field often does not blur it.
  const pendingNotes = useRef<string | null>(null);
  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushNotes = useRef(() => {});
  useEffect(() => {
    flushNotes.current = () => {
      if (notesTimer.current) clearTimeout(notesTimer.current);
      notesTimer.current = null;
      const value = pendingNotes.current;
      pendingNotes.current = null;
      if (job && value !== null && value !== (job.summary_notes ?? "")) {
        services.sync.write("job", job.id, company.id, { summary_notes: value });
      }
    };
  });
  useEffect(() => () => flushNotes.current(), []);

  if (!job) {
    return (
      <Screen>
        <Notice tone="warning">This job isn’t on this phone.</Notice>
      </Screen>
    );
  }

  const team = services.sync.team();
  const assignee = team.find((p) => p.id === job.assigned_user_id);
  const second = team.find((p) => p.id === job.second_tech_id);
  const techs =
    (assignee?.full_name ?? assignee?.email ?? (job.assigned_user_id ? "Teammate" : "Nobody yet")) +
    (second ? ` and ${second.full_name ?? second.email ?? "teammate"}` : "");
  const transitions = userTransitions(job.status, job.type);
  const others = transitions.filter((to) => to !== "in_progress");
  const update = (values: Record<string, JsonValue>) =>
    services.sync.write("job", job.id, company.id, values);

  function changeStatus(to: JobStatus) {
    const apply = () => {
      const values: Record<string, JsonValue> = { status: to };
      if (to === "in_progress" && !job!.started_at) values.started_at = new Date().toISOString();
      update(values);
    };
    if (to === "canceled") {
      confirmDestructive({
        title: "Cancel this job?",
        message: "You can reopen it later.",
        confirm: "Cancel Job",
        cancel: "Keep Job",
        onConfirm: apply,
      });
    } else {
      apply();
    }
  }

  const address = property ? formatAddress(property) : "";
  // Directions in the phone's maps app (Apple Maps on iPhone, the default app on Android).
  const openMaps = () =>
    void Linking.openURL(
      nativeMapsUrl({ address, location: propertyLocation(property) }, Platform.OS),
    );

  return (
    <Screen>
      <Stack.Screen options={{ title: job.number ? `Job #${job.number}` : "New Job" }} />

      {/* Who, where, and what, as an inset grouped list (iOS) or a list card (Android). */}
      <Group>
        <ListRow>
          <Row style={{ gap: space["2"] }}>
            <StatusChip status={job.status} />
            <T variant="muted" numberOfLines={1} style={{ flexShrink: 1 }}>
              {job.status === "in_progress"
                ? "Started"
                : formatSchedule(job.scheduled_start, new Date(), company.timezone)}
            </T>
          </Row>
        </ListRow>
        <ListRow
          trailing={
            customer?.phone ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Call ${customer.phone}`}
                hitSlop={4}
                onPress={() => void Linking.openURL(`tel:${customer.phone}`)}
                style={({ pressed }) => [styles.callButton, pressed && { opacity: 0.8 }]}
              >
                <Icon name="call" size={20} color={color.navy} />
              </Pressable>
            ) : undefined
          }
        >
          <T variant="heading">{customer?.name ?? "Customer"}</T>
          {customer?.email ? <T variant="muted">{customer.email}</T> : null}
        </ListRow>
        {property ? (
          <ListRow
            accessibilityRole="link"
            accessibilityHint="Directions in Maps"
            onPress={openMaps}
            chevron={false}
            trailing={<Icon name="directions" size={20} color={color.link} />}
          >
            <T variant="body" style={{ color: color.link }}>
              {address}
            </T>
          </ListRow>
        ) : (
          <ListRow subtitle="Address not on this phone yet." />
        )}
        {property ? (
          <ListRow
            title="Pool"
            detail={[
              property.pool_type ? POOL_TYPE_LABELS[property.pool_type] : null,
              property.has_spa ? "Pool and spa" : "Pool",
            ]
              .filter(Boolean)
              .join(" · ")}
          />
        ) : null}
        <ListRow title="Tech" detail={techs} />
      </Group>
      {property?.access_notes ? <Notice tone="warning">{property.access_notes}</Notice> : null}

      {/* Leak detection only: the fee and whether the leak was marked. */}
      {job.type === "maintenance" ? (
        <Button
          title="Chemical Calculator"
          kind="secondary"
          onPress={() => router.push("/chemicals")}
        />
      ) : (
        <Group>
          <ListRow>
            <Row>
              <T variant="body" style={{ flex: 1 }}>
                Detection fee ($)
              </T>
              <TextInput
                accessibilityLabel="Detection fee ($)"
                value={fee ?? (job.fee_cents != null ? (job.fee_cents / 100).toFixed(2) : "")}
                onChangeText={setFee}
                onBlur={() => {
                  if (fee === null) return;
                  const cents = fee.trim() ? parseDollars(fee) : null;
                  if (cents === null && fee.trim()) return setFee(null);
                  update({ fee_cents: cents });
                  setFee(null);
                }}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={color.textMuted}
                style={styles.feeInput}
              />
            </Row>
          </ListRow>
          <Toggle
            inList
            label="Leak location marked"
            value={job.location_marked ?? false}
            onChange={(v) => update({ location_marked: v })}
          />
        </Group>
      )}

      {/* The primary action full width; the others side by side as half-width pills. */}
      <View style={{ gap: space["2"] }}>
        {transitions
          .filter((to) => to === "in_progress")
          .map((to) => (
            <Button
              key={to}
              title={ACTION_LABELS[to] ?? JOB_STATUS_LABELS[to]}
              onPress={() => changeStatus(to)}
            />
          ))}
        {others.length > 0 ? (
          <View style={styles.actionRow}>
            {others.map((to) => (
              <Button
                key={to}
                title={ACTION_LABELS[to] ?? JOB_STATUS_LABELS[to]}
                kind={to === "canceled" ? "danger" : "secondary"}
                onPress={() => changeStatus(to)}
                style={styles.halfButton}
              />
            ))}
          </View>
        ) : null}
      </View>

      <Segmented
        options={[
          { value: "checklist", label: "Checklist" },
          // Tests and findings are leak detection; a pool service visit has none.
          ...(job.type === "maintenance"
            ? []
            : [
                { value: "tests" as const, label: "Tests" },
                { value: "findings" as const, label: "Findings" },
              ]),
          { value: "report", label: "Report" },
          ...(job.type === "detection" || job.type === "maintenance"
            ? [{ value: "quote" as const, label: "Quote" }]
            : []),
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === "checklist" ? <ChecklistTab job={job} property={property} /> : null}
      {tab === "tests" ? <TestsTab job={job} /> : null}
      {tab === "findings" ? <FindingsTab job={job} property={property} /> : null}
      {tab === "report" ? <ReportTab job={job} customer={customer} /> : null}
      {tab === "quote" ? <QuoteTab job={job} /> : null}

      <InvoiceSection job={job} customer={customer} />

      <MediaSection target={{ jobId: job.id }} title="All Photos and Notes" />

      <Field
        label="Job notes"
        value={notes ?? job.summary_notes ?? ""}
        onChangeText={setNotes}
        onBlur={() => {
          if (notes !== null && notes !== (job.summary_notes ?? ""))
            update({ summary_notes: notes });
          setNotes(null);
        }}
        multiline
        placeholder="Anything the office should know"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  // Round contact button: 40 pt to look, 48 pt to tap with the hit slop.
  callButton: {
    width: touch - 8,
    height: touch - 8,
    borderRadius: radius.pill,
    backgroundColor: color.neutral100,
    alignItems: "center",
    justifyContent: "center",
  },
  // The fee sits at the row's right, like a value in iOS Settings; tap to type.
  feeInput: {
    ...face.regular,
    minWidth: 96,
    minHeight: touch - 4,
    fontSize: 17,
    textAlign: "right",
    color: color.text,
  },
  actionRow: { flexDirection: "row", flexWrap: "wrap", gap: space["2"] },
  halfButton: { flexGrow: 1, flexBasis: "45%", paddingHorizontal: space["2"] },
});
