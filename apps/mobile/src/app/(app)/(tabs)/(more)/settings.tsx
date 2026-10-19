import { Empty, Screen } from "../../../../ui/components";

/**
 * The shop's Settings (spec 5.12, managers): not in the app yet. No link to the website's
 * settings, which hold Sundeck Pro Billing (store payment rules, spec 8.4).
 */
export default function ShopSettings() {
  return (
    <Screen title="Settings">
      <Empty>
        The shop’s settings come to the app soon. Until then, owners and admins change them on a
        computer.
      </Empty>
    </Screen>
  );
}
