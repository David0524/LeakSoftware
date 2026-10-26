import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import {
  ADD_ITEM_FIELD,
  ADD_ITEM_HINT,
  ADD_ITEM_LABEL,
  ADD_ITEM_PLACEHOLDER,
  ADD_ITEM_SAVE,
  ADD_ITEM_TITLE,
  CHECKLIST_SECTION_LABELS,
  CUSTOM_ITEM_MAX,
  INSPECTION_SECTIONS,
  checklistSectionSummary,
  componentApplies,
  customItemName,
  customItemType,
  isCustomItemType,
  markRemainingLabel,
  takesCustomItems,
  verdictIcon,
  type ChecklistSection,
  type ComponentType,
  type Job,
  type JobComponent,
  type Property,
} from "@leakbook/core";
import {
  addComponent,
  addCustomItem,
  checklistJobType,
  createChecklist,
  saveChecklistResult,
  saveWhere,
  useInspectionConfig,
  useJobInspection,
} from "../../data/inspection";
import { useJobMedia } from "../../data/media";
import { useSession } from "../../state/session";
import { Button, Field, T } from "../../ui/components";
import { ModalSheet, useUnsavedChanges } from "../../ui/ModalSheet";
import { haptic, haptics } from "../../ui/haptics";
import { Select } from "../../ui/Select";
import { useNoSwipe } from "../../ui/SwipeNav";
import { removeChecklistItem } from "./remove";
import { checklistRowActions } from "../../lib/rowActions";
import { rowGestures, useRowMenu, type RowMenu } from "../../ui/RowMenu";
import { SwipeActions } from "../../ui/SwipeRow";
import { useAutosaveText } from "../../ui/useAutosave";
import { color, face, font, MAX_TEXT_SCALE, minTap, shape, space } from "../../ui/theme";
import { WebIcon } from "../../ui/WebIcon";
import { AnswerIconButtons, ItemDetailsButton } from "./AnswerControls";
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
const TYPE_NEW = "type-new";

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
 * each item's answers in one tap (owner, 2026-10-20; as icons on its line since 2026-10-22;
 * tapping the chosen answer again clears it), "Where" under leaks, Mark Remaining (no Undo after it, owner 2026-10-22),
 * then Add an item. Remove is behind Edit. Each item is one line: its name, its answers as
 * icons, and "›" for its own screen (method, notes, photos; owner, 2026-10-22). Works offline.
 */
export function ChecklistTab({ job, property }: { job: Job; property?: Property }) {
  const { services } = useSession();
  const config = useInspectionConfig(job.company_id);
  const insp = useJobInspection(job.company_id, job.id);
  const media = useJobMedia(job.company_id, job.id);
  const [adding, setAdding] = useState<string | null>(null);
  const [typing, setTyping] = useState(false);
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
        .filter((t): t is ComponentType => Boolean(t?.allows_multiple) && !isCustomItemType(t))
        .map((t) => [t.id, t]),
    ).values(),
  ];
  const addOptions = [
    ...repeatable.map((t) => ({ value: `${ADD_ANOTHER}${t.id}`, label: `Another ${t.name}` })),
    ...addable.map((t) => ({ value: t.id, label: t.name })),
  ];

  // Add Item: a name typed in for this job only (owner, 2026-10-26), on a leak detection or
  // visit checklist, when the shop has the hidden stand-in type.
  const customType = takesCustomItems(job.type)
    ? customItemType(
        [...config.componentTypeById.values()],
        kind === "maintenance" ? "maintenance" : "detection",
      )
    : undefined;

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
      {addOptions.length || customType ? (
        <View style={styles.addRow}>
          {/* "Type a New Item…" is the last choice: it opens the name sheet at once. */}
          <Select
            label="Add an item"
            options={
              customType
                ? [...addOptions, { value: TYPE_NEW, label: `${ADD_ITEM_LABEL}…` }]
                : addOptions
            }
            value={adding}
            onChange={(v) => {
              if (v === TYPE_NEW) setTyping(true);
              else setAdding(v);
            }}
            style={{ flex: 1 }}
          />
          {addOptions.length ? (
            <Button
              title="Add"
              kind="secondary"
              disabled={!adding}
              onPress={add}
              style={{ alignSelf: "flex-end" }}
            />
          ) : null}
        </View>
      ) : null}
      {customType ? (
        <>
          <ModalSheet visible={typing} onClose={() => setTyping(false)} title={ADD_ITEM_TITLE}>
            {typing ? (
              <AddItemForm
                onAdd={(name) => {
                  addCustomItem(
                    services.sync,
                    job.company_id,
                    job.id,
                    customType,
                    insp.components,
                    name,
                  );
                  setTyping(false);
                  haptics.success();
                }}
              />
            ) : null}
          </ModalSheet>
        </>
      ) : null}
    </View>
  );
}

