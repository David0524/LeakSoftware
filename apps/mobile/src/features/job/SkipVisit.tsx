import { useState } from "react";
import { Linking, StyleSheet, TextInput, View } from "react-native";
import {
  SKIP_BANNER,
  SKIP_DISMISS_LABEL,
  SKIP_NOTE_MAX,
  SKIP_REASON_REQUIRED,
  SKIP_RESCHEDULE_LABEL,
  SKIP_TEXT_LABEL,
  friendlyError,
  pickableSkipReasons,
  skipActions,
  skipCustomerText,
  skipSummary,
  skipValues,
  formatSchedule,
  type Customer,
  type Job,
  type SkipReason,
} from "@leakbook/core";
import { useConfig } from "../../data/config";
import { saveCapture } from "../../data/media";
import {
  askLocationOnce,
  captureWithCamera,
  currentPosition,
  type CapturedFile,
} from "../../lib/media";
import { smsUrl } from "../../lib/heroMessage";
import { announceUndoable } from "../../lib/removedBanner";
import { requestReschedule } from "../../lib/rescheduleRequest";
import { queueSkipNotice } from "../../lib/skipNotices";
import { useCompany, useSession } from "../../state/session";
import { Button, Group, ListRow, Notice, Section, T } from "../../ui/components";
import { chooseAction } from "../../ui/confirm";
import { haptics } from "../../ui/haptics";
import { Icon } from "../../ui/Icon";
import { ModalSheet } from "../../ui/ModalSheet";
import { color, face, shape, space } from "../../ui/theme";

/**
 * Skip Visit (owner, 2026-11-16; docs/design/2026-11-16-skip-visit.md): a sheet to pick why
 * (required, from Settings › Skip Reasons), add a note and a photo, then Skip. Written on the
 * phone first (row and outbox together), so it works offline. The visit shows as skipped at
 * once, with Undo for five seconds; a customer with a phone number is offered Text the Customer
 * next, in the phone's own Messages (as On My Way does).
 */
export function SkipVisitSheet({
  job,
  customer,
  visible,
  onClose,
}: {
  job: Job;
  customer: Customer | undefined;
  visible: boolean;
  onClose: () => void;
}) {
  const company = useCompany();
  const { services, user } = useSession();
  const reasons = pickableSkipReasons(useConfig<SkipReason>("skip_reason", company.id));
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [photos, setPhotos] = useState<CapturedFile[]>([]);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setReason("");
    setNote("");
    setPhotos([]);
    setError(null);
  }
  function close() {
    onClose();
    reset();
  }
  async function addPhoto() {
    try {
      await askLocationOnce();
      const file = await captureWithCamera("photo");
      if (file) setPhotos((p) => [...p, file]);
    } catch (e) {
      setError(friendlyError(e));
    }
  }
  function skip() {
    if (!reason) {
      setError(SKIP_REASON_REQUIRED);
      return;
    }
    const before = { status: job.status, started_at: job.started_at };
    const { sync } = services;
    sync.write(
      "job",
      job.id,
      company.id,
      skipValues({ reason, note, at: new Date().toISOString() }),
    );
    // The photos are the visit's own, saved the way every capture is (row, file and upload).
    for (const file of photos)
      void saveCapture(company.id, { jobId: job.id }, file, currentPosition()).catch(() => {});
    queueSkipNotice(job.id);
    haptics.success();
    // Undo puts it back where it was: on its time, or waiting for one.
    announceUndoable(SKIP_BANNER, () =>
      sync.write("job", job.id, company.id, {
        status:
          job.scheduled_start && before.status !== "unscheduled" ? "scheduled" : "unscheduled",
      }),
    );
    const phone = customer?.phone;
    const chosen = reason;
    close();
    if (phone) {
      const tech =
        services.sync
          .team()
          .find((t) => t.id === user?.id)
          ?.full_name?.trim() || "your technician";
      const body = skipCustomerText({
        customer: customer?.name ?? null,
        tech,
        shop: company.name,
        reason: chosen,
      });
      chooseAction({
        title: `${SKIP_TEXT_LABEL}?`,
        message: body,
        actions: [
          { label: SKIP_TEXT_LABEL, onPress: () => void Linking.openURL(smsUrl(phone, body)) },
        ],
        cancel: "Not Now",
      });
    }
  }

  return (
    <ModalSheet
      visible={visible}
      onClose={close}
      title="Skip Visit"
      done={{ label: "Skip", onPress: skip }}
    >
      <Section title="Reason">
        <Group>
          {reasons.map((r) => (
            <ListRow
              key={r.id}
              title={r.label}
              accessibilityRole="button"
              onPress={() => {
                setReason(r.label);
                setError(null);
              }}
              trailing={
                reason === r.label ? (
                  <Icon name="checkmark" size={18} color={color.primary} />
                ) : null
              }
              chevron={false}
            />
          ))}
        </Group>
      </Section>
      <Section title="Note">
        <TextInput
          value={note}
          onChangeText={(v) => setNote(v.slice(0, SKIP_NOTE_MAX))}
          multiline
          placeholder="Optional"
          placeholderTextColor={color.placeholder}
          accessibilityLabel="Note"
          style={[
            styles.note,
            { color: color.text, borderColor: color.controlBorder, backgroundColor: color.surface },
          ]}
        />
      </Section>
      <View style={styles.photo}>
        <Button title="Add Photo" kind="secondary" icon="camera" onPress={addPhoto} />
        {photos.length ? (
          <T variant="secondary" muted>
            {photos.length === 1 ? "1 photo" : `${photos.length} photos`} will be added to the
            visit.
          </T>
        ) : null}
      </View>
      {error ? <Notice tone="error">{error}</Notice> : null}
    </ModalSheet>
  );
}

