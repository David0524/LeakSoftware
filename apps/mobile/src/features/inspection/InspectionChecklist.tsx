import { useEffect, useState } from "react";
import {
  Alert,
  Animated,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  CHECKLIST_SECTION_LABELS,
  INSPECTION_SECTIONS,
  NOT_PRESENT_LABEL,
  choiceOptions,
  foldedItems,
  inspectionProgress,
  inspectionProgressText,
  inspectionValue,
  isGate,
  removeItemConfirm,
  toggleChoice,
  type ChecklistItemResult,
  type ChecklistSection,
  type ComponentType,
  type Job,
  type JobComponent,
} from "@leakbook/core";
import {
  removeComponent,
  saveChecklistResult,
  saveInspectionAnswer,
  useJobInspection,
} from "../../data/inspection";
import { saveCapture } from "../../data/media";
import {
  MediaError,
  askLocationOnce,
  chooseManyFromLibrary,
  captureWithCamera,
  currentPosition,
} from "../../lib/media";
import { useSession } from "../../state/session";
import { Button, T } from "../../ui/components";
import { confirmDestructive } from "../../ui/confirm";
import { useMenu } from "../../ui/Select";
import {
  color,
  face,
  font,
  MAX_TEXT_SCALE,
  minTap,
  shape,
  space,
  tint,
  type,
} from "../../ui/theme";
import { WebIcon, type WebIconName } from "../../ui/WebIcon";
import { ChipToggles, ChoicePills } from "./ChoicePills";

// Pool Inspection's checklist (owner, 2026-10-20; docs/plans/pool-inspection.md), as the
// website's inspection-checklist.tsx: Leaktronics' form, every question kept, made shorter. One
// folding block per section with its progress; one row per question with its answers on the
// row; Describe and photos open only when used; a gate's No folds its group away as "Not
// present"; banners sit above their question, word for word. Every answer saves at once,
// offline, through the sync layer.

export interface InspectionRow {
  component: JobComponent;
  type: ComponentType;
  result: ChecklistItemResult | undefined;
}

const asFold = (r: InspectionRow) => ({
  id: r.component.id,
  section: r.type.section ?? null,
  group_label: r.type.group_label ?? null,
  options: r.type.options,
  value: r.result?.value,
  result: r.result ? { status: r.result.status, outcome: r.result.outcome ?? null } : null,
});

/** The inspection's sections, in the form's order. `rows` come in checklist order. */
export function InspectionChecklist({
  job,
  rows,
  photos,
  editing,
}: {
  job: Job;
  rows: InspectionRow[];
  /** Photos attached to each item, by job_component id. */
  photos: Map<string, number>;
  editing: boolean;
}) {
  const folded = foldedItems(rows.map(asFold));
  const sections = INSPECTION_SECTIONS.map((section) => ({
    section,
    items: rows.filter((r) => r.type.section === section),
  })).filter((s) => s.items.length > 0);
  // The first section with questions left starts open; the rest are one line each.
  const first = sections.find(
    (s) => inspectionProgress(s.items.map(asFold), folded).toDo > 0,
  )?.section;
  return (
    <>
      {sections.map(({ section, items }) => (
        <InspectionSection
          key={section}
          job={job}
          section={section}
          items={items}
          folded={folded}
          photos={photos}
          startOpen={section === first}
          editing={editing}
        />
      ))}
    </>
  );
}

