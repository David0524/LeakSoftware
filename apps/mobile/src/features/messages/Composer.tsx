import { useEffect, useState } from "react";
import {
  Alert,
  Image,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { chooseFromLibrary } from "../../lib/media";
import { Button, T } from "../../ui/components";
import { Glass } from "../../ui/Glass";
import { color, MAX_TEXT_SCALE, minTap, shape, space, type } from "../../ui/theme";
import { WebIcon } from "../../ui/WebIcon";
import { useUnsavedChanges } from "../../ui/ModalSheet";

/** Where the floating tab bar's top is, from the bottom of the screen. */
export function useTabBarTop(): number {
  const insets = useSafeAreaInsets();
  return Math.max(12, insets.bottom) + 58;
}

/** The keyboard's height while it's up (iPhone; Android resizes the window instead). */
function useKeyboardHeight(): number {
  const [h, setH] = useState(0);
  useEffect(() => {
    if (Platform.OS !== "ios") return;
    const show = Keyboard.addListener("keyboardWillShow", (e) => setH(e.endCoordinates.height));
    const hide = Keyboard.addListener("keyboardWillHide", () => setH(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return h;
}

/**
 * The composer (spec 5.7): a round camera button when the number takes pictures, the text
 * field ("Text message", growing to 5 lines), and Send. `docked` floats it above the tab bar
 * (above the keyboard while typing) on the bar material; otherwise it sits in the page.
 */
export function Composer({
  pictures,
  onSend,
  docked = true,
  autoFocus = false,
}: {
  pictures: boolean;
  onSend: (body: string, picture: { uri: string; type: string } | null) => Promise<boolean>;
  docked?: boolean;
  autoFocus?: boolean;
}) {
  const [body, setBody] = useState("");
  const [picture, setPicture] = useState<{ uri: string; type: string } | null>(null);
  const [sending, setSending] = useState(false);
  // A message typed but not sent asks before leaving (owner, 2026-10-20).
  useUnsavedChanges(!sending && (Boolean(body.trim()) || picture !== null));
  const barTop = useTabBarTop();
  const keyboard = useKeyboardHeight();

  async function addPicture() {
    try {
      const file = await chooseFromLibrary("photo");
      if (file) setPicture({ uri: file.uri, type: file.mime });
    } catch (e) {
      Alert.alert("Couldn’t add the photo", e instanceof Error ? e.message : String(e));
    }
  }

  async function send() {
    if ((!body.trim() && !picture) || sending) return;
    setSending(true);
    const ok = await onSend(body, picture);
    setSending(false);
    if (ok) {
      setBody("");
      setPicture(null);
    }
  }

  const inner = (
    <View style={{ gap: space["2"] }}>
      {picture ? (
        <View style={styles.row}>
          <Image
            source={{ uri: picture.uri }}
            style={styles.thumb}
            accessibilityLabel="Attached photo"
          />
          <Button title="Remove Photo" kind="quiet" onPress={() => setPicture(null)} />
        </View>
      ) : null}
      <View style={styles.row}>
        {pictures ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add Photos"
            onPress={() => void addPicture()}
            style={({ pressed }) => [
              styles.round,
              { backgroundColor: pressed ? color.tintedPressed : color.iconTint },
            ]}
          >
            <WebIcon name="camera" size={20} color={color.link} />
          </Pressable>
        ) : null}
        <TextInput
          value={body}
          onChangeText={setBody}
          placeholder="Text message"
          placeholderTextColor={color.placeholder}
          accessibilityLabel="Text message"
          multiline
          autoFocus={autoFocus}
          maxLength={1600}
          maxFontSizeMultiplier={MAX_TEXT_SCALE}
          style={[
            styles.input,
            type.body,
            { borderColor: color.controlBorder, backgroundColor: color.surface, color: color.text },
          ]}
        />
        <Button
          title={sending ? "Sending…" : "Send"}
          onPress={() => void send()}
          disabled={sending || (!body.trim() && !picture)}
        />
      </View>
      {picture ? (
        <T variant="footnote" muted>
          1 photo attached
        </T>
      ) : null}
    </View>
  );

  if (!docked) return inner;
  return (
    <View
      style={[styles.dock, { bottom: keyboard ? keyboard + space["2"] : barTop + space["2"] }]}
      pointerEvents="box-none"
    >
      <Glass variant="bar" style={styles.glass}>
        {inner}
      </Glass>
    </View>
  );
}

const styles = StyleSheet.create({
  dock: { position: "absolute", left: space["2"], right: space["2"] },
  glass: {
    borderRadius: shape.card,
    padding: space["2"],
    borderBottomWidth: 0,
    overflow: "hidden",
  },
  row: { flexDirection: "row", alignItems: "flex-end", gap: space["2"] },
  thumb: { width: 56, height: 56, borderRadius: 10 },
  round: {
    width: minTap,
    height: minTap,
    borderRadius: minTap / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  input: {
    flex: 1,
    minHeight: minTap,
    maxHeight: 5 * 25.5 + 20,
    paddingHorizontal: 16,
    paddingTop: 9,
    paddingBottom: 9,
    borderRadius: shape.composer,
    borderWidth: 1,
  },
});
