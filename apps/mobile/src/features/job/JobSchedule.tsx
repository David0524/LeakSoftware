import { useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import {
  JOB_LOCKS,
  JOB_LOCK_HELP,
  JOB_LOCK_LABELS,
  canUnschedule,
  formatSchedule,
  formatTime,
  isManagerRole,
  jobLock,
  jobMinutes,
  jobReschedulable,
  localDate,
  moveJobChange,
  propertyLocation,
  seesAllJobs,
  startFor,
  suggestTimes,
  suggestionDates,
  type JobLock,
  type SuggestedTime,
  friendlyError,
} from "@leakbook/core";
import { useJobViews, type JobView } from "../../data/jobs";
import {
  planContext,
  routeKey,
  routesFor,
  saveJobChanges,
  saveJobLock,
  useDriveTimes,
  useTeam,
} from "../../data/schedule";
import { useCompany, useSession } from "../../state/session";
import { Button, Group, ListRow, Section, Segmented, T } from "../../ui/components";
import { haptics } from "../../ui/haptics";
import { ModalSheet } from "../../ui/ModalSheet";
import { color, space } from "../../ui/theme";
import { TechValue } from "../../ui/TechDot";
import { WebIcon } from "../../ui/WebIcon";
import { MoveSheet, SuggestSheet, type MoveTarget } from "../schedule/MoveSheet";
import { jobDateError } from "../../lib/limits";
import { usePlanMove } from "../schedule/planMove";

/**
 * The Schedule group shows until a job's work is done (owner, 2026-10-20: "You should be able
 * to reschedule a job from the jobs page after creating it"), started jobs included; repairs
 * always, as on the website (core jobReschedulable).
 */
export function showsJobSchedule(job: { type: string; status: string }) {
  return jobReschedulable(job);
}

/**
 * Move… for a job, as Job › Details › Schedule's Change Schedule does it (the Schedule tab's
 * Move sheet, core moveJobChange, saved through the sync layer). The Jobs list's Move… uses it
 * too (gestures spec section 12). `onResult` gets what the move says, or why it couldn't.
 */
export interface MoveResult {
  message?: string;
  error?: string;
  /** Puts a plan visit's move back (Change Schedule or Just This Visit). */
  undo?: () => void;
}

export function useJobMove(onResult: (r: MoveResult) => void) {
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
  const { drive } = useDriveTimes(company.id, [
    ctx.depot,
    // Where techs who start from home start (owner, 2026-10-21).
    ...(ctx.starts ?? []).map((s) => startFor(s.user_id, ctx.starts, ctx.depot).at),
    ...jobs.filter((j) => j.scheduled_start).map((j) => propertyLocation(j.property)),
  ]);
  const movers = (
    seesAll ? team.filter((t) => t.status === "active") : team.filter((t) => t.user_id === me)
  ).map((t) => ({ id: t.user_id, name: t.name, color: t.color }));

  const dayJobsOf = (techId: string, d: string) =>
    (routesFor(jobs, [d], tz).routes.get(routeKey(techId, d)) ?? []).map((j) => ({
      ...j,
      property: j.property ?? null,
    }));

  function save(
    change: {
      updates: Parameters<typeof saveJobChanges>[1];
      message?: string;
      error?: string;
      confirm?: { title: string; message: string; action: string };
    },
    asked = false,
  ) {
    // A shared job running into its second tech's day asks first (owner, 2026-10-24).
    const ask = change.confirm;
    if (ask && !change.error && !asked) {
      Alert.alert(ask.title, ask.message, [
        { text: "Cancel", style: "cancel" },
        { text: ask.action, onPress: () => save(change, true) },
      ]);
      return;
    }
    if (change.error) {
      onResult({ error: change.error });
      return;
    }
    try {
      saveJobChanges(company.id, change.updates);
      haptics.success();
      onResult({ message: change.message });
    } catch (e) {
      onResult({ error: friendlyError(e) });
    }
  }

  const change = (j: JobView, techId: string | null, d: string | null, index: number) => {
    const fromDate = j.scheduled_start ? localDate(new Date(j.scheduled_start), tz) : null;
    return moveJobChange(
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
        // A shared job's second tech's day (owners and admins), to ask before running into it.
        partnerDay: manager && j.second_tech_id && d ? dayJobsOf(j.second_tech_id, d) : null,
        names: Object.fromEntries(team.map((t) => [t.user_id, t.name])),
      },
      drive,
    );
  };

  // A plan's visit to another day or tech asks first (team and week spec section 5).
  const planMove = usePlanMove({
    companyId: company.id,
    today: ctx.today,
    timeZone: tz,
    team,
    show: (n) =>
      onResult(n.tone === "error" ? { error: n.message } : { message: n.message, undo: n.undo }),
  });

  function moveTo(j: JobView, techId: string | null, d: string | null, index: number) {
    // Years 2000 to 2100 and a real day, as the website (owner, 2026-10-20).
    const badDate = d ? jobDateError(d) : null;
    if (badDate) return onResult({ error: badDate });
    planMove.move({
      job: j,
      to: { tech: techId, date: d },
      move: () => save(change(j, techId, d, index)),
      changes: () => change(j, techId, d, index),
      before: (id) =>
        jobs.find((x) => x.id === id) as unknown as Record<string, unknown> | undefined,
    });
  }

  function open(job: JobView) {
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
      unschedulable: canUnschedule(job.status),
    });
  }

  const element = (
    <>
      {planMove.element}
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
          const job = jobs.find((j) => j.id === moving?.id);
          setMoving(null);
          if (job) moveTo(job, t, d, index);
        }}
      />
    </>
  );

  return { open, moveTo, element, ctx, jobs, team, drive, seesAll, me };
}

