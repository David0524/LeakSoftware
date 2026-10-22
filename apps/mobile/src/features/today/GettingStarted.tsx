import { router } from "expo-router";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { companyServices, gettingStarted, type Company, type StartStep } from "@leakbook/core";
import { useRows } from "../../data/hooks";
import { API_URL } from "../../lib/config";
import { NATIVE_PAGES } from "../settings/SettingsIndex";
import { getServices } from "../../lib/services";
import { Card, Check, Chevron, T } from "../../ui/components";
import { color, MAX_TEXT_SCALE, minTap, space, type } from "../../ui/theme";

// Getting Started on Today (spec 5.1; the website's components/getting-started.tsx): managers'
// first steps for the shop's package, ticked off from the shop's own data, until every step is
// done or they tap Hide. Hiding is kept on the person's account (as on the website) and on the
// phone, so it stays hidden offline.

const HIDDEN_KEY = "walkthrough:getting_started_hidden";
const listeners = new Set<() => void>();

function useHidden(): [boolean, () => void] {
  const { kv, supabase } = getServices();
  const hidden = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => kv.get(HIDDEN_KEY) === "1",
  );
  // The account's own setting wins once it's known (hidden on the website).
  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      const v = data.session?.user.user_metadata?.getting_started_hidden;
      if (typeof v !== "boolean") return;
      if (v) kv.set(HIDDEN_KEY, "1");
      else kv.remove(HIDDEN_KEY);
      for (const l of listeners) l();
    });
  }, [kv, supabase]);
  return [
    hidden,
    () => {
      kv.set(HIDDEN_KEY, "1");
      for (const l of listeners) l();
      void supabase.auth.updateUser({ data: { getting_started_hidden: true } }).catch(() => {});
    },
  ];
}

/** Where a step leads in the app; anything else opens the website. */
function open(step: StartStep) {
  const href = step.href;
  if (
    href === "/jobs/new" ||
    href === "/jobs" ||
    href.startsWith("/jobs/") ||
    href === "/customers"
  ) {
    router.push(href);
    return;
  }
  // Settings pages are in the app (owner, 2026-10-19: no website links from the app).
  const page = href.startsWith("/settings/") ? href.slice("/settings/".length) : null;
  if (page !== null) {
    router.push(NATIVE_PAGES.includes(page) ? (`/settings/${page}` as never) : "/settings");
    return;
  }
  if (API_URL) void Linking.openURL(`${API_URL}${href}`);
}

export function GettingStarted({ company }: { company: Company }) {
  const [hidden, hide] = useHidden();
  const members = useRows<{ status: string }>("membership", company.id);
  const customers = useRows<{ id: string; deleted_at?: string | null }>("customer", company.id);
  const plans = useRows<{ deleted_at?: string | null }>("service_plan", company.id);
  const jobs = useRows<{
    id: string;
    type: string;
    sample?: boolean;
    bill_to_customer_id?: string | null;
    deleted_at?: string | null;
  }>("job", company.id);
  const reports = useRows<{ sent_at: string | null; job_id: string }>("report", company.id);
  const messages = useRows<{ job_id: string | null; channel: string; status: string }>(
    "message",
    company.id,
  );
  const invoices = useRows<{ sent_at: string | null }>("invoice", company.id);
  // Invites and the Stripe account aren't on the phone: asked when there's a signal.
  const [server, setServer] = useState<{ invites: number; payments: boolean }>({
    invites: 0,
    payments: false,
  });
  useEffect(() => {
    if (hidden) return;
    const { supabase } = getServices();
    void Promise.all([
      supabase
        .from("invite")
        .select("id", { count: "exact", head: true })
        .eq("company_id", company.id)
        .is("accepted_at", null)
        .is("revoked_at", null),
      supabase
        .from("stripe_account")
        .select("charges_enabled")
        .eq("company_id", company.id)
        .maybeSingle(),
    ])
      .then(([inv, stripe]) =>
        setServer({
          invites: inv.count ?? 0,
          payments: Boolean((stripe.data as { charges_enabled?: boolean } | null)?.charges_enabled),
        }),
      )
      .catch(() => {});
  }, [company.id, hidden]);

  if (hidden) return null;
  const live = <T extends { deleted_at?: string | null }>(rows: T[]) =>
    rows.filter((r) => !r.deleted_at);
  // The sample job (owner, 2026-10-22) is never counted: its job, made-up customer and report.
  const sample = jobs.find((j) => j.sample);
  const sampleLive = sample && !sample.deleted_at ? sample : null;
  const steps = gettingStarted(companyServices(company.settings), {
    people: members.filter((m) => m.status === "active").length || 1,
    openInvites: server.invites,
    hasLogo: Boolean(company.logo_path),
    paymentsReady: server.payments,
    customers: live(customers).filter((c) => c.id !== sampleLive?.bill_to_customer_id).length,
    visitPlans: live(plans).length,
    leakJobs: live(jobs).filter((j) => j.type === "detection" && !j.sample).length,
    reportsSent: reports.filter((r) => r.sent_at && r.job_id !== sample?.id).length,
    invoicesSent: invoices.filter((i) => i.sent_at).length,
    sample: sample
      ? {
          jobId: sampleLive?.id ?? null,
          done:
            !sampleLive ||
            messages.some(
              (m) => m.job_id === sample.id && m.channel === "email" && m.status === "sent",
            ),
        }
      : null,
  });
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;

  return (
    <Card padding={0} style={{ overflow: "hidden" }}>
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <T variant="cardTitle" style={{ marginTop: space["4"] }}>
            Getting Started
          </T>
          <T variant="secondary" muted>
            {done} of {steps.length} done
          </T>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Hide Getting Started"
          onPress={hide}
          style={styles.hide}
        >
          <Text style={[type.body, { color: color.link }]} maxFontSizeMultiplier={MAX_TEXT_SCALE}>
            Hide
          </Text>
        </Pressable>
      </View>
      <View
        accessibilityRole="progressbar"
        accessibilityLabel="Getting Started progress"
        accessibilityValue={{ min: 0, max: steps.length, now: done }}
        style={[styles.track, { backgroundColor: color.fill }]}
      >
        <View
          style={[
            styles.bar,
            { backgroundColor: color.pass, width: `${(done / steps.length) * 100}%` },
          ]}
        />
      </View>
      <View style={{ marginTop: space["3"] }}>
        {steps.map((s, i) => (
          <Pressable
            key={s.id}
            accessibilityRole="button"
            accessibilityLabel={`${s.label}${s.done ? " (done)" : ""}`}
            onPress={() => open(s)}
            android_ripple={{ color: color.ripple }}
            style={({ pressed }) => [
              styles.step,
              i > 0 && {
                borderTopWidth: StyleSheet.hairlineWidth,
                borderTopColor: color.separator,
              },
              pressed && { backgroundColor: color.rowPressed },
            ]}
          >
            <Check done={s.done} />
            <View style={{ flex: 1 }}>
              <T muted={s.done} style={s.done ? { textDecorationLine: "line-through" } : undefined}>
                {s.label}
              </T>
              {s.done ? null : (
                <T variant="secondary" muted>
                  {s.detail}
                </T>
              )}
            </View>
            <Chevron />
          </Pressable>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "flex-start", paddingHorizontal: 20, gap: 12 },
  hide: {
    minHeight: minTap,
    paddingHorizontal: 12,
    marginRight: -8,
    marginTop: space["3"],
    justifyContent: "center",
  },
  track: { height: 6, borderRadius: 3, marginHorizontal: 20, marginTop: 8, overflow: "hidden" },
  bar: { height: 6, borderRadius: 3 },
  step: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
});
