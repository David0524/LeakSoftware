import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import {
  formatAddress,
  isQuoteJob,
  quoteTitle,
  type Customer,
  type Job,
  type Property,
  type Quote,
} from "@leakbook/core";
import { useRow, useRows } from "../../../../../data/hooks";
import {
  canDeleteQuote,
  deleteStandaloneQuote,
  setQuotePool,
} from "../../../../../data/quote-list";
import { AddressFields } from "../../../../../features/quote/AddressFields";
import { QuoteTab } from "../../../../../features/quote/QuoteTab";
import { locateAfterSync } from "../../../../../lib/locate";
import { useCompany, useSession } from "../../../../../state/session";
import { Button, Choice, Group, ListRow, Screen, Section, T } from "../../../../../ui/components";
import { confirmDestructive } from "../../../../../ui/confirm";
import { haptics } from "../../../../../ui/haptics";
import { ModalSheet } from "../../../../../ui/ModalSheet";
import { space } from "../../../../../ui/theme";

/**
 * A quote (docs/design/2026-11-24-standalone-quotes.md): a grouped list of its Customer, Pool
 * (or Add Pool on a quote job with none) and Job (when it's on a job, or has become the repair
 * job), then the same quote card the job page uses: the builder for a draft, the sent quote
 * after. A draft standalone quote has Delete Quote at the bottom.
 */
export default function QuoteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const company = useCompany();
  const { services } = useSession();
  const quote = useRow<Quote>("quote", id);
  const job = useRow<Job & { deleted_at?: string | null }>("job", quote?.job_id);
  const property = useRow<Property>("property", job?.property_id ?? undefined);
  const customer = useRow<Customer>("customer", job?.bill_to_customer_id ?? property?.customer_id);
  const [addingPool, setAddingPool] = useState(false);

  if (!quote || quote.deleted_at || !job || job.deleted_at)
    return (
      <Screen title="Quote">
        <T muted>This quote isn’t on this phone.</T>
      </Screen>
    );

  const quoteJob = isQuoteJob(job);
  function remove() {
    confirmDestructive({
      title: "Delete this quote?",
      confirm: "Delete",
      onConfirm: () => {
        deleteStandaloneQuote(services.sync, company.id, quote!, job!);
        router.back();
      },
    });
  }

  return (
    <Screen title={quoteTitle(quote.number)}>
      <Group>
        <ListRow
          title="Customer"
          detail={customer?.name ?? "Customer"}
          onPress={customer ? () => router.push(`/customers/${customer.id}`) : undefined}
        />
        {property ? (
          <ListRow title="Pool" subtitle={formatAddress(property)} />
        ) : quoteJob ? (
          <ListRow title="Add Pool" tone="link" onPress={() => setAddingPool(true)} />
        ) : null}
        {!quoteJob ? (
          <ListRow
            title="Job"
            detail={job.number ? `Job #${job.number}` : "New job"}
            onPress={() => router.push(`/jobs/${job.id}`)}
          />
        ) : null}
      </Group>

      <QuoteTab job={job} only={quote.id} />

      {canDeleteQuote(quote, job) ? (
        <View style={{ marginTop: space["2"] }}>
          <Button title="Delete Quote" kind="danger" wide onPress={remove} />
        </View>
      ) : null}

      <ModalSheet visible={addingPool} onClose={() => setAddingPool(false)} title="Add Pool">
        {addingPool ? (
          <AddPool
            job={job}
            onAdded={(newPool) => {
              setAddingPool(false);
              haptics.success();
              if (newPool) void locateAfterSync(company.id, { property_id: newPool });
            }}
          />
        ) : null}
      </ModalSheet>
    </Screen>
  );
}

/** Add Pool: one of the customer's pools, or a new address for them; writes job.property_id. */
function AddPool({
  job,
  onAdded,
}: {
  job: Job & { bill_to_customer_id?: string | null };
  onAdded: (newPool: string | null) => void;
}) {
  const company = useCompany();
  const { services } = useSession();
  const properties = useRows<Property>("property", company.id);
  const pools = properties.filter((p) => p.customer_id === job.bill_to_customer_id);
  const [picked, setPicked] = useState<string>(pools[0]?.id ?? "new");
  const [form, setForm] = useState({ addressLine1: "", city: "", state: "", postalCode: "" });
  const [error, setError] = useState<string | undefined>();
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  function save() {
    if (picked !== "new")
      return onAdded(setQuotePool(services.sync, company.id, job, { propertyId: picked }));
    if (!form.addressLine1.trim()) return setError("Enter the street address.");
    onAdded(setQuotePool(services.sync, company.id, job, form));
  }

  return (
    <View style={{ gap: space["5"] }}>
      <Section title="Pool">
        {pools.length > 0 ? (
          <Choice
            options={[
              ...pools.map((p) => ({ value: p.id, label: p.address_line1 })),
              { value: "new", label: "New address" },
            ]}
            value={picked}
            onChange={setPicked}
          />
        ) : null}
        {picked === "new" ? (
          <AddressFields form={form} set={set} setForm={setForm} error={error} />
        ) : null}
      </Section>
      <Button title="Add Pool" onPress={save} />
    </View>
  );
}
