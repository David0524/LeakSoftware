import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import {
  CHECKLIST_SECTION_LABELS,
  INSPECTION_SECTIONS,
  checklistSectionSummary,
  componentApplies,
  markRemainingLabel,
  removeItemConfirm,
  type ChecklistSection,
  type ComponentType,
  type Job,
  type JobComponent,
  type Property,
} from "@leakbook/core";
import {
  addComponent,
  checklistJobType,
  createChecklist,
  removeComponent,
  saveChecklistResult,
  saveWhere,
  useInspectionConfig,
  useJobInspection,
} from "../../data/inspection";
import { useJobMedia } from "../../data/media";
import { useSession } from "../../state/session";
import { Button, Segmented, T } from "../../ui/components";
import { confirmDestructive } from "../../ui/confirm";
import { haptics } from "../../ui/haptics";
import { Select } from "../../ui/Select";
import { useNoSwipe } from "../../ui/SwipeNav";
import { marksToUndo } from "../../lib/undo";
import { checklistRowActions } from "../../lib/rowActions";
import { rowGestures, useRowMenu, type RowMenu } from "../../ui/RowMenu";
import { SwipeActions } from "../../ui/SwipeRow";
import { UndoRow, useUndoWindow } from "../../ui/Undo";
import { useAutosaveText } from "../../ui/useAutosave";
import { color, face, font, MAX_TEXT_SCALE, minTap, shape, space } from "../../ui/theme";
import { WebIcon } from "../../ui/WebIcon";
import { InspectionChecklist } from "./InspectionChecklist";
import { currentVerdict, verdictOptions, verdictValues, type Verdict } from "./verdict";

/**
 * The website's section order (CHECKLIST_SECTION_LABELS). A pool inspection's eight sections
 * have their own rows (InspectionChecklist).
 */
const SECTIONS = (Object.keys(CHECKLIST_SECTION_LABELS) as ChecklistSection[]).filter(
  (s) => !INSPECTION_SECTIONS.includes(s),
);

const ADD_ANOTHER = "another:";

/**
 * The checklist's items in the order it shows them: by section, then the item type's order,
 * then the item's own (the item page's Previous Item and Next Item follow it).
 */
export function checklistOrder(
  components: JobComponent[],
  typeOf: (c: JobComponent) => ComponentType | undefined,
): JobComponent[] {
  const at = (c: JobComponent) => SECTIONS.indexOf(typeOf(c)?.section ?? "other");
  return components
    .filter((c) => typeOf(c))
    .sort(
      (a, b) =>
        at(a) - at(b) ||
        (typeOf(a)?.sort_order ?? 0) - (typeOf(b)?.sort_order ?? 0) ||
        a.sort_order - b.sort_order,
    );
}

/**
 * The checklist as on the website (spec 5.4): one folding block per section with its summary,
 * each item's answers in one tap (owner, 2026-10-20: a segmented control under its name;
 * tapping the chosen answer again clears it), "Where" under leaks, Mark Remaining (with Undo),
 * then Add an item. Remove is behind Edit. Tapping an item's name opens its own screen
 * (method, notes, photos). Works offline.
 */
