import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { isHexColor, type ExclusionReason, type SeverityLevel } from "@leakbook/core";
import { confirmDestructive } from "../../ui/confirm";
import { removeConfig, saveConfig, toInt, useConfig } from "../../data/config";
import { useCompany } from "../../state/session";
import { FieldGroup, FieldRow, Group, ListRow, T, Toggle } from "../../ui/components";
import { haptics } from "../../ui/haptics";
import { space } from "../../ui/theme";
import { useRowMenu } from "../../ui/RowMenu";
import { EditSheet, FormActions, ManagersOnly, SettingsList, useEditSheet } from "./SettingsList";
import { formChanged } from "../../lib/discard";
import { useUnsavedChanges } from "../../ui/ModalSheet";

// Settings › Exclusion Reasons and Severities (the website's settings/exclusions and
// settings/severities).

export function ExclusionReasons() {
  return (
    <ManagersOnly title="Exclusion Reasons">
      <ExclusionsPage />
    </ManagersOnly>
  );
}

function ExclusionsPage() {
  const company = useCompany();
  const reasons = useConfig<ExclusionReason>("exclusion_reason", company.id);
  const sheet = useEditSheet<ExclusionReason>();
  // Touch and hold a row for Edit and its delete (gestures spec section 12).
  const menu = useRowMenu();
  return (
    <>
      <SettingsList
        title="Exclusion Reasons"
        addLabel="Add Reason"
        onAdd={() => sheet.open("new")}
        notice={sheet.notice}
      >
        <Group>
          {reasons.map((r) => (
            <ListRow
              key={r.id}
              title={r.label}
              detail={r.active ? undefined : "Off"}
              onPress={() => sheet.open(r)}
              editMenu={{ menu, title: r.label }}
              // Swipe to remove; the row's sheet keeps its visible Remove button.
              deleteLabel="Remove"
              onDelete={() =>
                confirmDestructive({
                  title: "Remove this reason?",
                  confirm: "Remove",
                  onConfirm: () => removeConfig("exclusion_reason", company.id, r.id),
                })
              }
            />
          ))}
        </Group>
      </SettingsList>
      {menu.element}
      <EditSheet
        open={sheet.editing != null}
        title={sheet.editing === "new" ? "Add Reason" : (sheet.editing?.label ?? "")}
        onClose={sheet.close}
      >
        <ReasonForm
          reason={sheet.editing === "new" ? undefined : (sheet.editing ?? undefined)}
          onDone={sheet.done}
        />
      </EditSheet>
    </>
  );
}

function ReasonForm({ reason, onDone }: { reason?: ExclusionReason; onDone: (m: string) => void }) {
  const company = useCompany();
  const [label, setLabel] = useState(reason?.label ?? "");
  const [order, setOrder] = useState(String(reason?.sort_order ?? 0));
  const [active, setActive] = useState(reason?.active ?? true);
  const [error, setError] = useState<string | undefined>();
  // Unsaved entries ask before closing (owner, 2026-10-20: "Discard changes?" everywhere).
  const entries = { label, order, active };
  const [startEntries] = useState(entries);
  useUnsavedChanges(formChanged(startEntries, entries));
  function save() {
    if (!label.trim()) {
      setError("Enter a reason.");
      return;
    }
    saveConfig("exclusion_reason", company.id, reason?.id ?? null, {
      label: label.trim(),
      sort_order: toInt(order),
      active: reason ? active : true,
    });
    haptics.success();
    onDone(reason ? "Saved." : "Added.");
  }
  return (
    <>
      <FieldGroup labelWidth={reason ? 80 : 112}>
        <FieldRow
          label={reason ? "Reason" : "New reason"}
          value={label}
          onChangeText={setLabel}
          placeholder={reason ? undefined : "Equipment locked"}
          error={error}
        />
        {reason ? (
          <FieldRow label="Order" value={order} onChangeText={setOrder} keyboardType="number-pad" />
        ) : null}
      </FieldGroup>
      {reason ? (
        <Group>
          <Toggle inList label="Offered" value={active} onChange={setActive} />
        </Group>
      ) : null}
      <FormActions
        submit={reason ? "Save" : "Add Reason"}
        onSubmit={save}
        remove={
          reason
            ? {
                label: "Remove",
                confirm: "Remove this reason?",
                onConfirm: () => {
                  removeConfig("exclusion_reason", company.id, reason.id);
                  onDone("Removed.");
                },
              }
            : undefined
        }
      />
    </>
  );
}

// ---------------------------------------------------------------------------

export function Severities() {
  return (
    <ManagersOnly title="Severities">
      <SeveritiesPage />
    </ManagersOnly>
  );
}

function Swatch({ hex }: { hex: string }) {
  return (
    <View style={[styles.swatch, { backgroundColor: isHexColor(hex) ? hex : "transparent" }]} />
  );
}

