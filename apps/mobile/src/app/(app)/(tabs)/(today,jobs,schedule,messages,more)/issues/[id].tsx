import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import {
  ISSUE_STATUS_LABELS,
  ISSUE_TEXT,
  ISSUE_WORK_LABELS,
  JOB_TYPE_LABELS,
  canManageIssues,
  companyServices,
  formatAddress,
  formatSchedule,
  issueActions,
  issueNoteError,
  type ComponentType,
  type Customer,
  type IssueWork,
  type Job,
  type Property,
  type ServiceIssue,
} from "@leakbook/core";
import { useRow, useRows } from "../../../../../data/hooks";
import { convertIssue, reopenIssue, resolveIssue, useIssueMedia } from "../../../../../data/issues";
import { useTeamName } from "../../../../../features/issues/Issues";
import { Thumbs } from "../../../../../features/media/MediaSection";
import { useCompany, useSession } from "../../../../../state/session";
import {
  Button,
  Card,
  Field,
  Group,
  ListRow,
  Screen,
  Section,
  T,
} from "../../../../../ui/components";
import { haptics } from "../../../../../ui/haptics";
import { ModalSheet } from "../../../../../ui/ModalSheet";
import { space } from "../../../../../ui/theme";

/**
 * One issue (docs/design/2026-11-16-service-issues.md), as the website's: what the tech wrote and
 * their photos and videos, the customer and pool, who reported it and on which visit, and the
 * office's Make Quote, Make Leak Detection Job, Resolve and Reopen. All offline, through sync.
 */
export default function IssueScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const company = useCompany();
  const { services, membership, user } = useSession();
  const issue = useRow<ServiceIssue>("service_issue", id);
  const customer = useRow<Customer>("customer", issue?.customer_id);
  const pool = useRow<Property>("property", issue?.property_id);
  const visit = useRow<Job>("job", issue?.job_id ?? undefined);
  const made = useRow<Job>("job", issue?.converted_job_id ?? undefined);
  const media = useIssueMedia(company.id, issue);
  const componentTypes = useRows<ComponentType>("component_type", company.id);
  const nameOf = useTeamName();
  const [resolving, setResolving] = useState(false);
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState<string | undefined>(undefined);

  if (!issue || issue.deleted_at) {
    return (
      <Screen title="Issue">
        <T muted>This issue isn’t on this phone.</T>
      </Screen>
    );
  }
  const shown = issue;
  const tz = company.timezone;
  const actions = issueActions(shown, membership?.role, companyServices(company.settings));
  const jobLabel = (j: Job) =>
    `${j.number ? `Job #${j.number}` : "New job"} · ${JOB_TYPE_LABELS[j.type] ?? "Job"}`;

  function convert(type: IssueWork) {
    const jobId = convertIssue(services.sync, company.id, {
      issue: shown,
      media,
      type,
      userId: user?.id ?? "",
      componentTypes,
      pool,
    });
    haptics.success();
    router.push(type === "repair" ? `/jobs/${jobId}?section=wrapup` : `/jobs/${jobId}`);
  }

  function resolve() {
    const problem = issueNoteError(note);
    if (problem) return setNoteError(problem);
    resolveIssue(company.id, shown.id, user?.id ?? "", note);
    haptics.success();
    setResolving(false);
    setNote("");
  }

  return (
    <Screen
      title={customer?.name ?? "Issue"}
      subtitle={[
        ISSUE_STATUS_LABELS[shown.status],
        shown.suggested_type ? ISSUE_WORK_LABELS[shown.suggested_type] : null,
        `Reported ${formatSchedule(shown.reported_at, new Date(), tz)}`,
      ]
        .filter(Boolean)
        .join(" · ")}
    >
      <Card padding={space["4"]} style={{ gap: space["3"] }}>
        <T>{shown.description}</T>
        {media.length ? <Thumbs media={media} /> : null}
        {actions.includes("open_job") && made ? (
          <Button title={ISSUE_TEXT.openJob} onPress={() => router.push(`/jobs/${made.id}`)} />
        ) : null}
        {actions.includes("make_quote") ? (
          <Button title={ISSUE_TEXT.makeQuote} onPress={() => convert("repair")} />
        ) : null}
        {actions.includes("make_detection") ? (
          <Button
            title={ISSUE_TEXT.makeDetection}
            kind="secondary"
            onPress={() => convert("detection")}
          />
        ) : null}
        {actions.includes("resolve") ? (
          <Button title={ISSUE_TEXT.resolve} kind="secondary" onPress={() => setResolving(true)} />
        ) : null}
        {actions.includes("reopen") ? (
          <Button
            title={ISSUE_TEXT.reopen}
            kind="secondary"
            onPress={() => reopenIssue(company.id, shown.id)}
          />
        ) : null}
        {shown.status === "open" && !canManageIssues(membership?.role) ? (
          <T variant="secondary" muted>
            {ISSUE_TEXT.onlyManagers}
          </T>
        ) : null}
      </Card>

      {shown.status === "resolved" ? (
        <Section title="Resolved">
          <Group>
            <ListRow
              title={
                shown.resolved_at ? formatSchedule(shown.resolved_at, new Date(), tz) : "Resolved"
              }
              subtitle={shown.resolution_note ?? undefined}
            />
          </Group>
        </Section>
      ) : null}

      <Section title="Customer">
        <Group>
          <ListRow
            title={customer?.name ?? "Customer"}
            subtitle={pool ? formatAddress(pool) : undefined}
            onPress={customer ? () => router.push(`/customers/${customer.id}`) : undefined}
          />
        </Group>
      </Section>

      <Section title="Reported">
        <Group>
          <ListRow title="By" detail={nameOf(shown.reported_by) ?? "—"} />
          {visit ? (
            <ListRow
              title="On"
              detail={jobLabel(visit)}
              onPress={() => router.push(`/jobs/${visit.id}`)}
            />
          ) : null}
          {made ? (
            <ListRow
              title="Made into"
              detail={jobLabel(made)}
              onPress={() => router.push(`/jobs/${made.id}`)}
            />
          ) : null}
        </Group>
      </Section>

      <ModalSheet
        visible={resolving}
        onClose={() => setResolving(false)}
        title={ISSUE_TEXT.resolveTitle}
        done={{ label: ISSUE_TEXT.resolve, onPress: resolve }}
      >
        <View style={styles.sheet}>
          <Field
            label={ISSUE_TEXT.resolveNote}
            value={note}
            onChangeText={setNote}
            placeholder={ISSUE_TEXT.resolveNotePlaceholder}
            multiline
            maxLength={1000}
            error={noteError}
          />
          <Button title={ISSUE_TEXT.resolve} onPress={resolve} />
        </View>
      </ModalSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  sheet: { gap: space["4"], padding: space["4"] },
});
