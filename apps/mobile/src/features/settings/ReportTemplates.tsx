import { useState } from "react";
import { StyleSheet, View } from "react-native";
import {
  REPORT_PHOTO_TEXT,
  SAVED_REPORT_SECTIONS,
  VISIT_REPORT_TEXT,
  VISIT_REPORT_TIMINGS,
  offersLeak,
  offersPool,
  reportPhotoHint,
  requiresReportPhoto,
  savedReportSections,
  visitReportMode,
  visitReportModeFor,
  visitReportTiming,
  type VisitReportMode,
  type VisitReportTiming,
} from "@leakbook/core";
import Svg, { Path, Rect } from "react-native-svg";
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
import { color, space } from "../../ui/theme";
import { useRowMenu } from "../../ui/RowMenu";
import { EditSheet, FormActions, ManagersOnly, SettingsList, useEditSheet } from "./SettingsList";
import { formChanged } from "../../lib/discard";
import { DraftNote } from "../../ui/DraftNote";
import { useUnsavedChanges } from "../../ui/ModalSheet";
import { useDraft } from "../../ui/useDraft";

// Settings › Report Templates (the website's settings/reports): which reports techs can send,
// and what they're called. report_template rows are synced; owners and admins save through
// sync. The partner report is gone (owner, 2026-10-18); its sent reports still open. Below
// them, the shop's saved reports: add, rename, edit each section's text, delete.

interface Template {
  id: string;
  key: string;
  name: string;
  enabled: boolean;
  deleted_at?: string | null;
}

