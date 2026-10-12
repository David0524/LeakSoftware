import { Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Alert, Linking, Pressable, View } from "react-native";
import {
  JOB_STATUS_LABELS,
  POOL_TYPE_LABELS,
  formatAddress,
  formatSchedule,
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
  Choice,
  Field,
  Notice,
  Row,
  Screen,
  Section,
  StatusChip,
  T,
} from "../../../../ui/components";
import { color } from "../../../../ui/theme";
import { ChecklistTab } from "../../../../features/inspection/ChecklistTab";
import { FindingsTab } from "../../../../features/inspection/FindingsTab";
import { TestsTab } from "../../../../features/inspection/TestsTab";

const ACTION_LABELS: Partial<Record<JobStatus, string>> = {
  in_progress: "Start job",
  scheduled: "Move back to scheduled",
  unscheduled: "Reopen job",
  canceled: "Cancel job",
};

type Tab = "checklist" | "tests" | "findings" | "report";

export default function JobDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const company = useCompany();
  const { services } = useSession();
  const job = useRow<Job>("job", id);
  const property = useRow<Property>("property", job?.property_id);
  const customer = useRow<Customer>("customer", job?.bill_to_customer_id ?? property?.customer_id);
  const [tab, setTab] = useState<Tab>("checklist");
  const [notes, setNotes] = useState<string | null>(null);
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
        { text: "Keep job", style: "cancel" },
        { text: "Cancel job", style: "destructive", onPress: apply },
      ]);
    } else {
      apply();
    }
  }

  const address = property ? formatAddress(property) : "";

  return (
    <Screen>
      <Stack.Screen options={{ title: job.number ? `Job #${job.number}` : "New job" }} />

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
              onPress={() =>
                void Linking.openURL(`https://maps.apple.com/?q=${encodeURIComponent(address)}`)
              }
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
        </T>
      </Card>

      <View style={{ gap: 8 }}>
        {userTransitions(job.status).map((to) => (
          <Button
            key={to}
            title={ACTION_LABELS[to] ?? JOB_STATUS_LABELS[to]}
            kind={to === "in_progress" ? "primary" : to === "canceled" ? "danger" : "secondary"}
            onPress={() => changeStatus(to)}
          />
        ))}
      </View>

      <Section title="Inspection">
        <Choice
          options={[
            { value: "checklist", label: "Checklist" },
            { value: "tests", label: "Tests" },
            { value: "findings", label: "Findings" },
            { value: "report", label: "Report" },
          ]}
          value={tab}
          onChange={setTab}
        />
        {tab === "checklist" ? <ChecklistTab job={job} property={property} /> : null}
        {tab === "tests" ? <TestsTab job={job} /> : null}
        {tab === "findings" ? <FindingsTab job={job} property={property} /> : null}
        {tab === "report" ? (
          <Card>
            <T variant="muted">Reports arrive in a later update.</T>
          </Card>
        ) : null}
      </Section>

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
