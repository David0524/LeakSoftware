import { useMemo, useState, type ReactNode } from "react";
import {
  InteractionManager,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import {
  estimateDriveMinutes,
  suggestServiceDays,
  workDay,
  type Company,
  type DaySuggestion,
} from "@leakbook/core";
import { planContext, type TeamMember } from "../../data/schedule";
import { savePlanDays, useRoutePlans } from "../../data/serviceRoutes";
import type { BannerNote } from "../../lib/resultBanner";
import { routePlanRowActions } from "../../lib/rowActions";
import {
  PUT_BACK,
  SUGGEST_HELP,
  WEEKDAY_NAMES,
  WEEKDAY_SHORT,
  customersToAdd,
  customersWord,
  keptMessage,
  leftOutNote,
  moveHint,
  moveWrite,
  movedMessage,
  nothingSuggested,
  rebuildPlans,
  repeatNote,
  searchCards,
  sortDays,
  undoRow,
  type PlanUndo,
  type PlanWrite,
  type RoutePlanCard,
} from "../../lib/serviceRoutes";
import { Button, Card, Group, ListRow, SearchField, Segmented, T } from "../../ui/components";
import { Grip } from "../../ui/Grip";
import { haptics } from "../../ui/haptics";
import { ModalSheet } from "../../ui/ModalSheet";
import { AddressLine, NotOnMapTag } from "../../ui/NotOnMap";
import { useRowMenu } from "../../ui/RowMenu";
import { TechDot } from "../../ui/TechDot";
import { WebIcon } from "../../ui/WebIcon";
import { color, face, gutter, MAX_TEXT_SCALE, minTap, space, type } from "../../ui/theme";
import { useDragHover, useDragSource } from "./ScheduleDrag";

// Customers to Add on Schedule › Week (owner, 2026-10-20: "On routes, you can't optimize or
// rearrange placement … Let's just build that all into Week"; docs/design/2026-10-20-team-week.md
// sections 6 and 8): maintenance plans nobody services yet, as a tray above the board like
// Needs a Time. The whole tile drags (grip included) onto a tech's day, which puts the plan on
// that weekday with that tech; a tap opens the same choice as a sheet (Day and Tech), the
// visible way to do it. Suggest Days proposes a day for each and saves nothing until Keep.
// Every change saves through the sync layer and has Undo; the server re-makes each plan's
// coming visits when the change syncs (app.service_plan_changed).

interface Tech {
  id: string;
  name: string;
  color?: string | null;
}

interface Suggested {
  list: DaySuggestion[];
  left: string[];
  asked: RoutePlanCard[];
}

/** Customers to Add's state, writes and sheets, for the Week board. */
export function useCustomersToAdd({
  company,
  team,
  me,
  show,
}: {
  company: Company;
  team: TeamMember[];
  me: string;
  show: (note: BannerNote) => void;
}) {
  const ctx = planContext(company);
  const today = ctx.today;
  const hours = workDay(ctx.settings);
  const workDays = ctx.settings.workDays;
  const { cards, rows } = useRoutePlans(company.id, today);
  const techs: Tech[] = useMemo(
    () =>
      team
        .filter((t) => t.status === "active")
        .sort((a, b) => Number(b.user_id === me) - Number(a.user_id === me))
        .map((t) => ({ id: t.user_id, name: t.name, color: t.color })),
    [team, me],
  );
  const techIds = useMemo(() => techs.map((t) => t.id), [techs]);
  const toAdd = useMemo(() => customersToAdd(cards, techIds), [cards, techIds]);
  const [moving, setMoving] = useState<RoutePlanCard | null>(null);
  const [sheet, setSheet] = useState<"all" | "suggest" | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [suggested, setSuggested] = useState<Suggested | null>(null);
  const fail = (message: string) => show({ tone: "error", message });

  function write(list: PlanWrite[]): string | null {
    try {
      savePlanDays(company.id, list);
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  }

  function undo(list: PlanUndo[]) {
    const error = write(list);
    if (error) return fail(error);
    haptics.light();
    show({ tone: "info", message: PUT_BACK });
  }

  /** Put a plan on a weekday (0 Sunday) with a tech, from today on. */
  function place(planId: string, day: number, tech: string) {
    const row = rows.get(planId);
    if (!row) return fail("This plan is gone. Pull down to refresh.");
    const error = write([moveWrite(row, { from: null, to: day, tech }, today)]);
    if (error) return fail(error);
    const before = [undoRow(row)];
    show({ tone: "success", message: movedMessage(day), undo: () => undo(before) });
  }

  /** A tile dropped on a tech's day: that date's weekday, that tech. */
  function drop(planId: string, tech: string, date: string) {
    place(planId, new Date(`${date}T12:00:00Z`).getUTCDay(), tech);
  }

  function suggest(ids: string[], forTechs: string[], asked: RoutePlanCard[]) {
    setSheet(null);
    setSuggesting(true);
    // "Suggesting…" first, then the work once that's on screen.
    requestAnimationFrame(() => {
      void InteractionManager.runAfterInteractions(() =>
        setTimeout(() => {
          try {
            const wanted = new Set(ids);
            const asPlan = (c: RoutePlanCard) => ({
              id: c.planId,
              techId: c.techId,
              days: c.days,
              location: c.location,
              durationMin: c.durationMin,
            });
            const r = suggestServiceDays({
              place: cards.filter((c) => wanted.has(c.planId)).map(asPlan),
              keep: cards.filter((c) => !wanted.has(c.planId)).map(asPlan),
              techs: forTechs.filter((id) => techIds.includes(id)),
              workDays,
              depot: ctx.depot,
              day: hours,
              drive: estimateDriveMinutes,
            });
            if (!r.suggestions.length)
              show({ tone: "info", message: nothingSuggested(leftOutNote(asked, r.left)) });
            else {
              haptics.selection();
              setSuggested({ list: r.suggestions, left: r.left, asked });
            }
          } finally {
            setSuggesting(false);
          }
        }, 0),
      );
    });
  }

  function keep() {
    const s = suggested;
    if (!s) return;
    const writes: PlanWrite[] = [];
    const before: PlanUndo[] = [];
    for (const x of s.list) {
      const row = rows.get(x.id);
      if (!row) continue;
      writes.push(moveWrite(row, { from: null, to: x.day, tech: x.techId }, today));
      before.push(undoRow(row));
    }
    setSuggested(null);
    const error = write(writes);
    if (error) return fail(error);
    show({ tone: "success", message: keptMessage(writes.length), undo: () => undo(before) });
  }

  // Touch and hold a tile: Change Day… and Change Tech…, both the tile's sheet.
  const rowMenu = useRowMenu();
  const menuFor = (p: RoutePlanCard) => () =>
    rowMenu.open(p.customer, routePlanRowActions(true).menu, () => setMoving(p));
  const suggestTech =
    techs.find((t) => t.id === me)?.id ??
    techs.find((t) => cards.some((c) => c.techId === t.id))?.id;

  const tray = (
    <CustomersToAddTray
      plans={toAdd}
      suggesting={suggesting}
      canSuggest={Boolean(suggestTech) && !suggested}
      onOpen={setMoving}
      onMenu={menuFor}
      onSuggest={() => setSheet("suggest")}
      onSeeAll={() => setSheet("all")}
    />
  );

  const sheets: ReactNode = (
    <>
      {rowMenu.element}
      <AddSheet
        open={sheet === "all"}
        plans={toAdd}
        onClose={() => setSheet(null)}
        onOpen={(p) => {
          setSheet(null);
          setMoving(p);
        }}
      />
      {sheet === "suggest" && suggestTech ? (
        <SuggestSheet
          tech={techs.find((t) => t.id === suggestTech)!}
          techs={techs}
          toAdd={toAdd}
          rebuild={rebuildPlans(cards, suggestTech)}
          onClose={() => setSheet(null)}
          onSuggest={suggest}
        />
      ) : null}
      {suggested ? (
        <SuggestedSheet
          suggested={suggested}
          cards={cards}
          techs={techs}
          onCancel={() => {
            haptics.light();
            setSuggested(null);
          }}
          onKeep={keep}
        />
      ) : null}
      {moving ? (
        <PlanDaySheet
          plan={moving}
          techs={techs}
          tech={moving.techId ?? suggestTech ?? null}
          workDays={workDays}
          onClose={() => setMoving(null)}
          onMove={(to, techId) => {
            const p = moving;
            setMoving(null);
            place(p.planId, to, techId);
          }}
        />
      ) : null}
    </>
  );

  return { toAdd, tray, sheets, drop, cards };
}

// ---------------------------------------------------------------------------
// The tray
// ---------------------------------------------------------------------------

/** Above the board, as Needs a Time: the plans in one row that scrolls sideways. */
function CustomersToAddTray({
  plans,
  suggesting,
  canSuggest,
  onOpen,
  onMenu,
  onSuggest,
  onSeeAll,
}: {
  plans: RoutePlanCard[];
  suggesting: boolean;
  canSuggest: boolean;
  onOpen: (p: RoutePlanCard) => void;
  onMenu: (p: RoutePlanCard) => () => void;
  onSuggest: () => void;
  onSeeAll: () => void;
}) {
  const { width } = useWindowDimensions();
  const tileWidth = Math.min(300, (width - gutter * 2) * 0.8);
  return (
    <Card padding={space["4"]}>
      <View style={styles.head}>
        <T variant="cardTitle" style={{ flex: 1 }}>
          Customers to Add{plans.length ? ` (${plans.length})` : ""}
        </T>
        {plans.length > 3 ? <Button kind="quiet" title="See All" onPress={onSeeAll} /> : null}
      </View>
      {plans.length === 0 ? (
        <T variant="secondary" muted>
          Every customer has a day.
        </T>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={tileWidth + space["3"]}
          decelerationRate="fast"
          style={{ marginHorizontal: -space["4"], marginTop: space["3"] }}
          contentContainerStyle={{ paddingHorizontal: space["4"], gap: space["3"] }}
        >
          {plans.map((p) => (
            <PlanTile
              key={p.planId}
              plan={p}
              width={tileWidth}
              onOpen={() => onOpen(p)}
              onMenu={onMenu(p)}
            />
          ))}
        </ScrollView>
      )}
      <View style={[{ marginTop: space["3"] }, !canSuggest && { opacity: 0.5 }]}>
        <Button
          kind="secondary"
          title={suggesting ? "Suggesting…" : "Suggest Days"}
          loading={suggesting}
          wide
          disabled={!canSuggest}
          onPress={onSuggest}
        />
      </View>
    </Card>
  );
}

/**
 * A customer to add. The whole tile is the drag handle, grip included (spec section 8): touch
 * and hold anywhere to pick it up and drop it on a tech's day; held and let go without moving,
 * it shows its menu; a tap opens its sheet.
 */
function PlanTile({
  plan: p,
  width,
  onOpen,
  onMenu,
}: {
  plan: RoutePlanCard;
  width: number;
  onOpen: () => void;
  onMenu: () => void;
}) {
  const hover = useDragHover();
  const { gesture, ref } = useDragSource(
    { id: p.planId, status: "scheduled", from: { kind: "plan" } },
    () => (
      <View style={[styles.clip, { backgroundColor: color.surface }]}>
        <PlanFace plan={p} grip />
      </View>
    ),
    onMenu,
  );
  const note = repeatNote(p);
  const label = [p.customer, p.address || null, !p.location ? "Not found on the map" : null, note]
    .filter(Boolean)
    .join(", ");
  return (
    <GestureDetector gesture={gesture}>
      <View
        ref={ref}
        collapsable={false}
        style={[
          styles.tile,
          { width, backgroundColor: color.well },
          hover.id === p.planId && { opacity: 0.35 },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityHint="Pick a day and a tech"
          accessibilityActions={[{ name: "menu", label: "Show Actions" }]}
          onAccessibilityAction={(e) => e.nativeEvent.actionName === "menu" && onMenu()}
          onPress={onOpen}
          android_ripple={{ color: color.ripple }}
          style={({ pressed }) => [styles.clip, pressed && { backgroundColor: color.rowPressed }]}
        >
          <PlanFace plan={p} grip />
        </Pressable>
      </View>
    </GestureDetector>
  );
}

/** What a tile shows: the name, address (warning when not on the map) and how often. */
function PlanFace({ plan: p, grip }: { plan: RoutePlanCard; grip: boolean }) {
  const note = repeatNote(p);
  return (
    <View style={styles.face}>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text
          numberOfLines={1}
          style={[type.body, face.semiBold, { color: color.text }]}
          maxFontSizeMultiplier={MAX_TEXT_SCALE}
        >
          {p.customer}
        </Text>
        {p.address ? (
          <AddressLine notOnMap={!p.location} lineHeight={20}>
            <T variant="secondary" muted numberOfLines={1}>
              {p.address}
            </T>
          </AddressLine>
        ) : !p.location ? (
          <NotOnMapTag lineHeight={20} />
        ) : null}
        {note ? (
          <Text
            style={[type.footnote, { color: color.textMuted }]}
            maxFontSizeMultiplier={MAX_TEXT_SCALE}
          >
            {note}
          </Text>
        ) : null}
      </View>
      {grip ? <Grip width={28} /> : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Sheets
// ---------------------------------------------------------------------------

function CheckMark({ on }: { on: boolean }) {
  return (
    <View style={!on && { opacity: 0 }}>
      <WebIcon name="check" size={20} color={color.link} strokeWidth={2.4} />
    </View>
  );
}

/** One choice in an iOS checklist: a title, a line under it, and a checkmark. */
function ChoiceRow({
  on,
  title,
  detail,
  dot,
  disabled,
  onPick,
}: {
  on: boolean;
  title: string;
  detail?: string;
  /** A tech's color key. */
  dot?: string | null;
  disabled?: boolean;
  onPick: () => void;
}) {
  return (
    <View style={disabled && { opacity: 0.5 }}>
      <ListRow
        accessibilityLabel={`${title}${detail ? `, ${detail}` : ""}${on ? ", selected" : ""}`}
        onPress={disabled ? undefined : onPick}
        chevron={false}
        leading={dot !== undefined ? <TechDot tech={dot} /> : undefined}
        trailing={<CheckMark on={on} />}
      >
        <T>{title}</T>
        {detail ? (
          <T variant="secondary" muted>
            {detail}
          </T>
        ) : null}
      </ListRow>
    </View>
  );
}

/** Every customer to add, with a search; a tap opens its sheet. */
function AddSheet({
  open,
  plans,
  onClose,
  onOpen,
}: {
  open: boolean;
  plans: RoutePlanCard[];
  onClose: () => void;
  onOpen: (p: RoutePlanCard) => void;
}) {
  const [query, setQuery] = useState("");
  const list = searchCards(plans, query);
  return (
    <ModalSheet visible={open} onClose={onClose} title="Customers to Add" cancel="Done">
      <SearchField
        value={query}
        onChangeText={setQuery}
        placeholder="Search"
        label="Search Customers to Add"
      />
      {list.length === 0 ? (
        <T muted>
          {plans.length
            ? `No customers to add match “${query.trim()}”.`
            : "Every customer has a day."}
        </T>
      ) : (
        <Group>
          {list.map((p) => (
            <ListRow
              key={p.planId}
              title={p.customer}
              subtitle={p.address || undefined}
              onPress={() => onOpen(p)}
            />
          ))}
        </Group>
      )}
    </ModalSheet>
  );
}

/** A plan's day (one of the shop's working days) and tech. */
function PlanDaySheet({
  plan: p,
  techs,
  tech,
  workDays,
  onClose,
  onMove,
}: {
  plan: RoutePlanCard;
  techs: Tech[];
  tech: string | null;
  workDays: number[];
  onClose: () => void;
  onMove: (to: number, tech: string) => void;
}) {
  const start = p.days[0] ?? workDays[0] ?? 1;
  const options = sortDays([...workDays, start]);
  const [day, setDay] = useState(options.includes(start) ? start : options[0]!);
  const [who, setWho] = useState(
    (p.techId && techs.some((t) => t.id === p.techId) ? p.techId : tech) ?? techs[0]?.id ?? "",
  );
  return (
    <ModalSheet visible onClose={onClose} title={`Add ${p.customer}`}>
      <View style={styles.center}>
        <AddressLine notOnMap={!p.location} lineHeight={20}>
          <T variant="secondary" muted style={{ textAlign: "center" }}>
            {p.address || "No address"}
          </T>
        </AddressLine>
      </View>
      <Segmented
        label="Day"
        options={options.map((d) => ({ value: String(d), label: WEEKDAY_SHORT[d] }))}
        value={String(day)}
        onChange={(v) => setDay(Number(v))}
        compact={options.length > 5}
      />
      {techs.length > 1 ? (
        <View style={{ gap: space["2"] }} accessibilityRole="radiogroup" accessibilityLabel="Tech">
          <T variant="bodyMedium">Tech</T>
          <Group separatorInset={space["4"] + 10 + space["3"]}>
            {techs.map((t) => (
              <ChoiceRow
                key={t.id}
                on={who === t.id}
                title={t.name}
                dot={t.color ?? null}
                onPick={() => setWho(t.id)}
              />
            ))}
          </Group>
        </View>
      ) : null}
      <T variant="secondary" muted style={styles.inset}>
        {moveHint(false, day)}
      </T>
      <Button
        title={`Add to ${WEEKDAY_NAMES[day]}`}
        wide
        disabled={!who}
        onPress={() => onMove(day, who)}
      />
    </ModalSheet>
  );
}

/** Suggest Days: for Customers to Add (one tech or everyone), or rebuild a tech's week. */
function SuggestSheet({
  tech,
  techs,
  toAdd,
  rebuild,
  onClose,
  onSuggest,
}: {
  tech: Tech;
  techs: Tech[];
  toAdd: RoutePlanCard[];
  rebuild: RoutePlanCard[];
  onClose: () => void;
  onSuggest: (plans: string[], techs: string[], asked: RoutePlanCard[]) => void;
}) {
  const [what, setWhat] = useState<"add" | "rebuild">(
    toAdd.length || !rebuild.length ? "add" : "rebuild",
  );
  const [everyone, setEveryone] = useState(techs.length > 1);
  const plans = what === "add" ? toAdd : rebuild;
  return (
    <ModalSheet visible onClose={onClose} title="Suggest Days">
      <View
        style={{ gap: space["2"] }}
        accessibilityRole="radiogroup"
        accessibilityLabel="Suggest for"
      >
        <T variant="secondary" muted style={styles.inset}>
          Suggest for
        </T>
        <Group>
          <ChoiceRow
            on={what === "add"}
            title={`Customers to Add (${toAdd.length})`}
            detail="Puts each on a day near its neighbors"
            disabled={!toAdd.length}
            onPick={() => setWhat("add")}
          />
          <ChoiceRow
            on={what === "rebuild"}
            title={`Rebuild ${tech.name}’s Week`}
            detail={`${customersWord(rebuild.length)} on one day a week, planned again from scratch`}
            disabled={!rebuild.length}
            onPick={() => setWhat("rebuild")}
          />
        </Group>
      </View>
      {what === "add" && techs.length > 1 ? (
        <View
          style={{ gap: space["2"] }}
          accessibilityRole="radiogroup"
          accessibilityLabel="Spread across"
        >
          <T variant="secondary" muted style={styles.inset}>
            Spread across
          </T>
          <Group>
            <ChoiceRow
              on={!everyone}
              title={tech.name}
              dot={tech.color ?? null}
              onPick={() => setEveryone(false)}
            />
            <ChoiceRow
              on={everyone}
              title="Everyone"
              detail={`${techs.length} techs`}
              onPick={() => setEveryone(true)}
            />
          </Group>
        </View>
      ) : null}
      <T variant="secondary" muted style={styles.inset}>
        {SUGGEST_HELP}
      </T>
      <Button
        title="Suggest Days"
        wide
        disabled={!plans.length}
        onPress={() =>
          onSuggest(
            plans.map((p) => p.planId),
            what === "add" && everyone ? techs.map((t) => t.id) : [tech.id],
            plans,
          )
        }
      />
    </ModalSheet>
  );
}

/** The suggestions, each customer's new day and tech, then Keep (nothing is saved before). */
function SuggestedSheet({
  suggested,
  cards,
  techs,
  onCancel,
  onKeep,
}: {
  suggested: Suggested;
  cards: RoutePlanCard[];
  techs: Tech[];
  onCancel: () => void;
  onKeep: () => void;
}) {
  const byId = new Map(cards.map((c) => [c.planId, c]));
  const note = leftOutNote(suggested.asked, suggested.left);
  // Monday first, as the schedule's weeks are, then by name.
  const rank = (d: number) => (d + 6) % 7;
  const list = [...suggested.list].sort(
    (a, b) =>
      rank(a.day) - rank(b.day) ||
      (byId.get(a.id)?.customer ?? "").localeCompare(byId.get(b.id)?.customer ?? ""),
  );
  return (
    <ModalSheet visible onClose={onCancel} title="Suggested Days">
      <T variant="secondary" muted style={styles.inset}>
        {customersWord(list.length)}
        {note ? ` · ${note}` : ""}
      </T>
      <Group separatorInset={space["4"] + 10 + space["3"]}>
        {list.map((s) => {
          const t = techs.find((x) => x.id === s.techId);
          return (
            <ListRow
              key={s.id}
              leading={<TechDot tech={t?.color ?? null} />}
              title={byId.get(s.id)?.customer ?? "Customer"}
              subtitle={`${WEEKDAY_NAMES[s.day]}s with ${t?.name ?? "a tech"}`}
            />
          );
        })}
      </Group>
      <View style={styles.keepRow}>
        <View style={{ flex: 1 }}>
          <Button kind="secondary" title="Cancel" wide onPress={onCancel} />
        </View>
        <View style={{ flex: 1 }}>
          <Button title="Keep" wide onPress={onKeep} />
        </View>
      </View>
    </ModalSheet>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: space["2"] },
  tile: { borderRadius: 16 },
  clip: { borderRadius: 16, overflow: "hidden" },
  face: {
    flexDirection: "row",
    alignItems: "center",
    gap: space["2"],
    minHeight: minTap + 12,
    paddingLeft: space["3"],
    paddingRight: 4,
    paddingVertical: space["2"],
  },
  center: { alignItems: "center" },
  inset: { paddingHorizontal: space["4"] },
  keepRow: { flexDirection: "row", gap: space["2"] },
});