/**
 * Job › Details › Schedule (spec 5.4; the website's `JobSchedule`): the tech and time, its lock
 * (owner, 2026-10-20: "locks for jobs whether that's day, time, or both"), then Schedule Job /
 * Change Schedule (the Schedule tab's Move sheet) and Suggest Times. Worked out on the phone and saved through the sync layer, like the Schedule tab.
 */
export function JobSchedule({ jobId }: { jobId: string }) {
  const company = useCompany();
  const [suggesting, setSuggesting] = useState<{ list: SuggestedTime[]; note?: string } | null>(
    null,
  );
  const [result, setResult] = useState<MoveResult | null>(null);
  const [locking, setLocking] = useState<JobLock | null>(null);
  const mover = useJobMove(setResult);
  const { ctx, jobs, team, drive, seesAll, me, moveTo } = mover;
  const tz = ctx.timeZone;
  const job = jobs.find((j) => j.id === jobId);
  if (!job) return null;

  const lock = jobLock(job);
  const techName = job.assigned_user_id
    ? (team.find((t) => t.user_id === job.assigned_user_id)?.name ?? "Teammate")
    : "Nobody yet";

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
        <ListRow
          title="Tech"
          detail={
            job.assigned_user_id ? (
              <TechValue
                name={techName}
                tech={team.find((t) => t.user_id === job.assigned_user_id)?.color}
              />
            ) : (
              techName
            )
          }
        />
        <ListRow
          title="When"
          detail={
            job.scheduled_start
              ? formatSchedule(job.scheduled_start, new Date(), tz)
              : "Not scheduled"
          }
        />
        {/* The lock: a padlock and what it holds; tapping it opens the Lock picker. */}
        <ListRow
          title="Lock"
          accessibilityLabel={`Lock, ${JOB_LOCK_LABELS[lock].tag ?? "None"}`}
          accessibilityHint="Changes what planning may move"
          onPress={() => setLocking(lock)}
          detail={
            JOB_LOCK_LABELS[lock].tag ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <WebIcon name="lock" size={16} color={color.textMuted} strokeWidth={2} />
                <T muted>{JOB_LOCK_LABELS[lock].tag}</T>
              </View>
            ) : (
              "None"
            )
          }
        />
        <ListRow
          title={job.scheduled_start ? "Change Schedule" : "Schedule Job"}
          tone="link"
          accessibilityRole="button"
          onPress={() => mover.open(job)}
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
        <View style={styles.result}>
          <T variant="secondary" style={{ flex: 1, color: result.error ? color.fail : color.pass }}>
            {result.error ?? result.message}
          </T>
          {result.undo ? (
            <Button
              kind="quiet"
              title="Undo"
              onPress={() => {
                const undo = result.undo;
                setResult(null);
                undo?.();
              }}
            />
          ) : null}
        </View>
      ) : null}
      {mover.element}
      {/* Locks (owner, 2026-10-20): what Optimize and Plan Week leave alone. */}
      <ModalSheet visible={locking != null} onClose={() => setLocking(null)} title="Lock">
        <View style={{ gap: space["2"] }}>
          <Segmented
            accessibilityLabel="Lock"
            options={JOB_LOCKS.map((l) => ({ value: l, label: JOB_LOCK_LABELS[l].segment }))}
            value={locking ?? lock}
            onChange={setLocking}
          />
          <View accessibilityLiveRegion="polite">
            <T variant="secondary" muted>
              {JOB_LOCK_HELP[locking ?? lock]}
            </T>
          </View>
        </View>
        <Button
          title="Save"
          wide
          onPress={() => {
            const next = locking ?? lock;
            setLocking(null);
            if (next === lock) return;
            try {
              saveJobLock(company.id, job.id, next);
              haptics.success();
            } catch (e) {
              setResult({ error: friendlyError(e) });
            }
          }}
        />
      </ModalSheet>
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

const styles = StyleSheet.create({
  result: { flexDirection: "row", alignItems: "center", gap: space["2"] },
});
