import { useMemo } from "react";
import { OK_TO_TEXT, OK_TO_TEXT_HINT, type Customer } from "@leakbook/core";
import { useCanContact } from "../../state/session";
import {
  Button,
  Card,
  Field,
  FieldGroup,
  FieldRow,
  Group,
  ListRow,
  T,
  Toggle,
} from "../../ui/components";

export interface NewCustomerFields {
  customerName: string;
  customerPhone: string;
  customerEmail: string;
}

/**
 * The Customer section's picker on New Job and New Quote: the picked customer with Change
 * Customer, or a search of the shop's customers and a new customer's Name, Phone and Email.
 */
export function CustomerPicker({
  customers,
  selectedId,
  search,
  onSearch,
  onPick,
  onClear,
  fields,
  onField,
  errors,
  textOk,
  onTextOk,
}: {
  customers: Customer[];
  selectedId: string | undefined;
  search: string;
  onSearch: (s: string) => void;
  onPick: (c: Customer) => void;
  onClear: () => void;
  fields: NewCustomerFields;
  onField: (k: keyof NewCustomerFields) => (v: string) => void;
  errors: Partial<Record<keyof NewCustomerFields, string>>;
  /** OK to Text for the new customer (ok-to-text.ts). */
  textOk: boolean;
  onTextOk: (v: boolean) => void;
}) {
  const canContact = useCanContact();
  const selected = customers.find((c) => c.id === selectedId);
  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return customers
      .filter((c) => [c.name, c.phone, c.email].some((v) => v?.toLowerCase().includes(q)))
      .slice(0, 6);
  }, [customers, search]);

  if (selected)
    return (
      <Card>
        <T variant="strong">{selected.name}</T>
        {selected.phone ? <T variant="muted">{selected.phone}</T> : null}
        <Button title="Change Customer" kind="quiet" onPress={onClear} />
      </Card>
    );
  return (
    <>
      {customers.length > 0 ? (
        <Field
          labelInside
          label="Find an existing customer"
          value={search}
          onChangeText={onSearch}
          hint="Search by name, phone, or email."
        />
      ) : null}
      {matches.length > 0 ? (
        <Group>
          {matches.map((c) => (
            <ListRow
              key={c.id}
              chevron={false}
              onPress={() => {
                onPick(c);
                onSearch("");
              }}
            >
              <T variant="strong">{c.name}</T>
              {/* Numbers and emails only with Text and Call Customers (2026-11-23). */}
              {canContact ? (
                <T variant="muted">
                  {[c.phone, c.email].filter(Boolean).join(" · ") || "No contact details"}
                </T>
              ) : null}
            </ListRow>
          ))}
        </Group>
      ) : null}
      <T variant="muted">Or add a new customer:</T>
      <FieldGroup labelsInside>
        <FieldRow
          label="Name"
          value={fields.customerName}
          onChangeText={onField("customerName")}
          error={errors.customerName}
          autoCapitalize="words"
        />
        <FieldRow
          label="Phone"
          value={fields.customerPhone}
          onChangeText={onField("customerPhone")}
          keyboardType="phone-pad"
        />
        <Toggle label={OK_TO_TEXT} hint={OK_TO_TEXT_HINT} value={textOk} onChange={onTextOk} />
        <FieldRow
          label="Email"
          value={fields.customerEmail}
          onChangeText={onField("customerEmail")}
          error={errors.customerEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />
      </FieldGroup>
    </>
  );
}
