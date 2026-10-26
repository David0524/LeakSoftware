import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, TextInput, View } from "react-native";
import {
  SEARCH_DEBOUNCE_MS,
  SEARCH_GROUP_TITLES,
  SEARCH_PLACEHOLDER,
  SEARCH_WORDS,
  noResultsText,
  normalizeSearch,
  recentFromHit,
  type RecentItem,
  type SearchGroupKey,
  type SearchHit,
} from "@leakbook/core";
import { useRows } from "../../data/hooks";
import { getServices } from "../../lib/services";
import {
  clearRecent,
  loadRecent,
  openPath,
  saveRecent,
  searchPhone,
  searchRecords,
  type LocalSearchRows,
} from "../../lib/shopSearch";
import { useCompany } from "../../state/session";
import { Chevron, Group, T } from "../../ui/components";
import { WebIcon } from "../../ui/WebIcon";
import { color, face, MAX_TEXT_SCALE, minTap, space, tint } from "../../ui/theme";

// One search across the shop (owner, 2026-10-20; docs/plans/search-and-activity.md section 1),
// as the phone website's (apps/web/src/components/shop-search.tsx PhoneSearch): the field under
// the Jobs large title, where iPhone apps put search. Focused and empty it shows Recent; typing
// shows the grouped results over the list (searched on this phone, so offline too); Cancel
// returns to the list.

export interface ShopSearchState {
  query: string;
  setQuery: (q: string) => void;
  focused: boolean;
  setFocused: (f: boolean) => void;
  group: SearchGroupKey | null;
  setGroup: (g: SearchGroupKey | null) => void;
  /** In use: the results take the list's place. */
  searching: boolean;
  cancel: () => void;
  input: React.RefObject<TextInput | null>;
}

export function useShopSearchState(): ShopSearchState {
  const [query, setQueryState] = useState("");
  const [focused, setFocused] = useState(false);
  const [group, setGroup] = useState<SearchGroupKey | null>(null);
  const input = useRef<TextInput>(null);
  return {
    query,
    setQuery: (q) => {
      setQueryState(q);
      setGroup(null);
    },
    focused,
    setFocused,
    group,
    setGroup,
    searching: focused || query.length > 0,
    cancel: () => {
      setQueryState("");
      setGroup(null);
      setFocused(false);
      input.current?.blur();
    },
    input,
  };
}

/** The iOS search field: filled, rounded, the magnifier inside, a clear button once typed in. */
export function ShopSearchField({
  search,
  placeholder = SEARCH_PLACEHOLDER,
}: {
  search: ShopSearchState;
  /** Jobs › Reports words it "Customer name or job number" (owner, 2026-10-25). */
  placeholder?: string;
}) {
  const { query, setQuery, setFocused, searching, cancel, input } = search;
  return (
    <View style={styles.fieldRow} accessibilityRole="search">
      <View style={[styles.field, { backgroundColor: tint(color.text, 0.06) }]}>
        <WebIcon name="search" size={18} color={color.textMuted} strokeWidth={2.2} />
        <TextInput
          ref={input}
          value={query}
          onChangeText={setQuery}
          onFocus={() => setFocused(true)}
          placeholder={placeholder}
          placeholderTextColor={color.placeholder}
          accessibilityLabel={SEARCH_WORDS.search}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
          spellCheck={false}
          maxFontSizeMultiplier={MAX_TEXT_SCALE}
          style={[styles.input, { color: color.text }]}
        />
        {query ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear Text"
            onPress={() => setQuery("")}
            style={styles.clear}
          >
            <WebIcon name="close" size={16} color={color.textMuted} strokeWidth={2} />
          </Pressable>
        ) : null}
      </View>
      {searching ? (
        <Pressable
          accessibilityRole="button"
          onPress={cancel}
          style={({ pressed }) => [styles.cancel, pressed && { opacity: 0.5 }]}
        >
          <T style={{ color: color.link }}>{SEARCH_WORDS.cancel}</T>
        </Pressable>
      ) : null}
    </View>
  );
}

/** The query after it stops changing for 200 ms. */
function useDebounced(value: string): string {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [value]);
  return settled;
}

/** The phone's rows as search records (they already follow who may see what). */
function usePhoneRecords() {
  const company = useCompany();
  const customers = useRows<LocalSearchRows["customers"][number]>("customer", company.id);
  const properties = useRows<LocalSearchRows["properties"][number]>("property", company.id);
  const jobs = useRows<LocalSearchRows["jobs"][number]>("job", company.id);
  const quotes = useRows<LocalSearchRows["quotes"][number]>("quote", company.id);
  const invoices = useRows<LocalSearchRows["invoices"][number]>("invoice", company.id);
  return useMemo(
    () => searchRecords({ customers, properties, jobs, quotes, invoices }),
    [customers, properties, jobs, quotes, invoices],
  );
}

