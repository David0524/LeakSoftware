import { useMemo, type RefObject } from "react";
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import {
  NEW_QUOTE_LABEL,
  wrapUp,
  writeDraftIntro,
  type Customer,
  type Job,
  type WrapUp,
  type WrapUpRow,
  type WrapUpStep,
} from "@leakbook/core";
import { useRows } from "../../data/hooks";
import { useJobInvoices } from "../../data/invoices";
import { useJobQuotes, startQuote } from "../../data/quotes";
import { useJobReports, useJobSignatures } from "../../data/reports";
import { useCompany, useSession } from "../../state/session";
import { Button, Card, Group, ListRow, T } from "../../ui/components";
import { Icon } from "../../ui/Icon";
import { ModalSheet } from "../../ui/ModalSheet";
import { haptics } from "../../ui/haptics";
import { color, face, space, tabular } from "../../ui/theme";
import { InvoiceSection } from "../invoice/InvoiceSection";
import { QuoteTab } from "../quote/QuoteTab";
import { ReportTab, Signatures, type ReportControls } from "../report/ReportTab";

// Wrap-Up as a finish list (owner, 2026-10-22, option A; docs/design/2026-10-22-wrap-up.md):
// "Maria Alvarez · 2 of 4 done", a row per step with its state, each opening that step in a
// sheet, New Quote under the list, and the Next Step bar naming the next step. The same as the
// website's components/wrap-up.tsx and the iPhone's WrapUpSection.

/** A step's sheet: which step, and the quote or invoice it's about ("draft": New Quote's). */
export interface WrapUpOpen {
  step: WrapUpStep;
  id: string | null;
}

interface TemplateRow {
  key: string;
  enabled: boolean;
}

interface PaymentRow {
  quote_id: string | null;
  status: string;
}

/** The job's finish list (core `wrapUp`), from the phone's database. */
export function useWrapUp(
  jobId: string,
  jobType: string,
  customer: string | null,
  findings: number,
  tests: number,
) {
  const company = useCompany();
  const reports = useJobReports(company.id, jobId);
  const signatures = useJobSignatures(company.id, jobId);
  const quotes = useJobQuotes(company.id, jobId);
  const invoices = useJobInvoices(company.id, jobId);
  const payments = useRows<PaymentRow>("payment", company.id);
  const templates = useRows<TemplateRow>("report_template", company.id);
  return useMemo(() => {
    const homeowner = reports.filter((r) => r.template_key === "homeowner");
    const draft = homeowner.find((r) => r.status === "draft");
    const sent = homeowner.find((r) => r.status === "sent");
    const snapshot = (sent as { data_snapshot?: { sign_off?: { unsigned_reason?: string } } })
      ?.data_snapshot;
    return wrapUp({
      jobType,
      customer,
      reportOn: templates.find((t) => t.key === "homeowner")?.enabled !== false,
      hasDraft: !!draft?.final_sections,
      sentVersion: sent?.version ?? null,
      unsignedReason: snapshot?.sign_off?.unsigned_reason ?? null,
      findings,
      tests,
      // The report's sign-off: not work authorization (before the work) or quote acceptance.
      signers: signatures
        .filter((s) => s.purpose !== "work_authorization" && s.purpose !== "quote_acceptance")
        .map((s) => s.signer_name),
      quotes: quotes.map((q) => ({
        id: q.id,
        number: q.number ?? null,
        status: q.status,
        total_cents: q.total_cents,
        depositPaid: payments.some((p) => p.quote_id === q.id && p.status === "succeeded"),
      })),
      invoices: invoices.map((i) => ({
        id: i.id,
        number: i.number ?? null,
        status: i.status,
        total_cents: i.total_cents,
        amount_paid_cents: i.amount_paid_cents,
      })),
    });
  }, [
    jobType,
    customer,
    reports,
    signatures,
    quotes,
    invoices,
    payments,
    templates,
    findings,
    tests,
  ]);
}

/** The sheet's title: the row's name, in Title Case for a screen ("Customer Signs"). */
function sheetTitle(list: WrapUp, open: WrapUpOpen) {
  if (open.step === "report") return "Report";
  if (open.step === "sign") return "Customer Signs";
  const row = list.rows.find((r) => r.step === open.step && r.id === open.id);
  return row?.title ?? (open.step === "quote" ? "Quote" : "Invoice");
}

