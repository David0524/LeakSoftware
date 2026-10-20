import { useEffect, useRef, useState, type ReactElement } from "react";
import type { AddressSuggestion } from "@leakbook/core";
import {
  SUGGEST_MIN_CHARS,
  SUGGEST_PAUSE_MS,
  suggestAddresses,
  suggestionPlace,
} from "../../lib/addressSuggest";
import { useCompany } from "../../state/session";
import { Group, ListRow } from "../../ui/components";
import { haptics } from "../../ui/haptics";

// Address suggestions under a street field, as the website's AddressField: a short pause after
// typing, then up to 5 real addresses as rows (the street, then "City, ST ZIP"). Picking one
// fills the street, city, state, and ZIP, so the address the map knows is the one saved; typing
// your own still works. Only typing looks up: the address a form opens with doesn't, nor the
// one just picked.

/**
 * The suggestion rows for a street field's text, to put right after it in its FieldGroup (an
 * array, so the group draws a hairline between each, and nothing when there are none).
 */
export function useAddressSuggestions(
  street: string,
  onPick: (s: AddressSuggestion) => void,
): ReactElement[] {
  const company = useCompany();
  const [items, setItems] = useState<AddressSuggestion[]>([]);
  const settled = useRef(street);

  useEffect(() => {
    if (street === settled.current) return;
    settled.current = "";
    let live = true;
    const timer = setTimeout(
      () => {
        if (street.trim().length < SUGGEST_MIN_CHARS) return setItems([]);
        void suggestAddresses(company.id, street).then((found) => {
          if (live) setItems(found);
        });
      },
      street.trim().length < SUGGEST_MIN_CHARS ? 0 : SUGGEST_PAUSE_MS,
    );
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [street, company.id]);

  return items.map((s, i) => (
    <ListRow
      key={`${s.label}-${i}`}
      title={s.line1}
      subtitle={suggestionPlace(s)}
      chevron={false}
      accessibilityLabel={`${s.line1}, ${suggestionPlace(s)}`}
      accessibilityHint="Fills in the street, city, state, and ZIP"
      onPress={() => {
        settled.current = s.line1;
        setItems([]);
        haptics.selection();
        onPick(s);
      }}
    />
  ));
}

/** The rows as a group of their own, under a field that isn't in a FieldGroup. */
export function AddressSuggestions({
  street,
  onPick,
}: {
  street: string;
  onPick: (s: AddressSuggestion) => void;
}) {
  const rows = useAddressSuggestions(street, onPick);
  return rows.length ? <Group>{rows}</Group> : null;
}