export function ChecklistTab({ job, property }: { job: Job; property?: Property }) {
  const { services } = useSession();
  const config = useInspectionConfig(job.company_id);
  const insp = useJobInspection(job.company_id, job.id);
  const media = useJobMedia(job.company_id, job.id);
  const [adding, setAdding] = useState<string | null>(null);
  // Edit, as in an iOS list: every item gets Remove (owner, 2026-10-19).
  const [editing, setEditing] = useState(false);
  // Which checklist this job takes: a visit's, a pool inspection's, or the leak one.
  const kind = checklistJobType(job.type);

  if (insp.components.length === 0) {
    return (
      <Button
        title="Set Up Checklist"
        kind="secondary"
        onPress={() =>
          createChecklist(
            services.sync,
            job.company_id,
            job.id,
            config.componentTypes,
            {
              has_pool: property?.has_pool ?? true,
              has_spa: property?.has_spa ?? false,
              pool_type: property?.pool_type ?? null,
            },
            kind,
          )
        }
      />
    );
  }

  const typeOf = (c: JobComponent) => config.componentTypeById.get(c.component_type_id);
  const photos = new Map<string, number>();
  // A pool inspection question shows how many photos it holds, as the website.
  const questionPhotos = new Map<string, number>();
  for (const m of media)
    if (m.job_component_id) {
      photos.set(m.job_component_id, (photos.get(m.job_component_id) ?? 0) + 1);
      if (m.kind === "photo")
        questionPhotos.set(m.job_component_id, (questionPhotos.get(m.job_component_id) ?? 0) + 1);
    }
  // Pool inspection questions, in checklist order (their type's order, then the instance).
  const inspectionRows = insp.components
    .flatMap((c) => {
      const t = typeOf(c);
      return t && INSPECTION_SECTIONS.includes(t.section ?? "other")
        ? [{ component: c, type: t, result: insp.resultByComponent.get(c.id) }]
        : [];
    })
    .sort(
      (a, b) =>
        a.type.sort_order - b.type.sort_order || a.component.sort_order - b.component.sort_order,
    );

  const present = new Set(insp.components.map((c) => c.component_type_id));
  const addable = config.componentTypes.filter(
    (t) =>
      !present.has(t.id) &&
      (t.job_type ?? "detection") === kind &&
      (!property || componentApplies(t, { ...property, has_pool: true })),
  );
  // Types that can repeat ("Another Return"), once each.
  const repeatable = [
    ...new Map(
      insp.components
        .map(typeOf)
        .filter((t): t is ComponentType => Boolean(t?.allows_multiple))
        .map((t) => [t.id, t]),
    ).values(),
  ];
  const addOptions = [
    ...repeatable.map((t) => ({ value: `${ADD_ANOTHER}${t.id}`, label: `Another ${t.name}` })),
    ...addable.map((t) => ({ value: t.id, label: t.name })),
  ];

  function add() {
    if (!adding) return;
    const id = adding.startsWith(ADD_ANOTHER) ? adding.slice(ADD_ANOTHER.length) : adding;
    const t = config.componentTypeById.get(id);
    if (t) addComponent(services.sync, job.company_id, job.id, t, insp.components);
    setAdding(null);
    haptics.success();
  }

  return (
    <View style={styles.list}>
      <View style={styles.editRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: editing }}
          onPress={() => setEditing(!editing)}
          hitSlop={4}
          style={({ pressed }) => [styles.editButton, pressed && { opacity: 0.5 }]}
        >
          <Text
            style={[styles.editText, { color: color.link }]}
            maxFontSizeMultiplier={MAX_TEXT_SCALE}
          >
            {editing ? "Done" : "Edit"}
          </Text>
        </Pressable>
      </View>
      {inspectionRows.length ? (
        <InspectionChecklist
          job={job}
          rows={inspectionRows}
          photos={questionPhotos}
          editing={editing}
        />
      ) : null}
      {SECTIONS.map((section) => {
        const items = insp.components
          .filter((c) => (typeOf(c)?.section ?? "other") === section && typeOf(c))
          .sort(
            (a, b) =>
              (typeOf(a)?.sort_order ?? 0) - (typeOf(b)?.sort_order ?? 0) ||
              a.sort_order - b.sort_order,
          );
        if (items.length === 0) return null;
        return (
          <ChecklistGroup
            key={section}
            job={job}
            section={section}
            items={items.map((c) => ({ component: c, type: typeOf(c)! }))}
            photos={photos}
            editing={editing}
          />
        );
      })}
      {addOptions.length ? (
        <View style={styles.addRow}>
          <Select
            label="Add an item"
            options={addOptions}
            value={adding}
            onChange={setAdding}
            style={{ flex: 1 }}
          />
          <Button
            title="Add"
            kind="secondary"
            disabled={!adding}
            onPress={add}
            style={{ alignSelf: "flex-end" }}
          />
        </View>
      ) : null}
    </View>
  );
}

