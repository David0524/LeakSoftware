import { View } from "react-native";
import { START_FROM_COPY, homeMapStatus, usesHome, type MemberStart } from "@leakbook/core";
import { HOME_ADDRESS_MAX, type StartForm } from "../../lib/memberStart";
import { FieldGroup, FieldRow, Group, Segmented, T } from "../../ui/components";
import { NotOnMapRow } from "../../ui/NotOnMap";
import { space } from "../../ui/theme";
import { useAddressSuggestions } from "../address/AddressSuggestions";

// Start My Day From and End My Day At (owner, 2026-10-21 and 2026-11-23;
// docs/design/2026-10-21-start-from-home.md): The Shop or Home for each, with the home address
// (when either is Home) and the same address suggestions as a pool's. Until the saved address is
// found on the map the day uses the shop, and the setting says so. Used in
// More › My Profile (your own) and Settings › Team › the person (owners and admins). The words
// are core START_FROM_COPY, the same on every platform.

export function StartFromFields({
  form,
  onChange,
  row,
  error,
}: {
  form: StartForm;
  onChange: (form: StartForm) => void;
  /** The saved row, for whether its home is on the map yet. */
  row: MemberStart | null | undefined;
  error?: string;
}) {
  const suggestions = useAddressSuggestions(form.home_address, (s) =>
    onChange({ ...form, home_address: s.label }),
  );
  const home = usesHome(form.start_from, form.end_at);
  const places = [
    { value: "shop" as const, label: START_FROM_COPY.shop },
    { value: "home" as const, label: START_FROM_COPY.home },
  ];
  // Saved with Home and not on the map: the shop until it's found (and the warning once a lookup
  // of the saved address didn't find it).
  const missing = home && homeMapStatus(row) === "missing";
  const saved = row?.home_address?.trim();
  return (
    <View style={{ gap: space["3"] }}>
      <Segmented
        label={START_FROM_COPY.field}
        value={form.start_from}
        onChange={(start_from) => onChange({ ...form, start_from })}
        options={places}
      />
      <Segmented
        label={START_FROM_COPY.endField}
        value={form.end_at}
        onChange={(end_at) => onChange({ ...form, end_at })}
        options={places}
      />
      {home ? (
        <FieldGroup>
          <FieldRow
            label={START_FROM_COPY.homeAddress}
            layout="stacked"
            value={form.home_address}
            onChangeText={(home_address) => onChange({ ...form, home_address })}
            autoCapitalize="words"
            autoCorrect={false}
            textContentType="fullStreetAddress"
            autoComplete="street-address"
            maxLength={HOME_ADDRESS_MAX}
            error={error}
          />
          {suggestions}
        </FieldGroup>
      ) : null}
      {missing ? (
        <>
          <T variant="secondary" muted>
            {START_FROM_COPY.pending}
          </T>
          {saved ? (
            <Group>
              <NotOnMapRow />
            </Group>
          ) : null}
        </>
      ) : null}
      <T variant="secondary" muted>
        {START_FROM_COPY.footer}
      </T>
    </View>
  );
}
