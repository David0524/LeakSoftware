import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useRows } from "../../data/hooks";
import { getServices } from "../../lib/services";
import { useCompany } from "../../state/session";
import { FieldGroup, FieldRow, Group, ListRow, T, Toggle } from "../../ui/components";
import { haptics } from "../../ui/haptics";
import { space } from "../../ui/theme";
import { EditSheet, FormActions, ManagersOnly, SettingsList, useEditSheet } from "./SettingsList";

// Settings › Report Templates (the website's settings/reports): which reports techs can send,
// and what they're called. report_template rows are synced; owners and admins save through
// sync. The partner report is gone (owner, 2026-10-18); its sent reports still open.

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
  return (
    <>
      <SettingsList
        title="Report Templates"
        subtitle="Which reports techs can send, and what they’re called. Each report is written from the job’s checklist, tests, and findings."
        notice={sheet.notice}
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
      </SettingsList>
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

const styles = StyleSheet.create({ form: { gap: space["4"] } });
