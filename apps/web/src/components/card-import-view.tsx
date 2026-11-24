import { CARD_IMPORT_TEXT as T, type CardImportPlan } from "@leakbook/core";
import { CardImport, type PickCustomer } from "./card-import";
import { Banner } from "./doc-ui";
import { CopyLink, SettingsSection } from "./settings-forms";

/**
 * Import Saved Cards (core card-import.ts): how to copy the customers in Stripe, this account's
 * ID to copy them to, and the copied customers to match.
 */
export function CardImportView({
  account,
  plan,
  customers,
  autopayOn,
}: {
  account: string;
  plan: CardImportPlan;
  customers: PickCustomer[];
  autopayOn: boolean;
}) {
  return (
    <div className="max-w-2xl space-y-6">
      <p>{T.intro}</p>
      <SettingsSection title={T.stepsTitle} boxed>
        <ol className="list-decimal space-y-2 pl-5">
          {T.steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
        <div className="mt-4 space-y-2">
          <p className="text-[0.9375rem] font-semibold text-text-muted">{T.accountId}</p>
          <CopyLink url={account} label={T.accountId} button="Copy ID" />
        </div>
      </SettingsSection>
      <Banner tone="warning">{T.oldSoftware}</Banner>
      {autopayOn ? null : (
        <Banner tone="info">
          Autopay is off for your shop. Cards import, but nobody is charged until you turn it on in
          Payments and Deposits.
        </Banner>
      )}
      <CardImport
        key={JSON.stringify([plan.ready.length, plan.needsMatch.length, plan.done])}
        plan={plan}
        customers={customers}
      />
    </div>
  );
}