function InspectionSection({
  job,
  section,
  items,
  folded,
  photos,
  startOpen,
  editing,
}: {
  job: Job;
  section: ChecklistSection;
  items: InspectionRow[];
  folded: Set<string>;
  photos: Map<string, number>;
  startOpen: boolean;
  editing: boolean;
}) {
  const [toggled, setOpen] = useState(startOpen);
  // Editing opens every section, so each question shows its Remove button.
  const open = toggled || editing;
  const [turn] = useState(() => new Animated.Value(startOpen ? 1 : 0));
  useEffect(() => {
    Animated.timing(turn, { toValue: open ? 1 : 0, duration: 200, useNativeDriver: true }).start();
  }, [open, turn]);
  const title = CHECKLIST_SECTION_LABELS[section];
  const progress = inspectionProgress(items.map(asFold), folded);
  const summary = inspectionProgressText(progress);
  const tone = progress.leaking
    ? color.fail
    : progress.attention
      ? color.warning
      : progress.toDo
        ? color.textMuted
        : color.pass;

  return (
    <View style={[styles.group, { backgroundColor: color.surface }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${title}, ${summary}`}
        onPress={() => setOpen(!toggled)}
        android_ripple={{ color: color.ripple }}
        style={styles.groupHead}
      >
        <Animated.View
          style={{
            transform: [
              { rotate: turn.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "90deg"] }) },
            ],
          }}
        >
          <WebIcon name="chevronRight" size={20} color={color.textMuted} strokeWidth={2.2} />
        </Animated.View>
        <T variant="bodyEmphasis" style={{ flex: 1 }}>
          {title}
        </T>
        <Text style={[styles.summary, { color: tone }]} maxFontSizeMultiplier={MAX_TEXT_SCALE}>
          {summary}
        </Text>
      </Pressable>
      {open
        ? items.map((row, i) => {
            if (folded.has(row.component.id)) return null;
            const prev = items[i - 1];
            const header =
              row.type.group_label && row.type.group_label !== prev?.type.group_label
                ? row.type.group_label
                : null;
            const foldedHere = isGate(row.type)
              ? items.filter(
                  (r) => folded.has(r.component.id) && r.type.group_label === row.type.group_label,
                ).length
              : 0;
            return (
              <View key={row.component.id}>
                <View style={[styles.hairline, { backgroundColor: color.separator }]} />
                {header ? (
                  <T variant="sectionLabel" style={styles.groupLabel}>
                    {header}
                  </T>
                ) : null}
                {row.type.notice ? (
                  <View style={[styles.notice, { backgroundColor: tint(color.warning, 0.1) }]}>
                    <Text
                      style={[styles.noticeText, { color: color.text }]}
                      maxFontSizeMultiplier={MAX_TEXT_SCALE}
                    >
                      {row.type.notice}
                    </Text>
                  </View>
                ) : null}
                <InspectionItem
                  job={job}
                  row={row}
                  photos={photos.get(row.component.id) ?? 0}
                  editing={editing}
                />
                {foldedHere ? (
                  <T variant="secondary" muted style={styles.folded}>
                    {`${NOT_PRESENT_LABEL}: ${foldedHere} ${foldedHere === 1 ? "question" : "questions"} folded away.`}
                  </T>
                ) : null}
              </View>
            );
          })
        : null}
    </View>
  );
}

/** One question: its answers on the row, then Describe and photos when used. */
function InspectionItem({
  job,
  row,
  photos,
  editing,
}: {
  job: Job;
  row: InspectionRow;
  photos: number;
  editing: boolean;
}) {
  const { services, user } = useSession();
  // The live row, so a quick second tap reads the first one's answer.
  const insp = useJobInspection(job.company_id, job.id);
  const { component, type: question } = row;
  const result = insp.resultByComponent.get(component.id) ?? row.result;
  const answer = question.answer ?? "choice";
  const options = choiceOptions(question.options);
  const value = inspectionValue(answer, result?.value);
  const notes = result?.notes ?? "";
  const [describing, setDescribing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const menu = useMenu();

  function answerWith(next: string | string[] | null) {
    saveInspectionAnswer(
      services.sync,
      job.company_id,
      job.id,
      component.id,
      result,
      question,
      next,
      user?.id ?? null,
    );
  }

  function saveNotes(text: string) {
    saveChecklistResult(services.sync, job.company_id, job.id, component.id, result, {
      notes: text.trim() || null,
    });
  }

  async function addPhoto(source: "camera" | "library") {
    setBusy(true);
    setPhotoError(null);
    const target = { jobId: job.id, componentId: component.id };
    try {
      if (source === "library") {
        // Taken earlier, maybe elsewhere: where the phone is now isn't where it was taken.
        // Several photos at once, in the order picked (owner, 2026-10-22).
        for (const file of await chooseManyFromLibrary("photo"))
          await saveCapture(job.company_id, target, file, Promise.resolve(null));
        return;
      }
      await askLocationOnce();
      const position = currentPosition();
      const file = await captureWithCamera("photo");
      if (file) await saveCapture(job.company_id, target, file, position);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (e instanceof MediaError && e.needsSettings) {
        Alert.alert("Couldn’t take the photo", message, [
          { text: "Cancel", style: "cancel" },
          { text: "Open Settings", onPress: () => void Linking.openSettings() },
        ]);
      } else setPhotoError(message);
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <View style={styles.editItem}>
        <Text
          style={[styles.question, { flex: 1, color: color.text }]}
          maxFontSizeMultiplier={MAX_TEXT_SCALE}
        >
          {component.label}
        </Text>
        <Button
          title="Remove"
          kind="danger"
          accessibilityLabel={`Remove ${component.label}`}
          onPress={() => {
            const ask = removeItemConfirm(component.label, false);
            confirmDestructive({
              title: ask.title,
              message: ask.message ?? undefined,
              confirm: ask.confirm,
              onConfirm: () => removeComponent(services.sync, job.company_id, component, result),
            });
          }}
        />
      </View>
    );
  }

  return (
    <View style={styles.item}>
      <View style={styles.itemRow}>
        <Text
          style={[styles.question, { flex: 1, color: color.text }]}
          maxFontSizeMultiplier={MAX_TEXT_SCALE}
        >
          {component.label}
        </Text>
        {result ? (
          <IconButton
            icon="compose"
            label={`Describe: ${component.label}`}
            on={Boolean(notes)}
            expanded={describing || Boolean(notes)}
            onPress={() => setDescribing(!describing)}
          />
        ) : null}
        <IconButton
          icon="camera"
          label={`Add photos: ${component.label}${photos ? ` (${photos} so far)` : ""}`}
          on={photos > 0}
          count={photos}
          disabled={busy}
          onPress={() =>
            menu.open({
              title: "Add Photo",
              items: [
                { label: "Take Photo", onPress: () => void addPhoto("camera") },
                { label: "Choose from Library", onPress: () => void addPhoto("library") },
              ],
            })
          }
        />
      </View>

      {answer === "text" ? (
        <SavedText
          key={typeof value === "string" ? value : ""}
          label={component.label}
          value={typeof value === "string" ? value : ""}
          onSave={answerWith}
        />
      ) : answer === "multi" ? (
        <ChipToggles
          label={component.label}
          options={options.map((o) => o.label)}
          value={Array.isArray(value) ? value : []}
          onToggle={(label) =>
            answerWith(toggleChoice(options, Array.isArray(value) ? value : [], label))
          }
        />
      ) : (
        // Tapping the chosen answer again puts the question back to do.
        <ChoicePills
          label={component.label}
          options={options}
          value={typeof value === "string" ? value : null}
          onChange={answerWith}
        />
      )}

      {result && (describing || notes) ? (
        <SavedText
          key={notes}
          label={`Describe: ${component.label}`}
          placeholder="Describe"
          value={notes}
          autoFocus={describing && !notes}
          onSave={saveNotes}
        />
      ) : null}
      {busy ? (
        <T variant="secondary" muted>
          Adding the photo…
        </T>
      ) : null}
      {photoError ? (
        <T variant="secondary" style={{ color: color.fail }}>
          {photoError}
        </T>
      ) : null}
      {menu.element}
    </View>
  );
}

/** A round 44 pt icon button, tinted once it holds something, with an optional count. */
function IconButton({
  icon,
  label,
  on,
  count = 0,
  expanded,
  disabled,
  onPress,
}: {
  icon: WebIconName;
  label: string;
  on: boolean;
  count?: number;
  expanded?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, ...(expanded === undefined ? {} : { expanded }) }}
      disabled={disabled}
      onPress={onPress}
      android_ripple={{ color: color.ripple, borderless: true }}
      style={({ pressed }) => [
        styles.iconButton,
        { backgroundColor: on ? color.iconTint : "transparent" },
        pressed && { backgroundColor: on ? color.tintedPressed : color.rowPressed },
      ]}
    >
      <WebIcon name={icon} size={20} color={on ? color.link : color.textMuted} strokeWidth={2} />
      {count ? (
        <View style={[styles.badge, { backgroundColor: color.primary }]}>
          <Text style={[styles.badgeText, { color: color.onPrimary }]} maxFontSizeMultiplier={1.4}>
            {count}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/** A text box saved when it loses focus, if it changed. */
function SavedText({
  label,
  value,
  placeholder,
  autoFocus,
  onSave,
}: {
  label: string;
  value: string;
  placeholder?: string;
  autoFocus?: boolean;
  onSave: (text: string) => void;
}) {
  const [text, setText] = useState(value);
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      accessibilityLabel={label}
      value={text}
      onChangeText={setText}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        if (text.trim() !== value) onSave(text);
      }}
      placeholder={placeholder}
      placeholderTextColor={color.placeholder}
      autoFocus={autoFocus}
      multiline
      maxLength={2000}
      maxFontSizeMultiplier={MAX_TEXT_SCALE}
      style={[
        styles.textBox,
        { backgroundColor: color.bg, borderColor: color.controlBorder, color: color.text },
        focused && { borderColor: color.focus, borderWidth: 2 },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  group: { borderRadius: shape.grouped, overflow: "hidden" },
  groupHead: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: space["3"],
    paddingHorizontal: space["4"],
  },
  summary: { fontFamily: font.displaySemiBold, fontSize: 15, lineHeight: 20 },
  hairline: { height: StyleSheet.hairlineWidth },
  groupLabel: { paddingHorizontal: space["4"], paddingTop: space["4"], paddingBottom: space["1"] },
  notice: {
    marginHorizontal: space["4"],
    marginTop: space["3"],
    borderRadius: shape.field,
    paddingHorizontal: space["3"],
    paddingVertical: space["2"],
  },
  noticeText: { ...type.secondary, ...face.semiBold },
  item: { paddingHorizontal: space["4"], paddingVertical: space["2"], gap: space["2"] },
  itemRow: { flexDirection: "row", alignItems: "flex-start", gap: space["1"], minHeight: minTap },
  question: { ...face.medium, fontSize: 17, lineHeight: 21, paddingTop: 11 },
  iconButton: {
    width: minTap,
    height: minTap,
    borderRadius: minTap / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: 0,
    right: 0,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { ...face.semiBold, fontSize: 12, lineHeight: 16 },
  textBox: {
    minHeight: minTap,
    borderWidth: 1,
    borderRadius: shape.field,
    paddingHorizontal: space["3"],
    paddingVertical: space["2"],
    ...face.regular,
    fontSize: 17,
    textAlignVertical: "top",
  },
  folded: { paddingHorizontal: space["4"], paddingBottom: space["3"] },
  editItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: space["3"],
    minHeight: minTap,
    paddingHorizontal: space["4"],
    paddingVertical: space["1"],
  },
});
