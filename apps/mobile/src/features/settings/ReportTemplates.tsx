import { useState } from "react";
import { StyleSheet, View } from "react-native";
import {
  SAVED_REPORT_SECTIONS,
  VISIT_REPORT_MODES,
  offersLeak,
  offersPool,
  savedReportSections,
  visitReportMode,
  type VisitReportMode,
} from "@leakbook/core";
import type { JsonValue } from "@leakbook/sync";
import { useRows } from "../../data/hooks";
import {
  addSavedReport,
  removeSavedReport,
  updateSavedReport,
  useSavedReports,
  type SavedReport,
} from "../../data/savedReports";
import { getServices } from "../../lib/services";
import { useCompany } from "../../state/session";
import {
  Button,
  Field,
  FieldGroup,
  FieldRow,
  Group,
  ListRow,
  Notice,
  Section,
  Segmented,
  T,
  Toggle,
} from "../../ui/components";
import { confirmDestructive } from "../../ui/confirm";
import { savedReportPreview } from "../report/SavedReportPicker";
import { haptics } from "../../ui/haptics";
import { space } from "../../ui/theme";
import { EditSheet, FormActions, ManagersOnly, SettingsList, useEditSheet } from "./SettingsList";

// Settings › Report Templates (the website's settings/reports): which reports techs can send,
// and what they're called. report_template rows are synced; owners and admins save through
// sync. The partner report is gone (owner, 2026-10-18); its sent reports still open. Below
// them, the shop's saved reports: add, rename, edit each section's text, delete.

interface Template {
  id: string;
  key: "homeowner" | "partner" | "insurance";
  name: string;
  enabled: boolean;
  deleted_at?: string | null;
}

const ABOUT: Record<"homeowner" | "insurance", string> = {
  homeowner: "For the pool owner: plain words, what was found, what it means, and what to do next.",
  insurance: "For insurance claims.",
};
const ORDER = ["homeowner", "insurance"];

export function ReportTemplates() {
  return (
    <ManagersOnly title="Report Templates">
      <TemplatesPage />
    </ManagersOnly>
  );
}

function TemplatesPage() {
  const company = useCompany();
  const templates = useRows<Template>("report_template", company.id)
    .filter((t) => t.key !== "partner" && !t.deleted_at)
    .sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key));
  const sheet = useEditSheet<Template>();
  // A pool-only shop has no leak reports: only its visit reports are set here.
  const leak = offersLeak(company.settings);
  const saved = useSavedReports(company.id);
  const savedSheet = useEditSheet<SavedReport>();
  const removeSaved = (r: SavedReport) =>
    confirmDestructive({
      title: "Delete this saved report?",
      message: "Reports that used it keep their text.",
      confirm: "Delete",
      onConfirm: () => {
        removeSavedReport(company.id, r.id);
        savedSheet.done("Deleted.");
      },
    });
  return (
    <>
      <SettingsList
        title="Report Templates"
        subtitle={
          leak
            ? "Which reports techs can send, and what they’re called. Each report is written from the job’s checklist, tests, and findings."
            : "What goes to the customer after each maintenance visit."
        }
        notice={sheet.notice ?? savedSheet.notice}
      >
        {leak ? (
          <Group>
            {templates.map((t) =>
              t.key === "insurance" ? (
                <ListRow
                  key={t.id}
                  title={t.name}
                  subtitle={ABOUT.insurance}
                  detail="Coming soon"
                />
              ) : (
                <ListRow
                  key={t.id}
                  title={t.name}
                  subtitle={ABOUT.homeowner}
                  detail={t.enabled ? "On" : "Off"}
                  onPress={() => sheet.open(t)}
                />
              ),
            )}
          </Group>
        ) : null}

        {offersPool(company.settings) ? <VisitReportsSetting /> : null}

        {/* Saved reports (owner, 2026-10-20): the shop's own wording, used word for word. */}
        {leak ? (
          <>
            <Section
              title="Saved reports"
              footer="Text you use again and again. On a report, Use Saved Report puts it in word for word."
            >
              {saved.length ? (
                <Group>
                  {saved.map((r) => (
                    <ListRow
                      key={r.id}
                      title={r.name}
                      subtitle={savedReportPreview(r)}
                      onPress={() => savedSheet.open(r)}
                      deleteLabel="Delete"
                      onDelete={() => removeSaved(r)}
                    />
                  ))}
                </Group>
              ) : (
                <Notice>None yet. Add one, or save a report draft as one.</Notice>
              )}
            </Section>
            <Button
              title="+ Add Saved Report"
              kind="secondary"
              onPress={() => savedSheet.open("new")}
            />
          </>
        ) : null}
      </SettingsList>
      <EditSheet
        open={savedSheet.editing != null}
        title={savedSheet.editing === "new" ? "New Saved Report" : (savedSheet.editing?.name ?? "")}
        onClose={savedSheet.close}
      >
        {savedSheet.editing ? (
          <SavedReportForm
            saved={savedSheet.editing === "new" ? null : savedSheet.editing}
            onDone={savedSheet.done}
            onRemove={removeSaved}
          />
        ) : null}
      </EditSheet>
      <EditSheet
        open={sheet.editing != null && sheet.editing !== "new"}
        title={sheet.editing && sheet.editing !== "new" ? sheet.editing.name : ""}
        onClose={sheet.close}
      >
        {sheet.editing && sheet.editing !== "new" ? (
          <TemplateForm template={sheet.editing} onDone={sheet.done} />
        ) : null}
      </EditSheet>
    </>
  );
}

