import { useState } from "react";
import { View } from "react-native";
import {
  FINISH_SETUP_BODY,
  FINISH_SETUP_FAILED,
  FINISH_SETUP_OFFLINE,
  FINISH_SETUP_STILL,
  FINISH_SETUP_TITLE,
} from "@leakbook/core";
import { Button, Notice, Screen, T } from "../ui/components";
import { AuthTitle, BrandHeader } from "../ui/BrandHeader";
import { useSession } from "../state/session";
import { color, ios } from "../ui/theme";

/**
 * The owner of a shop whose setup isn't finished (owner, 2026-10-24: "shops should have to
 * submit a credit card for the trial"). The website takes them to its trial page; the app only
 * says to finish on the website: no link, button or price, since an iPhone app may not send
 * people to an outside purchase (App Store rule 3.1.1), and Android says the same.
 */
export default function FinishSetup() {
  const { user, checkSetup, signOut } = useSession();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function check() {
    setMessage(null);
    setBusy(true);
    const result = await checkSetup();
    setBusy(false);
    // "done" opens the app by itself (the root stack's guard).
    if (result === "needed") setMessage(FINISH_SETUP_STILL);
    else if (result === "offline") setMessage(FINISH_SETUP_OFFLINE);
    else if (result === "failed") setMessage(FINISH_SETUP_FAILED);
  }

  return (
    <View style={{ flex: 1, backgroundColor: color.bg }}>
      {ios ? null : <BrandHeader />}
      <Screen>
        <AuthTitle title={FINISH_SETUP_TITLE} />
        <T variant="muted" style={ios && { textAlign: "center" }}>
          Signed in as {user?.email}
        </T>
        <T style={ios && { textAlign: "center" }}>{FINISH_SETUP_BODY}</T>
        {message ? <Notice tone="warning">{message}</Notice> : null}
        <Button title="Check Again" wide onPress={() => void check()} loading={busy} />
        <Button title="Sign Out" kind="quiet" onPress={() => void signOut()} />
      </Screen>
    </View>
  );
}
