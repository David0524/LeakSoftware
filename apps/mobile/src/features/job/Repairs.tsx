import { useState } from "react";
import { StyleSheet, View } from "react-native";
import {
  EMPTY_REPAIR_DRAFT,
  REPAIR_CUSTOM,
  REPAIR_LABELS,
  checkRepairDraft,
  formatCents,
  pickRepair,
  repairsTotal,
  type PriceBookItem,
  type RepairCheck,
  type RepairDraft,
  type RepairItem,
  type RepairJob,
} from "@leakbook/core";
import { addRepair, removeRepair, useJobRepairs } from "../../data/repairs";
import { removalFor } from "../../lib/removal";
import { announceRemoved } from "../../lib/removedBanner";
import { Button, Field, Group, ListRow, RoundButton, Section, T } from "../../ui/components";
import { haptics } from "../../ui/haptics";
import { ModalSheet, UnsavedWhen } from "../../ui/ModalSheet";
import { Select, useMenu } from "../../ui/Select";
import { WebIcon } from "../../ui/WebIcon";
import { color, space, tabular } from "../../ui/theme";

// A repair job's repairs (owner, 2026-10-22: "On repair jobs, (in the intake and actually
// working the job) we need a button to 'add additional repair'"; packages/core/src/repairs.ts).
// The same words and rules as the website and the iPhone app.

/** Price book items a repair can be picked from: active ones, in the price book's order. */
export function repairItemsOf(priceBook: PriceBookItem[], booking = false): RepairItem[] {
  const live = priceBook
    .filter((i) => i.active && !i.deleted_at)
    .sort((a, b) => a.sort_order - b.sort_order);
  // New Job offers the items the owner picked for booking a repair, or every one (2026-10-19).
  const picked = booking
    ? live.filter((i) => (i as { on_repair_call?: boolean }).on_repair_call)
    : [];
  return (picked.length ? picked : live).map((i) => ({
    id: i.id,
    name: i.name,
    cents: i.price_cents,
  }));
}

function pickOptions(items: readonly RepairItem[]) {
  return [
    ...items.map((i) => ({ value: i.id, label: `${i.name} (${formatCents(i.cents)})` })),
    { value: REPAIR_CUSTOM, label: REPAIR_LABELS.custom },
  ];
}

/** One repair's fields: the price book menu (or Something else, typed) and its price. */
export function RepairFields({
  draft,
  onChange,
  items,
  label,
  errors,
}: {
  draft: RepairDraft;
  onChange: (d: RepairDraft) => void;
  items: readonly RepairItem[];
  /** The menu's label: "What do they need?" first, then "Repair". */
  label: string;
  errors?: RepairCheck["errors"];
}) {
  const typed = !items.length || draft.pick === REPAIR_CUSTOM;
  return (
    <>
      {items.length ? (
        <Select
          label={label}
          placeholder={REPAIR_LABELS.pick}
          options={pickOptions(items)}
          value={draft.pick || null}
          onChange={(pick) => onChange(pickRepair(draft, pick, items))}
        />
      ) : null}
      {typed ? (
        <Field
          label={items.length ? REPAIR_LABELS.description : label}
          value={draft.description}
          onChangeText={(description) => onChange({ ...draft, description })}
          maxLength={200}
          error={errors?.description}
        />
      ) : null}
      <Field
        label={REPAIR_LABELS.price}
        value={draft.price}
        onChangeText={(price) => onChange({ ...draft, price })}
        keyboardType="decimal-pad"
        error={errors?.price}
      />
    </>
  );
}

/** Add Additional Repair, as a full-width tinted button with a plus. */
export function AddRepairButton({ onPress }: { onPress: () => void }) {
  return <Button title={REPAIR_LABELS.add} icon="plus" kind="secondary" onPress={onPress} />;
}

