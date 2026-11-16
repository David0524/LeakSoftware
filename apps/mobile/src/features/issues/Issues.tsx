import { router } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import {
  ISSUE_STATUS_LABELS,
  ISSUE_TEXT,
  companyServices,
  issueDescriptionError,
  issueDetailLine,
  issueTitle,
  issueWorkOptions,
  uuidv7,
  type IssueWork,
  type ServiceIssue,
} from "@leakbook/core";
import { saveIssue, useJobIssues, watchIssueNotices } from "../../data/issues";
import type { MediaTarget } from "../../data/media";
import { useCompany, useSession } from "../../state/session";
import { Button, Field, Group, ListRow, Section, Segmented } from "../../ui/components";
import { haptics } from "../../ui/haptics";
import { ModalSheet, UnsavedWhen } from "../../ui/ModalSheet";
import { space } from "../../ui/theme";
import { MediaSection } from "../media/MediaSection";

// Service issues on the phone (docs/design/2026-11-16-service-issues.md), as the website's: a
// job's Issues group with Report an Issue, and the rows the Issues list and customer page use.

const shortDay = (iso: string, timeZone: string) =>
  new Date(iso).toLocaleDateString("en-US", { timeZone, month: "short", day: "numeric" });

/** One issue as a row: what's wrong (with the customer in lists), the line under it, status. */
export function IssueRow({
  issue,
  customer,
  reporter,
  timeZone,
}: {
  issue: ServiceIssue;
  customer?: string | null;
  reporter: string | null;
  timeZone: string;
}) {
  return (
    <ListRow
      title={
        customer
          ? `${customer} · ${issueTitle(issue.description, 60)}`
          : issueTitle(issue.description)
      }
      subtitle={issueDetailLine({
        suggested: issue.suggested_type,
        reporter,
        reportedOn: shortDay(issue.reported_at, timeZone),
      })}
      detail={issue.status === "open" ? undefined : ISSUE_STATUS_LABELS[issue.status]}
      onPress={() => router.push(`/issues/${issue.id}`)}
    />
  );
}

/** A teammate's name from the phone's team list. */
export function useTeamName(): (id: string | null | undefined) => string | null {
  const { services } = useSession();
  const team = services.sync.team();
  return (id) => {
    if (!id) return null;
    const p = team.find((t) => t.id === id);
    return p?.full_name ?? p?.email ?? "Teammate";
  };
}

/** A job's Issues group: those reported on it, and Report an Issue (offline too). */
export function JobIssues({
  jobId,
  customerId,
  propertyId,
}: {
  jobId: string;
  customerId: string | null | undefined;
  propertyId: string | null | undefined;
}) {
  const company = useCompany();
  const issues = useJobIssues(company.id, jobId);
  const nameOf = useTeamName();
  const [open, setOpen] = useState(false);
  // A fresh sheet (and issue) each time it opens.
  const [opening, setOpening] = useState(0);
  const [reported, setReported] = useState(false);
  if (!customerId || !propertyId) return null;
  return (
    <Section
      title="Issues"
      footer={
        reported
          ? ISSUE_TEXT.reported
          : "Spotted a problem? Report it for the office to quote or book."
      }
    >
      <Group>
        {issues.map((i) => (
          <IssueRow
            key={i.id}
            issue={i}
            reporter={nameOf(i.reported_by)}
            timeZone={company.timezone}
          />
        ))}
        <ListRow
          title={ISSUE_TEXT.report}
          tone="link"
          accessibilityRole="button"
          onPress={() => {
            setReported(false);
            setOpening((n) => n + 1);
            setOpen(true);
          }}
        />
      </Group>
      <ReportIssueSheet
        key={opening}
        visible={open}
        jobId={jobId}
        customerId={customerId}
        propertyId={propertyId}
        onClose={(done) => {
          setOpen(false);
          if (done) setReported(true);
        }}
      />
    </Section>
  );
}

/**
 * Report an Issue: what's wrong (the keyboard's dictation works), photos and videos, Suggested
 * Work, then Report. A photo saves the issue first (it's linked to it), as a test or finding is
 * saved before its first photo.
 */
function ReportIssueSheet({
  visible,
  jobId,
  customerId,
  propertyId,
  onClose,
}: {
  visible: boolean;
  jobId: string;
  customerId: string;
  propertyId: string;
  onClose: (reported: boolean) => void;
}) {
  const company = useCompany();
  const { user } = useSession();
  const [id] = useState(() => uuidv7());
  const [saved, setSaved] = useState(false);
  const [description, setDescription] = useState("");
  const [work, setWork] = useState<IssueWork | "">("");
  const [error, setError] = useState<string | undefined>(undefined);
  function save(): boolean {
    const problem = issueDescriptionError(description);
    if (problem) {
      setError(problem);
      return false;
    }
    setError(undefined);
    saveIssue(company.id, {
      id,
      customerId,
      propertyId,
      jobId,
      description,
      suggested: work || null,
      userId: user?.id ?? "",
    });
    setSaved(true);
    return true;
  }

  function report() {
    if (!save()) return;
    haptics.success();
    onClose(true);
  }

  const target: MediaTarget = { jobId, serviceIssueId: id };
  return (
    <ModalSheet
      visible={visible}
      onClose={() => onClose(saved)}
      title={ISSUE_TEXT.sheetTitle}
      done={{ label: ISSUE_TEXT.submit, onPress: report }}
    >
      <View style={styles.sheet}>
        <UnsavedWhen dirty={!saved && description.trim().length > 0} />
        <Field
          label={ISSUE_TEXT.whatsWrong}
          value={description}
          onChangeText={setDescription}
          placeholder={ISSUE_TEXT.placeholder}
          multiline
          maxLength={2000}
          error={error}
          autoFocus
        />
        <MediaSection
          target={target}
          unsaved={!saved}
          beforeCapture={() => {
            if (!issueDescriptionError(description)) return save() ? target : null;
            setError(ISSUE_TEXT.addPhotosFirst);
            return null;
          }}
        />
        <Segmented<IssueWork | "">
          label={ISSUE_TEXT.suggestedWork}
          options={issueWorkOptions(companyServices(company.settings)).map((o) => ({
            value: o.value ?? "",
            label: o.label,
          }))}
          value={work}
          onChange={setWork}
        />
        <Button title={ISSUE_TEXT.submit} onPress={report} />
      </View>
    </ModalSheet>
  );
}

/** Mounted once while signed in: tells the office about reports after they sync. */
export function IssueNotices() {
  const { user, company } = useSession();
  const userId = user?.id;
  const companyId = company?.id;
  useEffect(
    () => (userId && companyId ? watchIssueNotices(companyId, userId) : undefined),
    [companyId, userId],
  );
  return null;
}

const styles = StyleSheet.create({
  sheet: { gap: space["4"], padding: space["4"] },
});