function TemplateForm({ template, onDone }: { template: Template; onDone: (m: string) => void }) {
  const company = useCompany();
  const [name, setName] = useState(template.name);
  const [enabled, setEnabled] = useState(template.enabled);
  const [error, setError] = useState<string | undefined>();
  function save() {
    if (!name.trim()) return setError("Enter a name.");
    getServices().sync.write("report_template", template.id, company.id, {
      name: name.trim(),
      enabled,
    });
    haptics.success();
    onDone("Saved.");
  }
  return (
    <View style={styles.form}>
      <FieldGroup labelWidth={80}>
        <FieldRow label="Name" value={name} onChangeText={setName} error={error} />
      </FieldGroup>
      <View>
        <Toggle label="Techs can send this report" value={enabled} onChange={setEnabled} />
        <T variant="secondary" muted>
          {ABOUT.homeowner}
        </T>
      </View>
      <FormActions submit="Save" onSubmit={save} />
    </View>
  );
}

/**
 * Visit reports for pool service visits (owner, 2026-10-20: "Include manual send and auto send.
 * Owner/admin can turn that off"): Automatic, By Hand or Off, in company.settings.visit_reports.
 */
function VisitReportsSetting() {
  const company = useCompany();
  const mode = visitReportMode(company.settings);
  return (
    <Section
      title="Visit reports"
      footer="A maintenance visit’s report: the water test, the checklist and cleanings, and photos, at a link for the customer."
    >
      <View style={styles.part}>
        <Segmented
          label="Send visit reports"
          value={mode}
          onChange={(v: VisitReportMode) => {
            getServices().sync.write("company", company.id, company.id, {
              settings: {
                ...(company.settings as unknown as Record<string, JsonValue>),
                visit_reports: v,
              },
            });
            haptics.selection();
          }}
          options={VISIT_REPORT_MODES.map((m) => ({ value: m.value, label: m.label }))}
        />
        <T variant="secondary" muted>
          {VISIT_REPORT_MODES.find((m) => m.value === mode)?.hint}
        </T>
      </View>
    </Section>
  );
}

function SavedReportForm({
  saved,
  onDone,
  onRemove,
}: {
  saved: SavedReport | null;
  onDone: (m: string) => void;
  onRemove: (r: SavedReport) => void;
}) {
  const company = useCompany();
  const [name, setName] = useState(saved?.name ?? "");
  const [text, setText] = useState<Record<string, string>>(() =>
    savedReportSections(saved?.sections),
  );
  const [error, setError] = useState<string | undefined>();
  function save() {
    if (!name.trim()) return setError("Enter a name.");
    if (name.trim().length > 80) return setError("Use 80 characters or fewer.");
    const sections = savedReportSections(text);
    if (saved) updateSavedReport(company.id, saved.id, name, sections);
    else addSavedReport(company.id, name, sections);
    haptics.success();
    onDone(saved ? "Saved." : "Added.");
  }
  return (
    <View style={styles.form}>
      <FieldGroup labelWidth={80}>
        <FieldRow
          label="Name"
          value={name}
          onChangeText={(v) => {
            setError(undefined);
            setName(v);
          }}
          placeholder="Pool and spa, no leak"
          error={error}
        />
      </FieldGroup>
      {SAVED_REPORT_SECTIONS.map((s) => (
        <Field
          key={s.key}
          label={s.title}
          value={text[s.key] ?? ""}
          onChangeText={(v) => setText((t) => ({ ...t, [s.key]: v }))}
          multiline
          hint={
            s.key === "summary" ? "Leave a section empty to keep the draft’s own text." : undefined
          }
        />
      ))}
      <View style={{ gap: space["3"] }}>
        <Button title="Save" wide onPress={save} />
        {saved ? (
          <Button title="Delete Saved Report" kind="danger" wide onPress={() => onRemove(saved)} />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({ form: { gap: space["4"] }, part: { gap: space["2"] } });
