import { router } from "expo-router";
import { formatAddress, offersPool } from "@leakbook/core";
import { useMemo, useState } from "react";
import { useSyncRefresh } from "../../../../data/hooks";
import { Animated, RefreshControl, StyleSheet, Text, View } from "react-native";
import {
  CUSTOMER_SORTS,
  KIND_PLURALS,
  useCustomerList,
  type CustomerSort,
} from "../../../../data/customers";
import { FlatGroupedRow } from "../../../../features/more/FlatGroupedRow";
import { useCompany } from "../../../../state/session";
import { Empty, SearchField, T, useScreenChrome } from "../../../../ui/components";
import { Select } from "../../../../ui/Select";
import { ScreenTip } from "../../../../ui/Tip";
import { color, MAX_TEXT_SCALE, space, type } from "../../../../ui/theme";

/**
 * Customers (spec 5.9): search (filters as you type), Sort and Show, then one grouped list,
 * loading as it scrolls. A row opens the customer.
 */
export default function Customers() {
  const company = useCompany();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<CustomerSort>("name");
  const [show, setShow] = useState("all");
  const rows = useCustomerList(company.id, search, sort, show);
  const shows = useMemo(
    () => [
      { value: "all", label: "All Customers" },
      ...(offersPool(company.settings)
        ? [
            { value: "plan", label: "On a Plan" },
            { value: "no_plan", label: "No Plan" },
          ]
        : []),
      ...Object.entries(KIND_PLURALS).map(([value, label]) => ({ value, label })),
    ],
    [company.settings],
  );
  const { header, ref, scrollProps, contentContainerStyle } = useScreenChrome({
    title: "Customers",
  });

  const thisYear = new Date().getFullYear();
  const day = (iso: string) =>
    new Date(iso).toLocaleDateString("en-US", {
      timeZone: company.timezone,
      month: "short",
      day: "numeric",
      ...(new Date(iso).getFullYear() !== thisYear ? { year: "numeric" } : {}),
    });

  const top = (
    <View style={styles.top}>
      {header}
      <ScreenTip screen="customers" />
      <SearchField
        value={search}
        onChangeText={setSearch}
        placeholder="Name, phone, or email"
        label="Search customers"
      />
      <View style={styles.selects}>
        <Select
          label="Sort"
          style={{ flex: 1 }}
          value={sort}
          onChange={setSort}
          options={Object.entries(CUSTOMER_SORTS).map(([value, label]) => ({
            value: value as CustomerSort,
            label,
          }))}
        />
        <Select label="Show" style={{ flex: 1 }} value={show} onChange={setShow} options={shows} />
      </View>
    </View>
  );

  const pull = useSyncRefresh();
  return (
    <Animated.FlatList
      ref={ref as never}
      {...scrollProps}
      style={{ backgroundColor: color.bg }}
      contentContainerStyle={contentContainerStyle}
      data={rows}
      refreshControl={<RefreshControl {...pull} />}
      keyExtractor={(c) => c.id}
      initialNumToRender={20}
      ListHeaderComponent={top}
      ListEmptyComponent={
        <Empty>
          {search.trim()
            ? `No customers match “${search.trim()}”.`
            : show !== "all"
              ? "No customers here."
              : "No customers yet. They’re added when a job is created on the phone."}
        </Empty>
      }
      renderItem={({ item: c, index }) => {
        const value =
          sort === "last_visit"
            ? c.lastVisit
              ? day(c.lastVisit)
              : "No visits"
            : (sort === "newest" || sort === "oldest") && c.created_at
              ? `Added ${day(c.created_at)}`
              : null;
        return (
          <FlatGroupedRow
            first={index === 0}
            last={index === rows.length - 1}
            onPress={() => router.push(`/customers/${c.id}`)}
            value={value ? <T muted>{value}</T> : undefined}
            phone={c.phone}
          >
            <Text
              numberOfLines={2}
              style={[type.bodyEmphasis, { color: color.text }]}
              maxFontSizeMultiplier={MAX_TEXT_SCALE}
            >
              {c.name}
              {c.company_name ? (
                <Text style={[type.body, { color: color.textMuted }]}> · {c.company_name}</Text>
              ) : null}
            </Text>
            <T variant="secondary" muted numberOfLines={1}>
              {c.phone ?? c.email ?? "No contact details"}
            </T>
            {c.properties.length > 0 ? (
              <T variant="secondary">{c.properties.map((p) => formatAddress(p)).join("; ")}</T>
            ) : null}
          </FlatGroupedRow>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  top: { gap: space["4"], marginBottom: space["5"] },
  selects: { flexDirection: "row", gap: space["3"] },
});