/** The job's Add Additional Repair sheet. */
function AddRepairSheet({
  job,
  items,
  visible,
  onClose,
}: {
  job: RepairJob & { company_id: string };
  items: RepairItem[];
  visible: boolean;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<RepairDraft>(EMPTY_REPAIR_DRAFT);
  const [errors, setErrors] = useState<RepairCheck["errors"]>({});
  const close = () => {
    setDraft(EMPTY_REPAIR_DRAFT);
    setErrors({});
    onClose();
  };
  function save() {
    const checked = checkRepairDraft(draft, items, true);
    setErrors(checked.errors);
    if (!checked.repair) return;
    addRepair(job, checked.repair);
    haptics.success();
    close();
  }
  return (
    <ModalSheet
      visible={visible}
      onClose={close}
      title={REPAIR_LABELS.add}
      done={{ label: "Add", onPress: save }}
    >
      <View style={styles.sheet}>
        <UnsavedWhen dirty={JSON.stringify(draft) !== JSON.stringify(EMPTY_REPAIR_DRAFT)} />
        <RepairFields
          draft={draft}
          onChange={setDraft}
          items={items}
          label={REPAIR_LABELS.item}
          errors={errors}
        />
        {errors.description && items.length && draft.pick !== REPAIR_CUSTOM ? (
          <T style={{ color: color.fail }}>{errors.description}</T>
        ) : null}
        <Button title={REPAIR_LABELS.save} onPress={save} />
      </View>
    </ModalSheet>
  );
}

/**
 * A repair job's Repairs on Details: each repair and its price, the total, and Add Additional
 * Repair. Swipe a repair left to remove it, or use its "⋯" button (always shown).
 */
export function JobRepairs({
  job,
  priceBook,
}: {
  job: RepairJob & { company_id: string };
  priceBook: PriceBookItem[];
}) {
  const lines = useJobRepairs(job);
  const [adding, setAdding] = useState(false);
  const menu = useMenu();
  const items = repairItemsOf(priceBook);
  // Removed at once, with Undo for five seconds (owner, 2026-10-26), not asked first.
  const remove = (id: string) => {
    const undo = removeRepair(job, id);
    if (undo) announceRemoved(removalFor("repair", undo, REPAIR_LABELS.removeMessage));
  };
  return (
    <Section title={REPAIR_LABELS.section} footer={REPAIR_LABELS.footer}>
      <Group>
        {lines.map((l) => (
          <ListRow
            key={l.id}
            title={l.description}
            onDelete={() => remove(l.id)}
            deleteLabel={REPAIR_LABELS.remove}
            deleteAsks={false}
            trailing={
              <View style={styles.trailing}>
                <T muted style={tabular}>
                  {formatCents(l.price_cents)}
                </T>
                <RoundButton
                  icon="more"
                  label={`More for ${l.description}`}
                  onPress={() =>
                    menu.open({
                      title: l.description,
                      items: [
                        {
                          label: REPAIR_LABELS.remove,
                          destructive: true,
                          onPress: () => remove(l.id),
                        },
                      ],
                    })
                  }
                />
              </View>
            }
          />
        ))}
        {lines.length ? (
          <ListRow
            title={REPAIR_LABELS.total}
            detail={
              <T variant="bodyEmphasis" style={[tabular, styles.total]}>
                {formatCents(repairsTotal(lines))}
              </T>
            }
          />
        ) : (
          <ListRow subtitle={REPAIR_LABELS.empty} />
        )}
        <ListRow
          accessibilityRole="button"
          onPress={() => setAdding(true)}
          chevron={false}
          leading={<WebIcon name="plus" size={20} color={color.link} />}
          title={REPAIR_LABELS.add}
          tone="link"
        />
      </Group>
      <AddRepairSheet job={job} items={items} visible={adding} onClose={() => setAdding(false)} />
      {menu.element}
    </Section>
  );
}

const styles = StyleSheet.create({
  sheet: { gap: space[3], padding: space[4] },
  trailing: { flexDirection: "row", alignItems: "center", gap: space[2] },
  // Lines up with the prices above, which sit left of their "⋯" button.
  total: { marginRight: 44 + space[2] },
});