const ABOUT: Record<"homeowner", string> = {
  homeowner: "For the pool owner: plain words, what was found, what it means, and what to do next.",
};
// The insurance report is gone (owner, 2026-10-20: "Remove the insurance stuff").
const ORDER = ["homeowner"];

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
    .filter((t) => t.key === "homeowner" && !t.deleted_at)
    .sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key));
  const sheet = useEditSheet<Template>();
  // A pool-only shop has no leak reports: only its visit reports are set here.
  const leak = offersLeak(company.settings);
  const saved = useSavedReports(company.id);
  const savedSheet = useEditSheet<SavedReport>();
  // Touch and hold a row for Edit and its delete (gestures spec section 12).
  const menu = useRowMenu();
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
      <SettingsList title="Report Templates" notice={sheet.notice ?? savedSheet.notice}>
        {leak ? (
          <Group>
            {templates.map((t) => (
              <ListRow
                key={t.id}
                title={t.name}
                subtitle={ABOUT.homeowner}
                detail={t.enabled ? "On" : "Off"}
                onPress={() => sheet.open(t)}
                editMenu={{ menu, title: t.name }}
              />
            ))}
          </Group>
        ) : null}

        {offersPool(company.settings) ? <VisitReportsSetting /> : null}

        {/* Saved reports (owner, 2026-10-20): the shop's own wording, used word for word. */}
        {leak ? (
          <>
            <Section title="Saved reports">
              {saved.length ? (
                <Group>
                  {saved.map((r) => (
                    <ListRow
                      key={r.id}
                      title={r.name}
                      subtitle={savedReportPreview(r)}
                      onPress={() => savedSheet.open(r)}
                      editMenu={{ menu, title: r.name }}
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
      {menu.element}
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
  // Unsaved entries ask before closing (owner, 2026-10-20: "Discard changes?" everywhere).
  const entries = { name, enabled };
  const [startEntries] = useState(entries);
  useUnsavedChanges(formChanged(startEntries, entries));
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
 * Visit reports for pool service visits (owner, 2026-10-20 and 2026-10-24): Each Visit (with
 * Send Automatically), Monthly with the invoice, or Off, saved as one
 * company.settings.visit_reports value, as the website's VisitReportSetting.
 */
function VisitReportsSetting() {
  const company = useCompany();
  const mode = visitReportMode(company.settings);
  const timing = visitReportTiming(mode);
  // Switching to Monthly or Off and back keeps Send Automatically as it was.
  const [automatic, setAutomatic] = useState(mode === "auto");
  const save = (next: VisitReportMode) => {
    getServices().sync.write("company", company.id, company.id, {
      settings: {
        ...(company.settings as unknown as Record<string, JsonValue>),
        visit_reports: next,
      },
    });
    haptics.selection();
  };
  // Require a Photo (owner, 2026-10-25), while visit reports are on.
  const photoHint = reportPhotoHint(mode);
  const saveRequirePhoto = (on: boolean) => {
    getServices().sync.write("company", company.id, company.id, {
      settings: {
        ...(company.settings as unknown as Record<string, JsonValue>),
        require_report_photo: on,
      },
    });
    haptics.selection();
  };
  return (
    <Section title="Visit reports">
      <View style={styles.part}>
        <T variant="bodyMedium">{VISIT_REPORT_TEXT.title}</T>
        <Segmented
          label={VISIT_REPORT_TEXT.title}
          value={timing}
          onChange={(v: VisitReportTiming) => save(visitReportModeFor(v, automatic))}
          options={VISIT_REPORT_TIMINGS.map((t) => ({ value: t.value, label: t.label }))}
        />
        {timing === "each" ? (
          <View>
            <Toggle
              label={VISIT_REPORT_TEXT.automatic}
              value={mode === "auto"}
              onChange={(on) => {
                setAutomatic(on);
                save(on ? "auto" : "manual");
              }}
            />
            {mode === "auto" ? (
              <T variant="secondary" muted>
                {VISIT_REPORT_TEXT.automaticOn}
              </T>
            ) : null}
          </View>
        ) : timing === "monthly" ? (
          <View style={{ gap: space["2"] }}>
            <Group style={{ backgroundColor: color.well }} separatorInset={52}>
              <MonthlyRow
                icon="doc"
                title={VISIT_REPORT_TEXT.monthlyWhat}
                detail={VISIT_REPORT_TEXT.monthlyWhatDetail}
              />
              <MonthlyRow
                icon="card"
                title={VISIT_REPORT_TEXT.monthlyWhen}
                detail={VISIT_REPORT_TEXT.monthlyWhenDetail}
              />
            </Group>
            <T variant="secondary" muted>
              {VISIT_REPORT_TEXT.monthlyFooter}
            </T>
          </View>
        ) : (
          <T variant="secondary" muted>
            {VISIT_REPORT_TEXT.off}
          </T>
        )}
        {photoHint ? (
          <View testID="report-photo-setting" style={styles.photoSetting}>
            <Toggle
              label={REPORT_PHOTO_TEXT.label}
              value={requiresReportPhoto(company.settings)}
              onChange={saveRequirePhoto}
            />
            <T variant="secondary" muted>
              {photoHint}
            </T>
          </View>
        ) : null}
      </View>
    </Section>
  );
}

/** One line of what Monthly does: a drawn icon, then what and when. */
function MonthlyRow({
  icon,
  title,
  detail,
}: {
  icon: "doc" | "card";
  title: string;
  detail: string;
}) {
  return (
    <View style={styles.monthlyRow} accessible>
      <Svg
        width={24}
        height={24}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color.link}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {icon === "doc" ? (
          <>
            <Path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
            <Path d="M14 3v5h5M9 13h6M9 17h6" />
          </>
        ) : (
          <>
            <Rect x={3} y={5} width={18} height={14} rx={2} />
            <Path d="M3 10h18" />
          </>
        )}
      </Svg>
      <View style={{ flex: 1, gap: 2 }}>
        <T variant="bodyMedium">{title}</T>
        <T variant="secondary" muted>
          {detail}
        </T>
      </View>
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
  // Unsaved entries ask before closing (owner, 2026-10-20: "Discard changes?" everywhere).
  const entries = { name, text };
  const [startEntries] = useState(entries);
  // The wording typed is kept as a draft until it's saved or discarded (owner, 2026-10-27).
  const draft = useDraft({
    form: "saved-report",
    id: saved?.id ?? "new",
    fields: {
      name,
      ...Object.fromEntries(SAVED_REPORT_SECTIONS.map((s) => [s.key, text[s.key] ?? ""])),
    },
    restore: (c) => {
      const { name: n, ...sectionText } = c;
      if (n !== undefined) setName(n);
      if (Object.keys(sectionText).length) setText((t) => ({ ...t, ...sectionText }));
    },
  });
  useUnsavedChanges(formChanged(startEntries, entries), draft);
  function save() {
    if (!name.trim()) return setError("Enter a name.");
    if (name.trim().length > 80) return setError("Use 80 characters or fewer.");
    const sections = savedReportSections(text);
    if (saved) updateSavedReport(company.id, saved.id, name, sections);
    else addSavedReport(company.id, name, sections);
    haptics.success();
    draft.clear();
    onDone(saved ? "Saved." : "Added.");
  }
  return (
    <View style={styles.form}>
      <DraftNote draft={draft} />
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

const styles = StyleSheet.create({
  form: { gap: space["4"] },
  part: { gap: space["2"] },
  // Require a Photo: below the timing, past a hairline, as on the iPhone app.
  photoSetting: {
    marginTop: space["2"],
    paddingTop: space["2"],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.separator,
  },
  monthlyRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space["3"],
    paddingHorizontal: space["4"],
    paddingVertical: space["3"],
  },
});
