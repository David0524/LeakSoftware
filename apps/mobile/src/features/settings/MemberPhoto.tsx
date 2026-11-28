import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import {
  TECH_CARD_TEXT,
  friendlyError,
  memberPhotoPath,
  uploadRefusal,
  uploadRefusalMessage,
} from "@leakbook/core";
import { useTeam } from "../../data/schedule";
import { getServices } from "../../lib/services";
import { useCompany } from "../../state/session";
import { Button, Group, Section, T } from "../../ui/components";
import { confirmDestructive } from "../../ui/confirm";
import { haptics } from "../../ui/haptics";
import { TechPhoto } from "../../ui/TechPhoto";
import { color, minTap, space } from "../../ui/theme";

// A team member's photo (docs/design/2026-11-26-second-business-and-tech-photos.md): shown at
// the end of reports when the shop turns on Show the Tech on Reports. Settings › Team (owners
// and admins, anyone's) and More › My Profile (your own). Picked square, center-cropped and saved
// at 512 px as JPEG under a new name each time (so sent reports keep theirs), then set with
// set_member_photo. Both need a connection; the membership row then syncs back.

const OFFLINE = "You’re offline. Try again with signal.";

/** A picked photo as a square JPEG at TECH_CARD_TEXT.size; null when cancelled. */
async function pickSquarePhoto(): Promise<string | null> {
  const pick = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1,
  });
  const asset = pick.canceled ? null : pick.assets[0];
  if (!asset) return null;
  const ctx = ImageManipulator.manipulate(asset.uri);
  // The picker's square crop isn't promised everywhere: crop the center square too.
  const { width, height } = asset;
  if (width > 0 && height > 0 && width !== height) {
    const side = Math.min(width, height);
    ctx.crop({
      originX: Math.floor((width - side) / 2),
      originY: Math.floor((height - side) / 2),
      width: side,
      height: side,
    });
  }
  ctx.resize({ width: TECH_CARD_TEXT.size, height: TECH_CARD_TEXT.size });
  const image = await ctx.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
  return saved.uri;
}

/**
 * The Photo row: the round photo (or the initial on their color) and Add Photo, or Change Photo
 * and Remove Photo.
 */
export function MemberPhoto({
  membershipId,
  title,
  footer,
}: {
  membershipId: string;
  /** The section's title: Photo (Team) or Your Photo (My Profile). */
  title: string;
  footer?: string;
}) {
  const company = useCompany();
  const member = useTeam(company.id).find((m) => m.membership_id === membershipId);
  // What was just set on this phone, until the membership row syncs back.
  const [local, setLocal] = useState<{ uri: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!member) return null;
  const synced = member.photo_path;
  const has = local ? local.uri !== null : Boolean(synced);

  /** set_member_photo, then a sync so the membership row brings the new path. */
  async function setPath(path: string | null): Promise<string | null> {
    const { supabase, sync } = getServices();
    const { error: e } = await supabase.rpc("set_member_photo", {
      target_member: membershipId,
      path,
    });
    if (e) return friendlyError(e.message);
    void sync.syncNow().catch(() => undefined);
    return null;
  }

  async function choose() {
    if (!member) return;
    setError(null);
    let uri: string | null;
    try {
      uri = await pickSquarePhoto();
    } catch {
      setError("Couldn’t open that picture. Try another one.");
      return;
    }
    if (!uri) return;
    setBusy(true);
    try {
      const body = await (await fetch(uri)).arrayBuffer();
      const path = memberPhotoPath(company.id, member.user_id, Date.now());
      const { error: up } = await getServices()
        .supabase.storage.from("company-assets")
        .upload(path, body, { contentType: "image/jpeg", upsert: false });
      if (up) {
        const refusal = uploadRefusal(null, up.message);
        setError(refusal ? uploadRefusalMessage(refusal, "logo") : friendlyError(up.message));
        return;
      }
      const failed = await setPath(path);
      if (failed) return setError(failed);
      setLocal({ uri });
      haptics.success();
    } catch {
      setError(OFFLINE);
    } finally {
      setBusy(false);
    }
  }

  function remove() {
    if (!member) return;
    confirmDestructive({
      title: `Remove ${member.name}’s photo? Reports already sent keep it.`,
      confirm: TECH_CARD_TEXT.removePhoto,
      onConfirm: () => {
        setError(null);
        setBusy(true);
        void setPath(null)
          .then((failed) => {
            if (failed) return setError(failed);
            setLocal({ uri: null });
            haptics.success();
          })
          .catch(() => setError(OFFLINE))
          .finally(() => setBusy(false));
      },
    });
  }

  return (
    <Section title={title} footer={footer}>
      <Group>
        <View style={styles.row}>
          <TechPhoto
            name={member.name}
            tech={member.color}
            path={local ? null : synced}
            uri={local?.uri ?? null}
            size={64}
          />
          <View style={styles.actions}>
            <Button
              title={has ? TECH_CARD_TEXT.changePhoto : TECH_CARD_TEXT.addPhoto}
              kind="secondary"
              loading={busy}
              onPress={() => void choose()}
            />
            {has ? (
              <Button
                title={TECH_CARD_TEXT.removePhoto}
                kind="danger"
                disabled={busy}
                onPress={remove}
              />
            ) : null}
          </View>
        </View>
        {error ? (
          <View style={styles.error}>
            <T variant="secondary" style={{ color: color.fail }}>
              {error}
            </T>
          </View>
        ) : null}
      </Group>
    </Section>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space["3"],
    minHeight: minTap,
    paddingHorizontal: space["4"],
    paddingVertical: space["3"],
  },
  actions: { flex: 1, flexDirection: "row", flexWrap: "wrap", gap: space["2"] },
  error: { paddingHorizontal: space["4"], paddingBottom: space["3"] },
});
