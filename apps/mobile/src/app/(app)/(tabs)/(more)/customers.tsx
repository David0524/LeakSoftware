import { router, useLocalSearchParams } from "expo-router";
import {
  MASS_EMAIL_TITLE,
  customerShowOptions,
  formatAddress,
  isManagerRole,
  offersPool,
  propertyLocation,
} from "@leakbook/core";
import { useMemo, useState } from "react";
import { useSyncRefresh } from "../../../../data/hooks";
import { Animated, Linking, RefreshControl, StyleSheet, Text, View } from "react-native";
import {
  CUSTOMER_SORTS,
  useCustomerCounts,
  useCustomerList,
  type CustomerListRow,
  type CustomerSort,
} from "../../../../data/customers";
import { useLine } from "../../../../data/texting";
import { customerRowActions, menuTitle, type CustomerActionId } from "../../../../lib/rowActions";
import { openDirections, useDirectionsChoice } from "../../../../state/directions";
import { rowGestures, useRowMenu } from "../../../../ui/RowMenu";
import { FlatGroupedRow } from "../../../../features/more/FlatGroupedRow";
import { useCompany, useSession } from "../../../../state/session";
import { Empty, HeaderButton, SearchField, T, useScreenChrome } from "../../../../ui/components";
import { Select } from "../../../../ui/Select";
import { color, MAX_TEXT_SCALE, space, type } from "../../../../ui/theme";

/**
 * Customers (spec 5.9): search (filters as you type), Sort and Show, then one grouped list,
 * loading as it scrolls. A row opens the customer. Swipe left to Call or Message; touch and
 * hold for Open, Call, Message and Directions (gestures spec section 12), each as the
 * customer's page does it.
 */
export default function Customers() {
  const company = useCompany();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<CustomerSort>("name");
  // Opened from the Dashboard's trackers (`/customers?show=plan`).
  const { show: asked } = useLocalSearchParams<{ show?: string }>();
  const [show, setShow] = useState(() =>
    customerShowOptions(true).some((o) => o.value === asked) ? asked! : "all",
  );
  const rows = useCustomerList(company.id, company.timezone, search, sort, show);
  // Each Show choice with its count (owner, 2026-10-22), of what the search finds.
  const counts = useCustomerCounts(company.id, company.timezone, search);
  const line = useLine(company.id);
  const [choice] = useDirectionsChoice();
  const menu = useRowMenu();

  /** The customer page's own Call, Text and Get Directions. */
  function gesturesFor(c: CustomerListRow) {
    const pool = c.properties.find((p) => p.address_line1);
    const actions = customerRowActions({ phone: c.phone, hasPoolAddress: Boolean(pool) });
    const run = (id: CustomerActionId) => {
      if (id === "open") router.push(`/customers/${c.id}`);
      if (id === "call" && c.phone) void Linking.openURL(`tel:${c.phone}`);
      if (id === "message" && c.phone) {
        if (line?.status === "active") router.push(`/messages/new?customer=${c.id}`);
        else void Linking.openURL(`sms:${c.phone.replace(/[^\d+]/g, "")}`);
      }
      if (id === "directions" && pool)
        openDirections({ address: formatAddress(pool), location: propertyLocation(pool) }, choice);
    };
    return rowGestures(actions, run, () => menu.open(menuTitle(c.name), actions.menu, run));
  }
  const shows = useMemo(
    () => customerShowOptions(offersPool(company.settings), counts),
    [company.settings, counts],
  );
  // Email Customers (owner, 2026-10-22), owners and admins: the envelope in the bar.
  const { membership } = useSession();
  const { header, ref, scrollProps, contentContainerStyle } = useScreenChrome({
    title: "Customers",
    headerRight: isManagerRole(membership?.role)
      ? () => (
          <HeaderButton
            title={MASS_EMAIL_TITLE}
            icon="mail"
            onPress={() => router.push("/email-customers")}
          />
        )
      : () => null,
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
      {menu.element}
      <SearchField
        value={search}
        onChangeText={setSearch}
        placeholder="Name, phone, or email"
        label="Search customers"
      />
      <View style={styles.selects}>
        <Select
          label="Sort"
          value={sort}
          onChange={setSort}
          options={Object.entries(CUSTOMER_SORTS).map(([value, label]) => ({
            value: value as CustomerSort,
            label,
          }))}
        />
        <Select label="Show" value={show} onChange={setShow} options={shows} />
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
            gestures={gesturesFor(c)}
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
  // Sort above Show, so Show's count is never cut off ("On a Plan (65)").
  selects: { gap: space["3"] },
});
