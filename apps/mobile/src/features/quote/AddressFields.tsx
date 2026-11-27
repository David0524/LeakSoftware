import { StyleSheet, View } from "react-native";
import { AddressSuggestions, useAddressSuggestions } from "../address/AddressSuggestions";
import { Field, FieldGroup, FieldRow } from "../../ui/components";
import { space } from "../../ui/theme";

export interface AddressForm {
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string;
}

/**
 * Street (with suggestions), City, State and ZIP, as New Job's pool address. `labelsInside`
 * (New Job, New Quote): one grouped card whose rows' labels are their placeholders.
 */
export function AddressFields<F extends AddressForm>({
  form,
  set,
  setForm,
  error,
  labelsInside = false,
}: {
  form: F;
  set: (k: keyof AddressForm) => (v: string) => void;
  setForm: (update: (f: F) => F) => void;
  error?: string;
  labelsInside?: boolean;
}) {
  const suggestions = useAddressSuggestions(labelsInside ? form.addressLine1 : "", (s) =>
    setForm((f) => ({
      ...f,
      addressLine1: s.line1,
      city: s.city,
      state: s.state,
      postalCode: s.postal_code,
    })),
  );
  if (labelsInside)
    return (
      <FieldGroup labelsInside>
        <FieldRow
          label="Street address"
          value={form.addressLine1}
          onChangeText={set("addressLine1")}
          error={error}
        />
        {suggestions}
        <FieldRow label="City" value={form.city} onChangeText={set("city")} />
        <FieldRow
          label="State"
          value={form.state}
          onChangeText={set("state")}
          autoCapitalize="characters"
          maxLength={2}
        />
        <FieldRow
          label="ZIP"
          value={form.postalCode}
          onChangeText={set("postalCode")}
          keyboardType="number-pad"
          maxLength={10}
        />
      </FieldGroup>
    );
  return (
    <>
      <Field
        label="Street address"
        value={form.addressLine1}
        onChangeText={set("addressLine1")}
        error={error}
      />
      <AddressSuggestions
        street={form.addressLine1}
        onPick={(s) =>
          setForm((f) => ({
            ...f,
            addressLine1: s.line1,
            city: s.city,
            state: s.state,
            postalCode: s.postal_code,
          }))
        }
      />
      <View style={styles.cols}>
        <View style={{ flex: 2 }}>
          <Field label="City" value={form.city} onChangeText={set("city")} />
        </View>
        <View style={{ flex: 1 }}>
          <Field
            label="State"
            value={form.state}
            onChangeText={set("state")}
            autoCapitalize="characters"
            maxLength={2}
          />
        </View>
      </View>
      <Field
        label="ZIP"
        value={form.postalCode}
        onChangeText={set("postalCode")}
        keyboardType="number-pad"
        maxLength={10}
      />
    </>
  );
}

const styles = StyleSheet.create({
  cols: { flexDirection: "row", gap: space["3"] },
});