function SeveritiesPage() {
  const company = useCompany();
  const levels = useConfig<SeverityLevel>("severity_level", company.id);
  const sheet = useEditSheet<SeverityLevel>();
  // Touch and hold a row for Edit and its delete (gestures spec section 12).
  const menu = useRowMenu();
  return (
    <>
      <SettingsList
        title="Severities"
        addLabel="Add Severity"
        onAdd={() => sheet.open("new")}
        notice={sheet.notice}
      >
        <Group>
          {levels.map((s) => (
            <ListRow
              key={s.id}
              title={s.name}
              subtitle={s.must_mention ? "Always in the report summary" : undefined}
              onPress={() => sheet.open(s)}
              editMenu={{ menu, title: s.name }}
              // Swipe to remove; the row's sheet keeps its visible Remove button.
              deleteLabel="Remove Severity"
              onDelete={() =>
                confirmDestructive({
                  title: "Remove this severity?",
                  confirm: "Remove Severity",
                  onConfirm: () => removeConfig("severity_level", company.id, s.id),
                })
              }
              trailing={
                <View style={styles.value}>
                  {s.active ? null : <T muted>Off</T>}
                  <Swatch hex={s.color} />
                </View>
              }
            />
          ))}
        </Group>
      </SettingsList>
      {menu.element}
      <EditSheet
        open={sheet.editing != null}
        title={sheet.editing === "new" ? "Add Severity" : (sheet.editing?.name ?? "")}
        onClose={sheet.close}
      >
        <SeverityForm
          level={sheet.editing === "new" ? undefined : (sheet.editing ?? undefined)}
          onDone={sheet.done}
        />
      </EditSheet>
    </>
  );
}

function SeverityForm({ level, onDone }: { level?: SeverityLevel; onDone: (m: string) => void }) {
  const company = useCompany();
  const [f, setF] = useState({
    name: level?.name ?? "",
    order: String(level?.sort_order ?? 0),
    color: level?.color ?? "#9A6210",
    mention: level?.must_mention ?? false,
    active: level?.active ?? true,
  });
  // Unsaved entries ask before closing (owner, 2026-10-20: "Discard changes?" everywhere).
  const [startF] = useState(f);
  useUnsavedChanges(formChanged(startF, f));
  const [errors, setErrors] = useState<Record<string, string>>({});
  function save() {
    const e: Record<string, string> = {};
    if (!f.name.trim()) e.name = "Enter a name.";
    if (!isHexColor(f.color.trim())) e.color = "Use a color like #C62F2B.";
    setErrors(e);
    if (Object.keys(e).length) return;
    saveConfig(
      "severity_level",
      company.id,
      level?.id ?? null,
      {
        name: f.name.trim(),
        color: f.color.trim().toUpperCase(),
        must_mention: f.mention,
        sort_order: toInt(f.order),
        active: level ? f.active : true,
      },
      level ? undefined : f.name.trim(),
    );
    haptics.success();
    onDone(level ? "Saved." : `Added ${f.name.trim()}.`);
  }
  return (
    <>
      <FieldGroup labelWidth={96}>
        <FieldRow
          label="Name"
          value={f.name}
          onChangeText={(v) => setF({ ...f, name: v })}
          error={errors.name}
        />
        <FieldRow
          label="Order"
          value={f.order}
          onChangeText={(v) => setF({ ...f, order: v })}
          keyboardType="number-pad"
        />
      </FieldGroup>
      <FieldGroup labelWidth={96}>
        <View style={styles.colorRow}>
          <View style={{ flex: 1 }}>
            <FieldRow
              label="Pin color"
              value={f.color}
              onChangeText={(v) => setF({ ...f, color: v })}
              autoCapitalize="characters"
              maxLength={7}
              error={errors.color}
            />
          </View>
          <View style={{ paddingRight: space["4"] }}>
            <Swatch hex={f.color.trim()} />
          </View>
        </View>
      </FieldGroup>
      <Group>
        <Toggle
          inList
          label="Must appear in the report summary"
          value={f.mention}
          onChange={(v) => setF({ ...f, mention: v })}
        />
        {level ? (
          <Toggle
            inList
            label="Techs can pick this"
            value={f.active}
            onChange={(v) => setF({ ...f, active: v })}
          />
        ) : null}
      </Group>
      <FormActions
        submit={level ? "Save" : "Add Severity"}
        onSubmit={save}
        remove={
          level
            ? {
                label: "Remove Severity",
                confirm: "Remove this severity?",
                onConfirm: () => {
                  removeConfig("severity_level", company.id, level.id);
                  onDone("Removed.");
                },
              }
            : undefined
        }
      />
    </>
  );
}

const styles = StyleSheet.create({
  swatch: { width: 20, height: 20, borderRadius: 10 },
  value: { flexDirection: "row", alignItems: "center", gap: space["2"] },
  colorRow: { flexDirection: "row", alignItems: "center" },
});