export function WrapUpList({
  job,
  customer,
  list,
  open,
  onOpen,
  reportControls,
}: {
  job: Job;
  customer: Customer | undefined;
  list: WrapUp;
  open: WrapUpOpen | null;
  onOpen: (open: WrapUpOpen | null) => void;
  reportControls: RefObject<ReportControls | null>;
}) {
  const company = useCompany();
  const { services } = useSession();
  const quotes = useJobQuotes(company.id, job.id);
  const openRow = (r: WrapUpRow) =>
    onOpen(r.opens === r.step ? { step: r.step, id: r.id } : { step: r.opens, id: null });
  const draftQuote = quotes.find((q) => q.status === "draft")?.id ?? null;
  const reportDraft = !!list.rows.find((r) => r.step === "report" && r.detail.startsWith("Draft"));

  return (
    <View style={styles.stack}>
      <T muted>{list.subtitle}</T>
      <Group separatorInset={space["4"] + 30 + space["3"]}>
        {list.rows.map((r) => (
          <ListRow
            key={r.key}
            leading={<Marker row={r} />}
            title={r.title}
            subtitle={r.detail}
            detail={
              r.amount ? (
                <T style={[face.semiBold, tabular, { color: color.text }]}>{r.amount}</T>
              ) : null
            }
            onPress={() => openRow(r)}
            accessibilityLabel={r.spoken}
          />
        ))}
      </Group>
      {list.canStartQuote ? (
        <ListRow
          tone="link"
          title={`+ ${NEW_QUOTE_LABEL}`}
          accessibilityLabel={NEW_QUOTE_LABEL}
          onPress={() => {
            const id = startQuote(services.sync, company.id, job.id);
            haptics.success();
            onOpen({ step: "quote", id });
          }}
        />
      ) : null}
      <ModalSheet
        visible={!!open}
        onClose={() => onOpen(null)}
        title={open ? sheetTitle(list, open) : ""}
        cancel="Done"
      >
        {open?.step === "report" ? (
          <View style={styles.sheet}>
            <T variant="secondary" muted>
              {writeDraftIntro(job.type)}
            </T>
            <ReportTab job={job} customer={customer} controls={reportControls} />
          </View>
        ) : open?.step === "sign" ? (
          <View style={styles.sheet}>
            {reportDraft ? (
              <Card style={styles.review}>
                <T variant="secondary" muted>
                  Hand the phone to the customer to read and sign. Signing locks this version.
                </T>
                <Button
                  title="Review with Customer"
                  onPress={() => {
                    onOpen(null);
                    router.push(`/jobs/${job.id}/review?template=homeowner`);
                  }}
                />
              </Card>
            ) : null}
            <Signatures job={job} />
          </View>
        ) : open?.step === "quote" ? (
          <View style={styles.sheet}>
            <QuoteTab job={job} only={open.id ?? draftQuote ?? undefined} />
          </View>
        ) : open?.step === "invoice" ? (
          <View style={styles.sheet}>
            <InvoiceSection job={job} customer={customer} />
          </View>
        ) : null}
      </ModalSheet>
    </View>
  );
}

/** 30 pt: a green check when done, the number in blue when next, else in a gray ring. */
function Marker({ row }: { row: WrapUpRow }) {
  return (
    <View
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={[
        styles.marker,
        row.done
          ? { backgroundColor: color.pass }
          : row.next
            ? { backgroundColor: color.primary }
            : { borderWidth: 1.5, borderColor: color.controlBorder },
      ]}
    >
      {row.done ? (
        <Icon name="checkmark" size={14} color={color.onStatus} weight="bold" />
      ) : (
        <T
          style={[
            face.semiBold,
            tabular,
            { fontSize: 15, color: row.next ? color.onPrimary : color.textMuted },
          ]}
        >
          {String(row.number)}
        </T>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space["2"] },
  sheet: { gap: space["4"], paddingBottom: space["6"] },
  review: { gap: space["3"] },
  marker: {
    width: 30,
    height: 30,
    minWidth: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
});