/** The New Item sheet's form: one name, for this job only. */
function AddItemForm({ onAdd }: { onAdd: (name: string) => void }) {
  const [name, setName] = useState("");
  const typed = customItemName(name);
  useUnsavedChanges(name.trim() !== "");
  return (
    <View style={{ gap: space["4"] }}>
      <Field
        label={ADD_ITEM_FIELD}
        hint={ADD_ITEM_HINT}
        value={name}
        onChangeText={setName}
        placeholder={ADD_ITEM_PLACEHOLDER}
        maxLength={CUSTOM_ITEM_MAX}
        autoFocus
        autoCapitalize="sentences"
        returnKeyType="done"
        onSubmitEditing={() => typed && onAdd(typed)}
      />
      <Button title={ADD_ITEM_SAVE} wide disabled={!typed} onPress={() => typed && onAdd(typed)} />
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
  // Touch and hold an item for its answers (gestures spec section 12).
  const hold = useRowMenu();
  const tone =
    summary.tone === "pass"
      ? color.pass
      : summary.tone === "fail"
        ? color.fail
        : summary.tone === "warning"
          ? color.warning
          : color.textMuted;

  function markRest() {
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
          {/* No "Marked N" and Undo after Mark Remaining (owner, 2026-10-22): each item's
              answer changes it back. */}
          {toDo.length > 0 ? (
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

/**
 * One item on one line (owner, 2026-10-22): its name, its answers as icon buttons (one tap;
 * the chosen one again clears it), and "›" for the item's screen.
 */
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
  // Removed at once, with Undo for five seconds (owner, 2026-10-26), not asked first. A
  // scheduled cleaning stays due on its plan, so it goes on the next visit.
  function remove() {
    removeChecklistItem(services.sync, job.company_id, component, result);
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

  // The chosen answer's word first, so the icons are learnable ("Leaking · 1 photo").
  const answerWord = verdict ? options.find((o) => o.value === verdict)?.label : null;
  const sub = [answerWord, photoText, result?.method, result?.notes].filter(Boolean).join(" · ");
  // Swipe right for its first answer (Done, Not Leaking, No); touch and hold for every answer
  // and Not Done (gestures spec section 12). The answers under the name stay the visible way.
  const actions = checklistRowActions(options, verdict);
  const answer = (id: string) => {
    const v = id === "clear" ? null : (id.slice("answer:".length) as Verdict);
    if (v === "ok" && verdict !== "ok") haptic("checklistItemDone");
    else haptics.selection();
    choose(v);
  };
  const g = rowGestures(actions, answer, () => menu.open(component.label, actions.menu, answer));

  const itemView = (
    <View
      style={[styles.item, g.leading && { backgroundColor: color.surface }]}
      accessibilityActions={g.accessibilityActions}
      onAccessibilityAction={g.onAccessibilityAction}
    >
      {/* One line (owner, 2026-10-22): the name, which opens nothing (tapping it opened the
          item by accident), the answers as icons, one tap each, and "›" for the item. */}
      <View style={styles.line}>
        {/* Touch and hold for every answer and Not Done (gestures spec section 12). */}
        <Pressable accessible={false} onLongPress={g.onLongPress} style={styles.name}>
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
        <AnswerIconButtons
          itemLabel={component.label}
          choices={options.map((o) => ({
            label: o.label,
            icon: verdictIcon(itemType.answer, o.value),
            chosen: verdict === o.value,
            done: o.value === "ok",
            onPress: () => choose(verdict === o.value ? null : o.value),
          }))}
        />
        <ItemDetailsButton itemLabel={component.label} onPress={open} />
      </View>
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
  item: {
    paddingLeft: space["4"],
    paddingRight: space["1"],
    paddingVertical: space["1"],
    gap: space["1"],
  },
  line: { flexDirection: "row", alignItems: "center", gap: space["1"] },
  name: { flex: 1, minHeight: minTap, justifyContent: "center" },
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
