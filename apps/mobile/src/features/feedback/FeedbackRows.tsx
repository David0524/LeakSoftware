import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import {
  FEEDBACK_WORDS,
  feedbackSubtitle,
  friendlyError,
  shortDate,
  type FeedbackRow,
} from "@leakbook/core";
import { setFeedbackStatus } from "../../data/feedback";
import { Button, FieldGroup, FieldRow, Group, ListRow, Notice, Section } from "../../ui/components";
import { ModalSheet } from "../../ui/ModalSheet";
import { WebIcon } from "../../ui/WebIcon";
import { color, shape, space } from "../../ui/theme";

// Customer Feedback rows and the complaint sheet (owner's competitor notes, 2026-11-16), as the
// website's (apps/web/src/components/feedback-rows.tsx): shared by More › Customer Feedback and a
// customer's page.

function Thumb({ row }: { row: FeedbackRow }) {
  const up = row.rating === "up";
  const open = row.status === "open";
  const tone = up ? color.pass : open ? color.fail : color.textMuted;
  return (
    <View
      style={[styles.thumb, { backgroundColor: up || open ? color.iconTint : color.fill }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <WebIcon name={up ? "thumbsUp" : "thumbsDown"} size={20} color={tone} />
    </View>
  );
}

/** The answers as one inset grouped list; a complaint opens its sheet. */
export function FeedbackRows({
  rows,
  timeZone,
  onOpen,
  showCustomer = true,
}: {
  rows: FeedbackRow[];
  timeZone: string;
  onOpen: (row: FeedbackRow) => void;
  showCustomer?: boolean;
}) {
  const now = new Date();
  return (
    <Group>
      {rows.map((r) => {
        const when = shortDate(r.created_at, now, timeZone);
        const sub = feedbackSubtitle(r, when);
        const said = r.rating === "up" ? null : r.comment || FEEDBACK_WORDS.noComment;
        return (
          <ListRow
            key={r.id}
            leading={<Thumb row={r} />}
            title={showCustomer ? r.customer_name || "A customer" : sub}
            subtitle={[said, showCustomer ? sub : null].filter(Boolean).join("\n")}
            onPress={r.rating === "down" ? () => onOpen(r) : undefined}
            chevron={r.rating === "down"}
          />
        );
      })}
    </Group>
  );
}

/** One complaint: what they said, links to the customer and job, Close or Reopen with a note. */
export function FeedbackSheet({
  row,
  timeZone,
  onClose,
  onChanged,
}: {
  row: FeedbackRow | null;
  timeZone: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  return (
    <ModalSheet visible={!!row} onClose={onClose} title="Complaint" cancel="Close">
      {row ? (
        <ComplaintBody
          key={row.id}
          row={row}
          timeZone={timeZone}
          onClose={onClose}
          onChanged={onChanged}
        />
      ) : null}
    </ModalSheet>
  );
}

function ComplaintBody({
  row,
  timeZone,
  onClose,
  onChanged,
}: {
  row: FeedbackRow;
  timeZone: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [note, setNote] = useState(row.office_note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = row.status === "open";
  const now = new Date();

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await setFeedbackStatus(row.id, open ? "closed" : "open", note.trim());
      onChanged();
      onClose();
    } catch (e) {
      setError(friendlyError(e instanceof Error ? e.message : String(e)));
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.body}>
      <Section title="What they said">
        <Group>
          <ListRow title={row.comment || FEEDBACK_WORDS.noComment} />
        </Group>
      </Section>
      <Section title="Details">
        <Group>
          <ListRow title="Received" detail={shortDate(row.created_at, now, timeZone)} />
          {row.customer_id ? (
            <ListRow
              title="Customer"
              detail={row.customer_name || "Open"}
              onPress={() => {
                onClose();
                router.push(`/customers/${row.customer_id}` as never);
              }}
            />
          ) : null}
          {row.job_id ? (
            <ListRow
              title="Job"
              detail={row.job_number ? `#${row.job_number}` : "Open"}
              onPress={() => {
                onClose();
                router.push(`/jobs/${row.job_id}` as never);
              }}
            />
          ) : null}
          {row.closed_at ? (
            <ListRow
              title="Closed"
              detail={`${shortDate(row.closed_at, now, timeZone)}${row.closed_by_name ? ` by ${row.closed_by_name}` : ""}`}
            />
          ) : null}
        </Group>
      </Section>
      <FieldGroup labelWidth={72}>
        <FieldRow
          label={FEEDBACK_WORDS.noteLabel}
          value={note}
          onChangeText={setNote}
          multiline
          maxLength={2000}
          placeholder={FEEDBACK_WORDS.notePlaceholder}
        />
      </FieldGroup>
      {error ? <Notice tone="error">{error}</Notice> : null}
      <Button
        title={open ? FEEDBACK_WORDS.close : FEEDBACK_WORDS.reopen}
        kind={open ? "primary" : "secondary"}
        wide
        loading={saving}
        disabled={saving}
        onPress={() => void save()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  thumb: {
    width: 36,
    height: 36,
    borderRadius: shape.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  body: { gap: space["4"] },
});
