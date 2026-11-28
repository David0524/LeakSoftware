import { useEffect, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { textOnBrand, techInitial } from "@leakbook/core";
import { tokens } from "@leakbook/tokens";
import { getServices } from "../lib/services";
import { techHex } from "./TechDot";
import { MAX_TEXT_SCALE, face } from "./theme";

// A tech's photo, round (docs/design/2026-11-26-second-business-and-tech-photos.md): their
// membership photo from company-assets, else their first initial on their team color, as the
// report's tech card shows them.

/** Signed links already made, by path (a photo's path never changes), with when they expire. */
const signed = new Map<string, { url: string; until: number }>();
const fresh = (path: string) => {
  const s = signed.get(path);
  return s && s.until > Date.now() ? s.url : null;
};

/** A short-lived link to a photo in company-assets; null while loading or without one. */
function useSignedPhoto(path: string | null | undefined): string | null {
  // Bumped when a new link arrives, to read it from `signed`.
  const [, setLoaded] = useState(0);
  useEffect(() => {
    if (!path || fresh(path)) return;
    let live = true;
    void getServices()
      .supabase.storage.from("company-assets")
      .createSignedUrl(path, 3600)
      .then(({ data }) => {
        if (!data?.signedUrl) return;
        // Good for an hour; made again after 50 minutes.
        signed.set(path, { url: data.signedUrl, until: Date.now() + 50 * 60 * 1000 });
        if (live) setLoaded((n) => n + 1);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [path]);
  return path ? (fresh(path) ?? signed.get(path)?.url ?? null) : null;
}

export function TechPhoto({
  name,
  tech,
  path,
  uri,
  size = 44,
}: {
  name: string;
  /** The membership's color key (null: Slate). */
  tech: string | null | undefined;
  /** The member's photo_path in company-assets. */
  path?: string | null;
  /** A local picture shown instead (just picked, while it uploads). */
  uri?: string | null;
  size?: number;
}) {
  const remote = useSignedPhoto(uri ? null : path);
  const source = uri ?? remote;
  const round = { width: size, height: size, borderRadius: size / 2 };
  if (source)
    return (
      <Image
        source={{ uri: source }}
        style={[styles.photo, round]}
        accessibilityLabel={`Photo of ${name}`}
      />
    );
  const bg = techHex(tech);
  return (
    <View
      style={[styles.initial, round, { backgroundColor: bg }]}
      accessibilityLabel={`No photo of ${name}`}
    >
      <Text
        style={[
          face.semiBold,
          {
            fontSize: Math.round(size * 0.42),
            color: textOnBrand(bg, tokens.color.brand.navy, tokens.color.brand.paper),
          },
        ]}
        maxFontSizeMultiplier={MAX_TEXT_SCALE}
      >
        {techInitial(name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  photo: { flexShrink: 0 },
  initial: { alignItems: "center", justifyContent: "center", flexShrink: 0 },
});