/** One section as a grouped block that folds: open while it has items to do. */
function ChecklistGroup({
  job,
  section,
  items,
  photos,
  editing,
}: {
  job: Job;
  section: ChecklistSection;
  items: { component: JobComponent; type: ComponentType }[];
  photos: Map<string, number>;
  editing: boolean;
}) {
  const { services, user } = useSession();
  const insp = useJobInspection(job.company_id, job.id);
  const rows = items.map((i) => ({ ...i, result: insp.resultByComponent.get(i.component.id) }));
  const summary = checklistSectionSummary(rows, section === "service");
  const [folded, setOpen] = useState(summary.open);
  // Editing opens every section, so each item shows its Remove button.
  const open = folded || editing;
  const [turn] = useState(() => new Animated.Value(summary.open ? 1 : 0));
  useEffect(() => {
    Animated.timing(turn, { toValue: open ? 1 : 0, duration: 200, useNativeDriver: true }).start();
  }, [open, turn]);
  const title = CHECKLIST_SECTION_LABELS[section];
  const toDo = rows.filter((r) => currentVerdict(r.result) === null);
  // Mark Remaining's Undo (owner, 2026-10-20): "Marked N" and Undo for 5 seconds, in its place.
  const undo = useUndoWindow();
  // Touch and hold an item for its answers (gestures spec section 12).
  const hold = useRowMenu();
  const results = useRef(insp.resultByComponent);
  useEffect(() => {
    results.current = insp.resultByComponent;
  });
  const tone =
    summary.tone === "pass"
      ? color.pass
      : summary.tone === "fail"
        ? color.fail
        : summary.tone === "warning"
          ? color.warning
          : color.textMuted;

  function markRest() {
    const marked = toDo.map((r) => r.component.id);
    services.sync.batch(() => {
      for (const r of toDo)
        saveChecklistResult(
          services.sync,
          job.company_id,
          job.id,
          r.component.id,
          r.result,
          verdictValues("ok", user?.id ?? null),
        );
    });
    haptics.success();
    // Undo clears what it marked, back to To do (not an item answered again since).
    undo.start(`Marked ${marked.length}`, () =>
      services.sync.batch(() => {
        for (const id of marksToUndo(marked, results.current))
          saveChecklistResult(
            services.sync,
            job.company_id,
            job.id,
            id,
            results.current.get(id),
            verdictValues(null, user?.id ?? null),
          );
      }),
    );
  }

  return (
    <View style={[styles.group, { backgroundColor: color.surface }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${title}, ${summary.text}`}
        onPress={() => setOpen(!folded)}
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
          {summary.text}
        </Text>
      </Pressable>
      {open ? (
        <>
          {rows.map((r) => (
            <View key={r.component.id}>
              <Hairline inset={0} />
              <ChecklistItem
                job={job}
                component={r.component}
                type={r.type}
                photos={photos.get(r.component.id) ?? 0}
                editing={editing}
                menu={hold}
              />
            </View>
          ))}
          {undo.shown ? (
            <>
              <Hairline inset={0} />
              <View style={styles.markRest}>
                <UndoRow text={undo.shown.text} onUndo={undo.undo} />
              </View>
            </>
          ) : toDo.length > 0 ? (
            <>
              <Hairline inset={0} />
              <Pressable
                accessibilityRole="button"
                onPress={markRest}
                style={({ pressed }) => [styles.markRest, pressed && { opacity: 0.5 }]}
              >
                <T style={{ color: color.link }}>
                  {markRemainingLabel(toDo.map((r) => r.type.answer))}
                </T>
              </Pressable>
            </>
          ) : null}
        </>
      ) : null}
      {hold.element}
    </View>
  );
}

function Hairline({ inset }: { inset: number }) {
  return (
    <View
      style={{
        height: StyleSheet.hairlineWidth,
        marginLeft: inset,
        backgroundColor: color.separator,
      }}
    />
  );
}

/** One item: its name (opens the item's screen), then its answers in a segmented control. */
function ChecklistItem({
  job,
  component,
  type: itemType,
  photos,
  editing,
  menu,
}: {
  job: Job;
  component: JobComponent;
  type: ComponentType;
  photos: number;
  editing: boolean;
  menu: RowMenu;
}) {
  const { services, user } = useSession();
  const insp = useJobInspection(job.company_id, job.id);
  const result = insp.resultByComponent.get(component.id);
  const verdict = currentVerdict(result);
  const options = verdictOptions(itemType);
  const needsWhere =
    itemType.answer !== "yes_no" && (verdict === "leaking" || verdict === "attention");
  const open = () => router.push(`/jobs/${job.id}/component/${component.id}`);

  function choose(v: Verdict | null) {
    saveChecklistResult(services.sync, job.company_id, job.id, component.id, result, {
      ...verdictValues(v, user?.id ?? null),
      ...(v === null || v === "ok" || v === "na" ? { location_text: null } : {}),
    });
  }
  function remove() {
    // A scheduled cleaning stays due on its plan, so it goes on the next visit.
    const ask = removeItemConfirm(component.label, !!component.plan_cleaning_id);
    confirmDestructive({
      title: ask.title,
      message: ask.message ?? undefined,
      confirm: ask.confirm,
      onConfirm: () => removeComponent(services.sync, job.company_id, component, result),
    });
  }

  const photoText = photos ? `${photos} photo${photos === 1 ? "" : "s"}` : null;

  if (editing) {
    return (
      <View style={styles.editItem}>
        <Text
          style={[styles.itemName, { flex: 1, color: color.text }]}
          maxFontSizeMultiplier={MAX_TEXT_SCALE}
        >
          {component.label}
        </Text>
        <Button
          title="Remove"
          kind="danger"
          accessibilityLabel={`Remove ${component.label}`}
          onPress={remove}
        />
      </View>
    );
  }

  const sub = [photoText, result?.method, result?.notes].filter(Boolean).join(" · ");
  // Swipe right for its first answer (Done, Not Leaking, No); touch and hold for every answer
  // and Not Done (gestures spec section 12). The answers under the name stay the visible way.
  const actions = checklistRowActions(options, verdict);
  const answer = (id: string) => {
    haptics.selection();
    choose(id === "clear" ? null : (id.slice("answer:".length) as Verdict));
  };
  const g = rowGestures(actions, answer, () => menu.open(component.label, actions.menu, answer));

  const itemView = (
    <View
      style={[styles.item, g.leading && { backgroundColor: color.surface }]}
      accessibilityActions={g.accessibilityActions}
      onAccessibilityAction={g.onAccessibilityAction}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityHint="Opens the item: method, notes, and photos"
        onPress={open}
        onLongPress={g.onLongPress}
        style={styles.name}
      >
        <Text
          style={[styles.itemName, { color: color.text }]}
          maxFontSizeMultiplier={MAX_TEXT_SCALE}
        >
          {component.label}
        </Text>
        {sub ? (
          <T variant="footnote" muted numberOfLines={1}>
            {sub}
          </T>
        ) : null}
      </Pressable>
      {/* The answers in one tap, full width, 44 tall; the chosen one again clears it. */}
      <Segmented
        compact
        accessibilityLabel={`${component.label}: ${
          verdict ? (options.find((o) => o.value === verdict)?.label ?? "To Do") : "To Do"
        }`}
        options={options.map((o) => ({ value: o.value as string, label: o.label }))}
        value={verdict}
        onChange={(v) => choose(v as Verdict)}
        onReselect={() => choose(null)}
      />
      {needsWhere && result ? (
        <WhereField
          item={component.label}
          value={result.location_text ?? ""}
          onSave={(where) =>
            saveWhere(services.sync, job.company_id, job.id, component.id, where || null)
          }
        />
      ) : null}
      {result?.status === "excluded" && result.exclusion_reason ? (
        <T variant="secondary" muted>
          {result.exclusion_reason}
        </T>
      ) : null}
    </View>
  );
  return g.leading ? <SwipeActions leading={g.leading}>{itemView}</SwipeActions> : itemView;
}

/**
 * "Where?" under a Leaking or Attention item, saved 1 second after typing stops and when it
 * loses focus or the screen is left (owner, 2026-10-20), with a short "Saved".
 */
function WhereField({
  item,
  value,
  onSave,
}: {
  item: string;
  value: string;
  onSave: (where: string) => void;
}) {
  const field = useAutosaveText(value, (v) => onSave(v.trim()));
  const [focused, setFocused] = useState(false);
  const noSwipe = useNoSwipe();
  return (
    <View style={{ gap: 2 }}>
      <TextInput
        {...noSwipe}
        accessibilityLabel={`Where: ${item}`}
        value={field.value}
        onChangeText={field.onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          field.onBlur();
        }}
        placeholder="Where? Under the deck, at the throat…"
        placeholderTextColor={color.placeholder}
        maxFontSizeMultiplier={MAX_TEXT_SCALE}
        style={[
          styles.where,
          { backgroundColor: color.bg, borderColor: color.controlBorder, color: color.text },
          focused && { borderColor: color.focus, borderWidth: 2 },
        ]}
      />
      {field.justSaved ? (
        <T variant="footnote" muted>
          Saved
        </T>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: space["3"] },
  group: { borderRadius: shape.grouped, overflow: "hidden" },
  groupHead: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: space["3"],
    paddingHorizontal: space["4"],
  },
  summary: { fontFamily: font.displaySemiBold, fontSize: 15, lineHeight: 20 },
  item: { paddingHorizontal: space["4"], paddingVertical: space["2"], gap: space["2"] },
  name: { minHeight: minTap, justifyContent: "center" },
  itemName: { ...face.medium, fontSize: 17, lineHeight: 21 },
  where: {
    minHeight: minTap,
    borderWidth: 1,
    borderRadius: shape.field,
    paddingHorizontal: space["3"],
    paddingVertical: space["2"],
    ...face.regular,
    fontSize: 17,
  },
  editRow: { flexDirection: "row", justifyContent: "flex-end", marginBottom: -space["1"] },
  editButton: { minHeight: minTap, justifyContent: "center", paddingHorizontal: space["2"] },
  editText: { ...face.semiBold, fontSize: 17, lineHeight: 22 },
  editItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: space["3"],
    minHeight: minTap,
    paddingHorizontal: space["4"],
    paddingVertical: space["1"],
  },
  markRest: { minHeight: minTap, justifyContent: "center", paddingHorizontal: space["4"] },
  addRow: { flexDirection: "row", alignItems: "flex-end", gap: space["3"] },
});
