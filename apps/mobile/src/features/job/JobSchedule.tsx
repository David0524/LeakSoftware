import { useState } from "react";
import {
  formatSchedule,
  formatTime,
  isManagerRole,
  jobMinutes,
  localDate,
  moveJobChange,
  propertyLocation,
  seesAllJobs,
  suggestTimes,
  suggestionDates,
  type SuggestedTime,
} from "@leakbook/core";
import { useJobViews, type JobView } from "../../data/jobs";
import {
  planContext,
  routeKey,
  routesFor,
  saveJobChanges,
  useDriveTimes,
  useTeam,
} from "../../data/schedule";
import { useCompany, useSession } from "../../state/session";
import { Group, ListRow, Section, T } from "../../ui/components";
import { haptics } from "../../ui/haptics";
import { color } from "../../ui/theme";
import { MoveSheet, SuggestSheet, type MoveTarget } from "../schedule/MoveSheet";
import { jobDateError } from "../../lib/limits";

/** Repair jobs and jobs not yet started show the Schedule group (as on the website). */
export function showsJobSchedule(job: { type: string; status: string }) {
  return job.type === "repair" || job.status === "scheduled" || job.status === "unscheduled";
}

/**
 * Job › Details › Schedule (spec 5.4; the website's `JobSchedule`): the tech and time, whether the
 * time was promised, then Schedule Job / Change Schedule (the Schedule tab's Move sheet) and
 * Suggest Times. Worked out on the phone and saved through the sync layer, like the Schedule tab.
 */
export function JobSchedule({ jobId }: { jobId: string }) {
  const company = useCompany();
  const { membership, user } = useSession();
  const me = user?.id ?? "";
  const role = membership?.role;
  const manager = isManagerRole(role);
  const seesAll = seesAllJobs(role, company.settings);
  const ctx = planContext(company);
  const tz = ctx.timeZone;
  const jobs = useJobViews(company.id);
  const team = useTeam(company.id);
  const [moving, setMoving] = useState<MoveTarget | null>(null);
  const [suggesting, setSuggesting] = useState<{ list: SuggestedTime[]; note?: string } | null>(
    null,
  );
  const [result, setResult] = useState<{ message?: string; error?: string } | null>(null);
  const job = jobs.find((j) => j.id === jobId);
  const { drive } = useDriveTimes(company.id, [
    ctx.depot,
    ...jobs.filter((j) => j.scheduled_start).map((j) => propertyLocation(j.property)),
  ]);
  if (!job) return null;

  const movers = (
    seesAll ? team.filter((t) => t.status === "active") : team.filter((t) => t.user_id === me)
  ).map((t) => ({ id: t.user_id, name: t.name }));
  const techName = job.assigned_user_id
    ? (team.find((t) => t.user_id === job.assigned_user_id)?.name ?? "Teammate")
    : "Nobody yet";

  const dayJobsOf = (techId: string, d: string) =>
    (routesFor(jobs, [d], tz).routes.get(routeKey(techId, d)) ?? []).map((j) => ({
      ...j,
      property: j.property ?? null,
    }));

  function save(change: {
    updates: Parameters<typeof saveJobChanges>[1];
    message?: string;
    error?: string;
  }) {
    if (change.error) {
      setResult({ error: change.error });
      return;
    }
    try {
      saveJobChanges(company.id, change.updates);
      haptics.success();
      setResult({ message: change.message });
    } catch (e) {
      setResult({ error: e instanceof Error ? e.message : String(e) });
    }
  }

  function moveTo(j: JobView, techId: string | null, d: string | null, index: number) {
    // Years 2000 to 2100 and a real day, as the website (owner, 2026-10-20).
    const badDate = d ? jobDateError(d) : null;
    if (badDate) return setResult({ error: badDate });
    const fromDate = j.scheduled_start ? localDate(new Date(j.scheduled_start), tz) : null;
    save(
      moveJobChange(
        ctx,
        {
          job: { ...j, property: j.property ?? null },
          tech: techId,
          date: d,
          index,
          targetDay: techId && d ? dayJobsOf(techId, d) : [],
          fromDay: j.assigned_user_id && fromDate ? dayJobsOf(j.assigned_user_id, fromDate) : [],
          seesAll,
          userId: me,
        },
        drive,
      ),
    );
  }

  function suggest(j: JobView) {
    const dates = suggestionDates(ctx);
    if (dates.length === 0) {
      setResult({ error: "No working days are set (Settings › Scheduling)." });
      return;
    }
    const { routes: ahead } = routesFor(jobs, dates, tz);
    const people = team.filter((t) => t.status === "active" && (seesAll || t.user_id === me));
    const found = suggestTimes(
      ctx,
      {
        id: j.id,
        location: propertyLocation(j.property),
        durationMin: jobMinutes({ ...j, property: j.property ?? null }, ctx.settings),
      },
      dates.flatMap((d) =>
        people.map((t) => ({
          techId: t.user_id,
          techName: t.name,
          date: d,
          jobs: (ahead.get(routeKey(t.user_id, d)) ?? []).map((x) => ({
            ...x,
            property: x.property ?? null,
            label: x.customer?.name ?? "the job before",
          })),
        })),
      ),
      drive,
    );
    setSuggesting({ list: found.suggestions, note: found.note });
  }

  return (
    <Section title="Schedule">
      <Group>
        <ListRow title="Tech" detail={techName} />
        <ListRow
          title="When"
          detail={
            job.scheduled_start
              ? formatSchedule(job.scheduled_start, new Date(), tz)
              : "Not scheduled"
          }
        />
        {job.arrival_fixed ? <ListRow title="Time promised to the customer" detail="Yes" /> : null}
        <ListRow
          title={job.scheduled_start ? "Change Schedule" : "Schedule Job"}
          tone="link"
          accessibilityRole="button"
          onPress={() =>
            setMoving({
              id: job.id,
              customer: job.customer?.name ?? "Customer",
              address: "",
              from:
                job.scheduled_start && job.status !== "unscheduled"
                  ? {
                      tech: job.assigned_user_id ?? null,
                      date: localDate(new Date(job.scheduled_start), tz),
                    }
                  : null,
            })
          }
        />
        {job.status === "scheduled" || job.status === "unscheduled" ? (
          <ListRow
            title="Suggest Times"
            tone="link"
            accessibilityRole="button"
            onPress={() => suggest(job)}
          />
        ) : null}
      </Group>
      {result ? (
        <T variant="secondary" style={{ color: result.error ? color.fail : color.pass }}>
          {result.error ?? result.message}
        </T>
      ) : null}
      <MoveSheet
        job={moving}
        techs={movers}
        manager={manager}
        today={ctx.today}
        placesFor={(t, d, id) =>
          dayJobsOf(t, d)
            .filter((j) => j.id !== id)
            .map((j) => ({
              customer: j.customer?.name ?? "Customer",
              time: j.scheduled_start ? formatTime(j.scheduled_start, tz) : null,
            }))
        }
        onClose={() => setMoving(null)}
        onMove={(t, d, index) => {
          setMoving(null);
          moveTo(job, t, d, index);
        }}
      />
      <SuggestSheet
        open={suggesting != null}
        title="Suggested Times"
        suggestions={suggesting?.list ?? []}
        note={suggesting?.note}
        onClose={() => setSuggesting(null)}
        onPick={(s) => {
          setSuggesting(null);
          moveTo(job, s.techId, s.date, s.position);
        }}
      />
    </Section>
  );
}
