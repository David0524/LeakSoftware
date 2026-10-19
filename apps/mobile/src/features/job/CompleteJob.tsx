import { router } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { FINISH_PHOTO_MESSAGE, checklistTally, completeJobBlocker, type Job } from "@leakbook/core";
import { useJobInspection } from "../../data/inspection";
import { useJobMedia } from "../../data/media";
import { getServices } from "../../lib/services";
import { useCompany } from "../../state/session";
import { Button, Notice } from "../../ui/components";
import { haptics } from "../../ui/haptics";
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

/** Completes the job through sync. */
export function completeJob(job: Pick<Job, "id" | "company_id">) {
  getServices().sync.write("job", job.id, job.company_id, { status: "done" });
  haptics.success();
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
 * Complete Job on a Today stop (owner, 2026-10-19: "there should be a way to mark that you're
 * onto the next job"): a secondary pill under the card's lines. Blocked, it says why with Open
 * Job.
 */
export function TodayComplete({ job, customer }: { job: Job; customer: string }) {
  const blocker = useCompleteJobBlocker(job);
  const [asked, setAsked] = useState(false);
  return (
    <View style={{ gap: space["1"], marginTop: space["2"] }}>
      <Button
        title="Complete Job"
        kind="secondary"
        accessibilityLabel={`Complete Job for ${customer}`}
        onPress={() => {
          if (blocker) return setAsked(true);
          setAsked(false);
          completeJob(job);
        }}
      />
      {asked && blocker ? (
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

/** The full-width Complete Job at the end of a visit's Checklist. */
export function ChecklistComplete({
  blocker,
  asked,
  onPress,
  jobId,
}: {
  blocker: string | null;
  asked: boolean;
  onPress: () => void;
  jobId: string;
}) {
  return (
    <View style={{ gap: space["2"], marginTop: space["2"] }}>
      <Button title="Complete Job" wide onPress={onPress} />
      {asked && blocker ? <CompleteBlockedNotice jobId={jobId} message={blocker} /> : null}
    </View>
  );
}