/** What to show for the query: Recent, the results, or nothing found. */
export function ShopSearchResults({ search }: { search: ShopSearchState }) {
  const company = useCompany();
  const { query, group, setGroup, setFocused, input } = search;
  const records = usePhoneRecords();
  const settled = useDebounced(query);
  const ready = normalizeSearch(query).ready;
  const results = useMemo(
    () =>
      normalizeSearch(settled).ready
        ? searchPhone(settled, records, { now: new Date(), timeZone: company.timezone, group })
        : null,
    [settled, records, company.timezone, group],
  );
  const kv = getServices().kv;
  const [recent, setRecent] = useState<RecentItem[]>(() => loadRecent(kv));
  // Back from a customer or job: it's first under Recent now.
  useFocusEffect(useCallback(() => setRecent(loadRecent(kv)), [kv]));

  const open = (path: string) => {
    setFocused(false);
    input.current?.blur();
    router.push(path as never);
  };
  const openHit = (hit: SearchHit) => {
    if (!hit.open) return;
    const item = recentFromHit(hit);
    if (item) setRecent(saveRecent(kv, item));
    open(openPath(hit.open));
  };

  if (!ready) {
    return (
      <View style={styles.section}>
        <View style={styles.head}>
          <T variant="sectionLabel">{SEARCH_WORDS.recent}</T>
          {recent.length ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear Recent"
              onPress={() => {
                clearRecent(kv);
                setRecent([]);
              }}
              style={styles.headButton}
            >
              <T variant="secondary" style={{ color: color.link }}>
                {SEARCH_WORDS.clear}
              </T>
            </Pressable>
          ) : null}
        </View>
        {recent.length ? (
          <Group>
            {recent.map((r) => (
              <ResultRow
                key={`${r.kind}:${r.id}`}
                title={r.title}
                detail={r.detail}
                strong={false}
                onPress={() => {
                  setRecent(saveRecent(kv, r));
                  open(openPath(r.open));
                }}
              />
            ))}
          </Group>
        ) : (
          <T variant="secondary" muted>
            {SEARCH_WORDS.noRecent}
          </T>
        )}
      </View>
    );
  }

  if (!results) return null;
  if (results.empty) {
    const none = noResultsText(query);
    return (
      <View style={styles.none} accessibilityLiveRegion="polite">
        <T variant="bodyEmphasis" style={styles.center}>
          {none.title}
        </T>
        <T variant="secondary" muted style={styles.center}>
          {none.hint}
        </T>
      </View>
    );
  }
  return (
    <View style={styles.groups}>
      {group ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => setGroup(null)}
          style={({ pressed }) => [styles.back, pressed && { opacity: 0.5 }]}
        >
          <T style={{ color: color.link }}>‹ {SEARCH_WORDS.allResults}</T>
        </Pressable>
      ) : null}
      {results.groups.map((g) => (
        <View key={g.key} style={styles.section}>
          <View style={styles.head}>
            <T variant="sectionLabel">{SEARCH_GROUP_TITLES[g.key]}</T>
            {g.more && !group ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${SEARCH_WORDS.seeAll} ${g.title} (${g.total})`}
                onPress={() => setGroup(g.key)}
                style={styles.headButton}
              >
                <T variant="secondary" style={{ color: color.link }}>
                  {SEARCH_WORDS.seeAll}
                </T>
              </Pressable>
            ) : null}
          </View>
          <Group>
            {g.hits.map((h) => (
              <ResultRow
                key={`${h.kind}:${h.id}`}
                title={h.title}
                detail={h.detail}
                meta={h.meta}
                onPress={h.open ? () => openHit(h) : undefined}
              />
            ))}
          </Group>
        </View>
      ))}
    </View>
  );
}

function ResultRow({
  title,
  detail,
  meta,
  strong = true,
  onPress,
}: {
  title: string;
  detail: string | null;
  meta?: string | null;
  /** Results are bold; Recent entries plain, as on the website. */
  strong?: boolean;
  onPress?: () => void;
}) {
  const body = (
    <>
      <View style={styles.rowBody}>
        <T variant={strong ? "bodyEmphasis" : "body"} numberOfLines={1}>
          {title}
        </T>
        {detail ? (
          <T variant="secondary" muted numberOfLines={1}>
            {detail}
          </T>
        ) : null}
      </View>
      {meta ? (
        <T variant="secondary" muted>
          {meta}
        </T>
      ) : null}
      {onPress ? <Chevron /> : null}
    </>
  );
  const label = [title, detail, meta].filter(Boolean).join(", ");
  if (!onPress)
    return (
      <View style={styles.row} accessible accessibilityLabel={label}>
        {body}
      </View>
    );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      android_ripple={{ color: color.ripple }}
      style={({ pressed }) => [
        styles.row,
        pressed && Platform.OS !== "android" && { backgroundColor: color.rowPressed },
      ]}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fieldRow: { flexDirection: "row", alignItems: "center", gap: space["2"] },
  field: {
    flex: 1,
    minHeight: minTap,
    borderRadius: 10,
    paddingLeft: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: space["2"],
  },
  input: { flex: 1, minHeight: minTap, ...face.regular, fontSize: 17, paddingVertical: 0 },
  clear: { width: minTap, height: minTap, alignItems: "center", justifyContent: "center" },
  cancel: { minHeight: minTap, justifyContent: "center", paddingHorizontal: 4 },
  groups: { gap: space["6"] },
  section: { gap: space["2"] },
  head: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  headButton: { minHeight: minTap, justifyContent: "center", marginVertical: -12 },
  back: { minHeight: minTap, justifyContent: "center", alignSelf: "flex-start" },
  none: { paddingVertical: space["6"], paddingHorizontal: space["4"], gap: space["1"] },
  center: { textAlign: "center" },
  row: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: space["3"],
    paddingVertical: 10,
    paddingHorizontal: space["4"],
  },
  rowBody: { flex: 1, gap: 2 },
});
