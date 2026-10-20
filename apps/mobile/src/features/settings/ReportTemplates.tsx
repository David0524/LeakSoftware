import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { SAVED_REPORT_SECTIONS, savedReportSections } from "@leakbook/core";
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
  const saved = useSavedReports(company.id);
  const savedSheet = useEditSheet<SavedReport>();
  const removeSaved = (r: SavedReport) =>
    confirmDestructive({
      title: `Delete “${r.name}”?`,
      message: "Reports that used it keep their text.",
      confirm: "Delete Saved Report",
      onConfirm: () => {
        removeSavedReport(company.id, r.id);
        savedSheet.done("Deleted.");
      },
    });
  return (
    <>
      <SettingsList
        title="Report Templates"
        subtitle="Which reports techs can send, and what they’re called. Each report is written from the job’s checklist, tests, and findings."
        notice={sheet.notice ?? savedSheet.notice}
      >
        <Group>
          {templates.map((t) =>
            t.key === "insurance" ? (
              <ListRow key={t.id} title={t.name} subtitle={ABOUT.insurance} detail="Coming soon" />
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

        {/* Saved reports (owner, 2026-10-20): the shop's own wording, used word for word. */}
        <Section
          title="Saved reports"
          footer="Your shop’s own wording for a report. On a draft, Use Saved Report puts it in word for word."
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

const styles = StyleSheet.create({ form: { gap: space["4"] } });
