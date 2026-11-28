import { router, useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import {
  businessChoices,
  businessIdentity,
  canMakeJobs,
  formatAddress,
  hasSecondBusiness,
  SECOND_BUSINESS_TEXT,
  validateNewQuote,
  type Business,
  type Customer,
  type NewQuoteInput,
  type Property,
} from "@leakbook/core";
import { useRows } from "../../../../../data/hooks";
import { createQuote } from "../../../../../data/quote-list";
import { CustomerPicker } from "../../../../../features/job/CustomerPicker";
import { AddressFields } from "../../../../../features/quote/AddressFields";
import { locateAfterSync } from "../../../../../lib/locate";
import { useCompany, useSession } from "../../../../../state/session";
import {
  Button,
  Card,
  Choice,
  Group,
  ListRow,
  Notice,
  Screen,
  Section,
  T,
} from "../../../../../ui/components";
import { useDiscardChanges } from "../../../../../ui/discard";
import { haptics } from "../../../../../ui/haptics";
import { useMenu } from "../../../../../ui/Select";

/**
 * New Quote (docs/design/2026-11-24-standalone-quotes.md): a customer, new or picked, and an
 * optional pool, then Create Quote opens the Quote screen in its place. Opened from a customer
 * page (?customer=<id>), that customer is already picked. Saved on the phone (offline too) in
 * one batch: the customer and pool when new, the quote job, and its quote.
 */
export default function NewQuote() {
  const company = useCompany();
  const { membership } = useSession();
  if (!canMakeJobs(membership?.role, company.settings))
    return (
      <Screen title="New Quote">
        <Notice tone="info">
          Your office makes new jobs. Ask an owner or admin to add this one.
        </Notice>
      </Screen>
    );
  return <NewQuoteForm />;
}

function NewQuoteForm() {
  const company = useCompany();
  const { services, user, membership } = useSession();
  const { customer: asked } = useLocalSearchParams<{ customer?: string }>();
  const customers = useRows<Customer>("customer", company.id);
  const properties = useRows<Property>("property", company.id);
  const poolsOf = (id: string | undefined) =>
    id ? properties.filter((p) => p.customer_id === id) : [];
  // OK to Text for a new customer (owner, 2026-11-28).
  const [textOk, setTextOk] = useState(false);
  const [customerId, setCustomerId] = useState<string | undefined>(() =>
    asked && customers.some((c) => c.id === asked) ? asked : undefined,
  );
  // One pool already picked when the customer has just one, as New Job does.
  const [propertyId, setPropertyId] = useState<string | undefined>(() => {
    const pools = asked ? properties.filter((p) => p.customer_id === asked) : [];
    return pools.length === 1 ? pools[0]!.id : undefined;
  });
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({
    customerName: "",
    customerPhone: "",
    customerEmail: "",
    addressLine1: "",
    city: "",
    state: "",
    postalCode: "",
  });
  const [errors, setErrors] = useState<ReturnType<typeof validateNewQuote>>({});
  // Which of the shop's two businesses the quote uses (Services = Both with a second business;
  // docs/design/2026-11-26-second-business-and-tech-photos.md). A standalone quote starts on
  // the main one; only a business the person picks is saved on the quote job.
  const [business, setBusiness] = useState<Business | null>(null);
  const businessMenu = useMenu();
  const shownBusiness: Business = business ?? "main";
  const created = useRef(false);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const pools = poolsOf(customerId);

  const dirty = Boolean(
    (customerId && customerId !== asked) ||
    search.trim() ||
    business !== null ||
    Object.values(form).some((v) => v.trim()),
  );
  const leave = useDiscardChanges(dirty);

  function save() {
    const input: NewQuoteInput = {
      ...form,
      customerId,
      propertyId,
      ...(business && hasSecondBusiness(company) ? { business } : {}),
    };
    const e = validateNewQuote(input);
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    // Once the checks pass, the quote is made once, however many taps.
    if (created.current) return;
    created.current = true;
    // A tech's quote is theirs, so a tech who sees only their own jobs still sees it.
    const mine = membership?.role === "tech" ? (user?.id ?? null) : null;
    const { quoteId, newPool } = createQuote(
      services.sync,
      company.id,
      input,
      mine,
      textOk ? { at: new Date().toISOString(), by: user?.id ?? null } : null,
    );
    if (newPool) void locateAfterSync(company.id, { property_id: newPool });
    haptics.success();
    leave(() => router.replace(`/quotes/${quoteId}`));
  }

  return (
    <Screen title="New Quote">
      <Section title="Customer">
        <CustomerPicker
          customers={customers}
          selectedId={customerId}
          search={search}
          onSearch={setSearch}
          onPick={(c) => {
            setCustomerId(c.id);
            const theirs = poolsOf(c.id);
            setPropertyId(theirs.length === 1 ? theirs[0]!.id : undefined);
          }}
          onClear={() => {
            setCustomerId(undefined);
            setPropertyId(undefined);
          }}
          fields={form}
          textOk={textOk}
          onTextOk={setTextOk}
          onField={set}
          errors={errors}
        />
      </Section>

      {hasSecondBusiness(company) ? (
        <Section title="">
          <Group>
            <ListRow
              title={SECOND_BUSINESS_TEXT.jobRow}
              detail={businessIdentity(company, shownBusiness).name}
              accessibilityHint="Choose the business name this quote's customer sees."
              onPress={() =>
                businessMenu.open({
                  title: SECOND_BUSINESS_TEXT.jobRow,
                  items: businessChoices(company).map((c) => ({
                    label: c.label,
                    checked: c.value === shownBusiness,
                    onPress: () => setBusiness(c.value),
                  })),
                })
              }
            />
          </Group>
        </Section>
      ) : null}
      {businessMenu.element}

      <Section title="Pool (Optional)" footer="Leave the address blank to quote without one.">
        {pools.length > 0 ? (
          <Choice
            options={[
              ...pools.map((p) => ({ value: p.id, label: p.address_line1 })),
              { value: "new", label: "New address" },
            ]}
            value={propertyId ?? "new"}
            onChange={(v) => setPropertyId(v === "new" ? undefined : v)}
          />
        ) : null}
        {propertyId ? (
          <Card>
            <T variant="small">{formatAddress(properties.find((p) => p.id === propertyId)!)}</T>
          </Card>
        ) : (
          <AddressFields
            form={form}
            set={set}
            setForm={setForm}
            error={errors.addressLine1}
            labelsInside
          />
        )}
      </Section>

      {Object.keys(errors).length > 0 ? (
        <Notice tone="error">Fix the highlighted fields.</Notice>
      ) : null}
      <Button title="Create Quote" onPress={save} />
    </Screen>
  );
}
