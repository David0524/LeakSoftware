import { useState } from "react";
import { StyleSheet, View } from "react-native";
import {
  SAVED_REPORT_SECTIONS,
  applySavedReport,
  replaceSavedReportQuestion,
  savedReportFrom,
  savedReportSections,
  type FinalSection,
} from "@leakbook/core";
import { addSavedReport, useSavedReports, type SavedReport } from "../../data/savedReports";
import { useCompany } from "../../state/session";
import { Button, FieldGroup, FieldRow, Group, ListRow, Notice, T } from "../../ui/components";
import { confirmDestructive } from "../../ui/confirm";
import { haptics } from "../../ui/haptics";
import { ModalSheet } from "../../ui/ModalSheet";
import { space } from "../../ui/theme";

// Saved reports on a report draft (owner, 2026-10-20): Use Saved Report fills the draft's
// sections with a shop's own wording, word for word, asking first before replacing different
// text; owners and admins can Save as Saved Report from the draft.

/** The first words of a saved report, for its row. */
export function savedReportPreview(saved: SavedReport): string {
  const text = savedReportSections(saved.sections);
  const parts = SAVED_REPORT_SECTIONS.filter((s) => text[s.key]).map((s) => s.title);
  return parts.length ? parts.join(", ") : "No text yet";
}

/**
 * Use Saved Report: a sheet listing the shop's saved reports. Picking one gives the new
 * sections to save (after asking, when it replaces different text).
 */
export function UseSavedReportSheet({
  open,
  onClose,
  sections,
  onApply,
  canManage,
}: {
  open: boolean;
  onClose: () => void;
  /** The draft's sections as they read now, edits included. */
  sections: FinalSection[];
  onApply: (next: FinalSection[], name: string) => void;
  canManage: boolean;
}) {
  const company = useCompany();
  const saved = useSavedReports(company.id);

  function pick(s: SavedReport) {
    const { sections: next, replaces } = applySavedReport(sections, s.sections);
    const apply = () => {
      onClose();
      onApply(next, s.name);
    };
    if (!replaces.length) return apply();
    confirmDestructive({
      title: replaceSavedReportQuestion(replaces),
      confirm: "Replace",
      onConfirm: apply,
    });
  }

  return (
    <ModalSheet visible={open} onClose={onClose} title="Saved Reports">
      {saved.length ? (
        <Group>
          {saved.map((s) => (
            <ListRow
              key={s.id}
              title={s.name}
              subtitle={savedReportPreview(s)}
              onPress={() => pick(s)}
            />
          ))}
        </Group>
      ) : (
        <Notice>
          {canManage
            ? "No saved reports yet. Save this draft as one, or add them in Settings › Report Templates."
            : "No saved reports yet. An owner or admin adds them in Settings › Report Templates."}
        </Notice>
      )}
    </ModalSheet>
  );
}

/** Save as Saved Report: asks for a name, then saves the draft's text by section. */
export function SaveAsSavedReportSheet({
  open,
  onClose,
  sections,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  sections: FinalSection[];
  onSaved: (name: string) => void;
}) {
  return (
    <ModalSheet visible={open} onClose={onClose} title="Save as Saved Report">
      {open ? <SaveAsForm sections={sections} onSaved={onSaved} /> : null}
    </ModalSheet>
  );
}

function SaveAsForm({
  sections,
  onSaved,
}: {
  sections: FinalSection[];
  onSaved: (name: string) => void;
}) {
  const company = useCompany();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | undefined>();
  const text = savedReportFrom(sections);
  const empty = Object.keys(text).length === 0;
  function save() {
    if (!name.trim()) return setError("Enter a name.");
    if (name.trim().length > 80) return setError("Use 80 characters or fewer.");
    addSavedReport(company.id, name, text);
    haptics.success();
    onSaved(name.trim());
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
      <T variant="secondary" muted>
        {empty
          ? "The draft has no text to save yet."
          : `Saves the text in ${SAVED_REPORT_SECTIONS.filter((s) => text[s.key])
              .map((s) => s.title)
              .join(", ")}, word for word. Anyone on the team can use it on a report.`}
      </T>
      <Button title="Save" wide disabled={empty} onPress={save} />
    </View>
  );
}

const styles = StyleSheet.create({ form: { gap: space["4"] } });
