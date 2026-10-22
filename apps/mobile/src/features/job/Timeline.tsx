import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  formatSchedule,
  isManagerRole,
  timeline,
  type AuditEntry,
  type TestType,
  type TimelineEvent,
} from "@leakbook/core";
import { useJobRows, useRows } from "../../data/hooks";
import { useJobInspection } from "../../data/inspection";
import { getServices } from "../../lib/services";
import { useCompany, useSession } from "../../state/session";
import { Section, T } from "../../ui/components";
import { color, MAX_TEXT_SCALE, minTap, shape, space, type } from "../../ui/theme";
import { SkeletonLines } from "../../ui/Skeleton";

// Job › Details › Timeline (spec 5.4, managers): who changed what on the job, newest first,
// from the server's audit log (owners and admins only; RLS gives techs nothing). The audit log
// isn't synced, so this needs a signal; offline it says so.

const SHOWN = 3;

export function JobTimeline({ jobId }: { jobId: string }) {
  const company = useCompany();
  const { membership } = useSession();
  const manager = isManagerRole(membership?.role);
  const inspection = useJobInspection(company.id, jobId);
  const media = useJobRows<{ id: string }>("media", company.id, jobId);
  const testTypes = useRows<TestType>("test_type", company.id);
  const [rows, setRows] = useState<AuditEntry[] | null | "offline">(null);
  const [open, setOpen] = useState(false);

  const ids = useMemo(
    () => [
      jobId,
      ...inspection.components.map((c) => c.id),
      ...inspection.results.map((r) => r.id),
      ...inspection.tests.map((t) => t.id),
      ...inspection.findings.map((f) => f.id),
      ...media.map((m) => m.id),
    ],
    [jobId, inspection, media],
  );
  const key = ids.join(",");

  useEffect(() => {
    if (!manager) return;
    let live = true;
    void getServices()
      .supabase.from("audit_log")
      .select("user_id, table_name, row_id, field, old_value, new_value, created_at")
      .eq("company_id", company.id)
      .in("row_id", key.split(","))
      .order("created_at", { ascending: false })
      .limit(1000)
      .then(
        ({ data, error }) => {
          if (live) setRows(error ? "offline" : ((data ?? []) as AuditEntry[]));
        },
        () => live && setRows("offline"),
      );
    return () => {
      live = false;
    };
  }, [manager, company.id, key]);

  if (!manager) return null;

  const label = (table: string, rowId: string) => {
    if (table === "job_component") return inspection.componentById.get(rowId)?.label;
    if (table === "checklist_item_result") {
      const r = inspection.results.find((x) => x.id === rowId);
      return r ? inspection.componentById.get(r.job_component_id)?.label : undefined;
    }
    if (table === "test_result") {
      const t = inspection.tests.find((x) => x.id === rowId);
      return t ? testTypes.find((tt) => tt.id === t.test_type_id)?.name : undefined;
    }
    if (table === "finding") return inspection.findings.find((f) => f.id === rowId)?.title;
    return undefined;
  };
  const team = getServices().sync.team();
  const who = (e: TimelineEvent) =>
    e.userId
      ? (team.find((t) => t.id === e.userId)?.full_name ??
        team.find((t) => t.id === e.userId)?.email ??
        "Teammate")
      : "System";

  let body;
  if (rows === null) body = <SkeletonLines count={3} label="Loading the timeline" />;
  else if (rows === "offline") body = <T muted>The timeline shows when you’re online.</T>;
  else {
    const events = timeline(rows, label);
    if (events.length === 0) body = <T muted>No changes recorded yet.</T>;
    else {
      const now = new Date();
      const line = (e: TimelineEvent, i: number) => (
        <T key={i} variant="secondary">
          {e.text}
          <Text style={{ color: color.textMuted }}>
            {` · ${who(e)} · ${formatSchedule(e.at, now, company.timezone)}`}
          </Text>
        </T>
      );
      const rest = events.slice(SHOWN, 200);
      body = (
        <>
          {events.slice(0, SHOWN).map(line)}
          {open ? rest.map((e, i) => line(e, i + SHOWN)) : null}
          {rest.length ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setOpen(!open)}
              style={styles.more}
            >
              <Text
                style={[type.body, { color: color.link }]}
                maxFontSizeMultiplier={MAX_TEXT_SCALE}
              >
                {open ? "Show Less" : `Show ${rest.length} More`}
              </Text>
            </Pressable>
          ) : null}
        </>
      );
    }
  }
  return (
    <Section title="Timeline">
      <View style={[styles.block, { backgroundColor: color.surface }]}>{body}</View>
    </Section>
  );
}

const styles = StyleSheet.create({
  block: {
    borderRadius: shape.card,
    paddingHorizontal: space["4"],
    paddingVertical: space["3"],
    gap: space["1"],
  },
  more: { minHeight: minTap, justifyContent: "center", alignSelf: "flex-start" },
});
