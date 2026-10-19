import { Linking } from "react-native";
import { API_URL } from "../../../../lib/config";
import { Button, Empty, Screen } from "../../../../ui/components";

/** Invoices (spec 5.10): not in the app yet; the website has it meanwhile. */
export default function Invoices() {
  return (
    <Screen title="Invoices">
      <Empty>Invoices come to the app soon. A job’s invoice is on its Wrap-Up.</Empty>
      {API_URL ? (
        <Button
          title="Open Invoices on the Website"
          kind="secondary"
          onPress={() => void Linking.openURL(`${API_URL}/invoices`)}
        />
      ) : null}
    </Screen>
  );
}