/**
 * A skipped visit at the top of Details: why, who and when, and what the office does next
 * (owners and admins: Reschedule opens the schedule sheet, Dismiss keeps it skipped and marks it
 * handled). Undo Skip is the job's own button.
 */
export function SkippedCard({
  job,
  by,
  photos,
  isManager,
  onDismiss,
}: {
  job: Job;
  by: string | null;
  photos: number;
  isManager: boolean;
  onDismiss: () => void;
}) {
  const company = useCompany();
  const actions = skipActions(job, isManager);
  return (
    <Section title="Skipped">
      <Group>
        <ListRow title="Reason" detail={job.skip_reason ?? "No reason"} />
        {job.skip_note ? <ListRow title="Note" subtitle={<T>{job.skip_note}</T>} /> : null}
        <ListRow
          title="Skipped"
          detail={skipSummary(
            {},
            by ?? "Sundeck Pro",
            job.skipped_at ? formatSchedule(job.skipped_at, new Date(), company.timezone) : null,
          )}
        />
        <ListRow title="Photos" detail={String(photos)} />
        {job.skip_handled_at ? (
          <ListRow
            title="Dismissed"
            detail={formatSchedule(job.skip_handled_at, new Date(), company.timezone)}
          />
        ) : null}
      </Group>
      {actions.reschedule || actions.dismiss ? (
        <View style={styles.actions}>
          {actions.reschedule ? (
            <Button title={SKIP_RESCHEDULE_LABEL} onPress={() => requestReschedule(job.id)} />
          ) : null}
          {actions.dismiss ? (
            <Button title={SKIP_DISMISS_LABEL} kind="secondary" onPress={onDismiss} />
          ) : null}
        </View>
      ) : null}
    </Section>
  );
}

const styles = StyleSheet.create({
  note: {
    minHeight: 96,
    borderWidth: 1,
    borderRadius: shape.field,
    paddingHorizontal: space["3"],
    paddingVertical: space["2"],
    textAlignVertical: "top",
    ...face.regular,
    fontSize: 17,
  },
  photo: { gap: space["2"], alignItems: "flex-start" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space["3"], marginTop: space["3"] },
});
