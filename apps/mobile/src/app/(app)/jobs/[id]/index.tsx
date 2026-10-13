import { Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Alert, Linking, Platform, Pressable, View } from "react-native";
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
  Card,
  Field,
  Notice,
  Row,
  Screen,
  Section,
  StatusChip,
  T,
  Segmented,
  Toggle,
} from "../../../../ui/components";
import { color } from "../../../../ui/theme";
import { ChecklistTab } from "../../../../features/inspection/ChecklistTab";
import { FindingsTab } from "../../../../features/inspection/FindingsTab";
import { TestsTab } from "../../../../features/inspection/TestsTab";
import { MediaSection } from "../../../../features/media/MediaSection";
import { InvoiceSection } from "../../../../features/invoice/InvoiceSection";
import { QuoteTab } from "../../../../features/quote/QuoteTab";
import { ReportTab } from "../../../../features/report/ReportTab";

const ACTION_LABELS: Partial<Record<JobStatus, string>> = {
  in_progress: "Start Job",
  scheduled: "Move Back to Scheduled",
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
  const update = (values: Record<string, JsonValue>) =>
    services.sync.write("job", job.id, company.id, values);

  function changeStatus(to: JobStatus) {
    const apply = () => {
      const values: Record<string, JsonValue> = { status: to };
      if (to === "in_progress" && !job!.started_at) values.started_at = new Date().toISOString();
      update(values);
    };
    if (to === "canceled") {
      Alert.alert("Cancel this job?", "You can reopen it later.", [
        { text: "Keep Job", style: "cancel" },
        { text: "Cancel Job", style: "destructive", onPress: apply },
      ]);
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

      <Row>
        <StatusChip status={job.status} />
        <T variant="muted">
          {job.status === "in_progress"
            ? "Started"
            : formatSchedule(job.scheduled_start, new Date(), company.timezone)}
        </T>
      </Row>

      <Card>
        <T variant="label">Customer</T>
        <T variant="heading">{customer?.name ?? "Customer"}</T>
        {customer?.phone ? (
          <Pressable
            accessibilityRole="link"
            onPress={() => void Linking.openURL(`tel:${customer.phone}`)}
          >
            <T variant="strong" style={{ color: color.link }}>
              {customer.phone}
            </T>
          </Pressable>
        ) : null}
        {customer?.email ? <T variant="small">{customer.email}</T> : null}
      </Card>

      <Card>
        <T variant="label">Pool</T>
        {property ? (
          <>
            <Pressable
              accessibilityRole="link"
              accessibilityHint="Directions in Maps"
              onPress={openMaps}
            >
              <T variant="strong" style={{ color: color.link }}>
                {address}
              </T>
            </Pressable>
            <T variant="small">
              {[
                property.pool_type ? POOL_TYPE_LABELS[property.pool_type] : null,
                property.has_spa ? "Pool and spa" : "Pool",
              ]
                .filter(Boolean)
                .join(" · ")}
            </T>
            {property.access_notes ? <Notice tone="warning">{property.access_notes}</Notice> : null}
          </>
        ) : (
          <T variant="muted">Address not on this phone yet.</T>
        )}
      </Card>

      <Card>
        <T variant="label">Assigned to</T>
        <T variant="body">
          {assignee?.full_name ??
            assignee?.email ??
            (job.assigned_user_id ? "Teammate" : "Nobody yet")}
          {second ? ` and ${second.full_name ?? second.email ?? "teammate"}` : ""}
        </T>
      </Card>

      <Card>
        <Field
          label="Detection fee ($)"
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
          hint="Shown on the report."
        />
        <Toggle
          label="Leak location marked"
          value={job.location_marked ?? false}
          onChange={(v) => update({ location_marked: v })}
        />
      </Card>

      <View style={{ gap: 8 }}>
        {userTransitions(job.status, job.type).map((to) => (
          <Button
            key={to}
            title={ACTION_LABELS[to] ?? JOB_STATUS_LABELS[to]}
            kind={to === "in_progress" ? "primary" : to === "canceled" ? "danger" : "secondary"}
            onPress={() => changeStatus(to)}
          />
        ))}
      </View>

      <Section title="Inspection">
        <Segmented
          options={[
            { value: "checklist", label: "Checklist" },
            { value: "tests", label: "Tests" },
            { value: "findings", label: "Findings" },
            { value: "report", label: "Report" },
            ...(job.type === "detection" ? [{ value: "quote" as const, label: "Quote" }] : []),
          ]}
          value={tab}
          onChange={setTab}
        />
        {tab === "checklist" ? <ChecklistTab job={job} property={property} /> : null}
        {tab === "tests" ? <TestsTab job={job} /> : null}
        {tab === "findings" ? <FindingsTab job={job} property={property} /> : null}
        {tab === "report" ? <ReportTab job={job} customer={customer} /> : null}
        {tab === "quote" ? <QuoteTab job={job} /> : null}
      </Section>

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
