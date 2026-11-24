import { router } from "expo-router";
import {
  DEFAULT_QUOTE_SEGMENT,
  QUOTE_NEEDS_POOL,
  QUOTE_SEGMENTS,
  QUOTE_STATUS_LABELS,
  QUOTES_EMPTY,
  QUOTES_EMPTY_SEARCH,
  canMakeJobs,
  filterQuotes,
  quoteRowDetail,
  quoteWaitingForPool,
  type QuoteSegment,
} from "@leakbook/core";
import { useMemo, useState } from "react";
import { Animated, RefreshControl, StyleSheet, View } from "react-native";
import { useSyncRefresh } from "../../../../data/hooks";
import { useQuoteList } from "../../../../data/quote-list";
import { FlatGroupedRow } from "../../../../features/more/FlatGroupedRow";
import { useCompany, useSession } from "../../../../state/session";
import {
  Empty,
  HeaderButton,
  Pill,
  SearchField,
  Segmented,
  T,
  useScreenChrome,
} from "../../../../ui/components";
import { color, QUOTE_STATUS_COLOR, space } from "../../../../ui/theme";

/**
 * Quotes (docs/design/2026-11-24-standalone-quotes.md): every quote in the shop, standalone and
 * on jobs, newest first. Draft | Sent | Accepted | Declined, opening on Sent (the ones to follow
 * up), and a search by customer, quote number or job number (core filterQuotes). A row opens
 * the Quote screen; the + makes a New Quote, for people who can make jobs.
 */
export default function Quotes() {
  const company = useCompany();
  const { membership } = useSession();
  const quotes = useQuoteList(company.id);
  const [segment, setSegment] = useState<QuoteSegment>(DEFAULT_QUOTE_SEGMENT);
  const [search, setSearch] = useState("");
  const q = search.trim();
  const shown = useMemo(() => filterQuotes(quotes, { segment, q }), [quotes, segment, q]);
  const canAdd = canMakeJobs(membership?.role, company.settings);

  const { header, ref, scrollProps, contentContainerStyle } = useScreenChrome({
    title: "Quotes",
    headerRight: canAdd
      ? () => (
          <HeaderButton title="New Quote" icon="add" onPress={() => router.push("/quotes/new")} />
        )
      : () => null,
  });

  const pull = useSyncRefresh();
  return (
    <View style={{ flex: 1, backgroundColor: color.bg }}>
      <Animated.FlatList
        ref={ref as never}
        {...scrollProps}
        style={{ backgroundColor: color.bg }}
        contentContainerStyle={contentContainerStyle}
        data={shown}
        refreshControl={<RefreshControl {...pull} />}
        keyExtractor={(x) => x.id}
        initialNumToRender={20}
        ListHeaderComponent={
          <View style={styles.top}>
            {header}
            <Segmented
              accessibilityLabel="Quote status"
              options={QUOTE_SEGMENTS.map((s) => ({ value: s.key, label: s.label }))}
              value={segment}
              onChange={setSegment}
            />
            <SearchField
              value={search}
              onChangeText={setSearch}
              placeholder="Search Quotes"
              label="Search Quotes"
            />
          </View>
        }
        ListEmptyComponent={<Empty>{q ? QUOTES_EMPTY_SEARCH : QUOTES_EMPTY[segment]}</Empty>}
        renderItem={({ item, index }) => (
          <FlatGroupedRow
            first={index === 0}
            last={index === shown.length - 1}
            onPress={() => router.push(`/quotes/${item.id}`)}
            value={
              <Pill
                label={QUOTE_STATUS_LABELS[item.status]}
                color={QUOTE_STATUS_COLOR[item.status]}
              />
            }
          >
            <T variant="bodyEmphasis">{item.customer ?? "Customer"}</T>
            <T variant="secondary" muted>
              {quoteRowDetail(item)}
            </T>
            {quoteWaitingForPool(item) ? (
              <T variant="secondary" muted>
                {QUOTE_NEEDS_POOL}
              </T>
            ) : null}
          </FlatGroupedRow>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  top: { gap: space["4"], marginBottom: space["5"] },
});
