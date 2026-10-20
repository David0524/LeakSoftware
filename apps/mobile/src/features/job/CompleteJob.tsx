import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import {
  FINISH_PHOTO_MESSAGE,
  checklistTally,
  completeJobBlocker,
  markCompleteValues,
  visitReportMode,
  type Job,
} from "@leakbook/core";
import { useJobInspection } from "../../data/inspection";
import { useJobMedia } from "../../data/media";
import { getServices } from "../../lib/services";
import { takeStopAction } from "../../lib/liveStop";
import { queueAutoVisitReport } from "../../lib/visitReports";
import { useCompany } from "../../state/session";
import { Button, Notice } from "../../ui/components";
import { haptics } from "../../ui/haptics";
import { confirmAlert } from "../../ui/confirm";
import { color, face, MAX_TEXT_SCALE, space, type } from "../../ui/theme";
import { FinishPhotoNotice } from "../media/FinishPhoto";

// Complete Job (owner, 2026-10-19: "Let's add a complete job button"): a maintenance visit ends
// with one tap, from Scheduled or In progress, on its page and on Today. When the shop wants
// the checklist answered or a pool photo first (Settings › Team › Completing a job), it says
// what's missing, as the website's requireCompletable. The phone's own rows count, so a photo
// still waiting to upload already counts.

/** What stops Complete Job for this job on this phone, or null. */
export function useCompleteJobBlocker(job: Pick<Job, "id" | "company_id">): string | null {
  const company = useCompany();
  const insp = useJobInspection(job.company_id, job.id);
  const media = useJobMedia(job.company_id, job.id);
  return completeJobBlocker(company.settings, {
    checklistToDo: checklistTally(insp.components, insp.results).pending,
    photos: media.filter(
      (m) => m.kind === "photo" && !(m as { deleted_at?: string | null }).deleted_at,
    ).length,
  });
}

/** What's missing: the photo one with Take Photo, as the finish-photo check. */
export function CompleteBlockedNotice({ jobId, message }: { jobId: string; message: string }) {
  return message === FINISH_PHOTO_MESSAGE ? (
    <FinishPhotoNotice jobId={jobId} />
  ) : (
    <Notice tone="warning">{message}</Notice>
  );
}

/**
 * Before a maintenance visit is completed in a shop whose visit reports are Automatic, ask
 * (owner, 2026-10-20: "maybe when you press complete it prompts you with 'are you ready to
 * send'"): completing sends the report. Shops set to By Hand or Off complete in one tap.
 */
export function confirmCompleteVisit(
  job: Pick<Job, "type">,
  customer: string | null | undefined,
  settings: unknown,
  complete: () => void,
) {
  if (job.type !== "maintenance" || visitReportMode(settings) !== "auto") return complete();
  confirmAlert({
    title: "Ready to send the visit report?",
    message: `Completing this visit sends its report to ${customer?.trim() || "the customer"}.`,
    confirm: "Complete and Send",
    onConfirm: complete,
  });
}

/**
 * Mark Complete on a Today stop (owner, 2026-10-19: every stop on the day's route), as the
 * website's TodayComplete. A maintenance visit is completed (with the shop's checklist and
 * photo rules: blocked, it says why with Open Job); a leak or repair job keeps its pipeline and
 * its stop is done for the day (job.stop_done_on), with Mark Not Complete to undo it.
 */
export function TodayComplete({
  job,
  customer,
  customerName,
  day,
  done,
  trigger,
}: {
  job: Job;
  /** The customer's name, or "this stop". */
  customer: string;
  /** The customer's name for the send question, when there is one. */
  customerName?: string | null;
  /** The shop's local day of the route. */
  day: string;
  done: boolean;
  /** Changes when the current-stop notification's Mark Complete asks for this stop. */
  trigger?: number;
}) {
  const company = useCompany();
  const blocker = useCompleteJobBlocker(job);
  const [asked, setAsked] = useState(false);
  // Done only for the day (a leak or repair stop), so it can be undone here.
  const undoable = job.type !== "maintenance" && job.stop_done_on === day;
  const label = done ? "Mark Not Complete" : "Mark Complete";
  function press() {
    const sync = getServices().sync;
    if (done) {
      sync.write("job", job.id, job.company_id, { stop_done_on: null });
      haptics.light();
      return;
    }
    if (job.type === "maintenance" && blocker) return setAsked(true);
    setAsked(false);
    const complete = () => {
      sync.write("job", job.id, job.company_id, markCompleteValues(job, day));
      haptics.success();
      if (job.type === "maintenance") queueAutoVisitReport(job, company.settings);
    };
    // Asks first when completing sends the visit report (Automatic shops).
    confirmCompleteVisit(job, customerName, company.settings, complete);
  }
  // The notification's Mark Complete opens Today on this stop and does it here.
  const latest = useRef(press);
  useEffect(() => {
    latest.current = press;
  });
  useEffect(() => {
    if (trigger && takeStopAction(trigger) && !done) latest.current();
    // Only a new request presses; `done` is read when it arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger]);

  if (done && !undoable) return null;
  return (
    <View style={{ gap: space["1"] }}>
      <Button
        title={label}
        kind={done ? "secondary" : "primary"}
        accessibilityLabel={`${label} for ${customer}`}
        onPress={press}
      />
      {asked && blocker && !done ? (
        <Text
          accessibilityRole="alert"
          style={[type.secondary, { color: color.fail }]}
          maxFontSizeMultiplier={MAX_TEXT_SCALE}
        >
          {blocker}{" "}
          <Text
            accessibilityRole="link"
            onPress={() => router.push(`/jobs/${job.id}`)}
            style={[face.semiBold, { color: color.link, textDecorationLine: "underline" }]}
          >
            Open Job
          </Text>
        </Text>
      ) : null}
    </View>
  );
}
