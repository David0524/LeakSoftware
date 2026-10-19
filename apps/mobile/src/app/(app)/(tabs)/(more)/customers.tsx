import { Linking } from "react-native";
import { API_URL } from "../../../../lib/config";
import { Button, Empty, Screen } from "../../../../ui/components";

/** Customers (spec 5.9): not in the app yet; the website has it meanwhile. */
export default function Customers() {
  return (
    <Screen title="Customers">
      <Empty>Customers come to the app soon. Until then, find them on the website.</Empty>
      {API_URL ? (
        <Button
          title="Open Customers on the Website"
          kind="secondary"
          onPress={() => void Linking.openURL(`${API_URL}/customers`)}
        />
      ) : null}
    </Screen>
  );
}
