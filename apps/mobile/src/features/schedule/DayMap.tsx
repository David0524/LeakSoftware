import { useEffect, useState } from "react";
import {
  Image,
  LayoutAnimation,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ImageURISource,
} from "react-native";
import { API_URL } from "../../lib/config";
import { mapAlt, mapUrl, missingNote, stopsLabel } from "../../lib/dayMap";
import { getServices } from "../../lib/services";
import { Group, T, useReduceMotion } from "../../ui/components";
import { ModalSheet } from "../../ui/ModalSheet";
import {
  appearance,
  color,
  face,
  font,
  MAX_TEXT_SCALE,
  minTap,
  shape,
  space,
  tabular,
  tint,
  type,
} from "../../ui/theme";
import { WebIcon } from "../../ui/WebIcon";

// A day's map on Schedule (owner, 2026-10-20, docs/plans/route-maps.md: "the maps up top for
// route building"), the website's day-map.tsx on Android: the shop and the stops as numbered
// pins in route order, drawn by the website (GET /api/map, signed in with the app's token; the
// shop's Mapbox allowance lives on the server, so the app never calls Mapbox). A Map row folds
// it away, remembered on the phone (owner decision 4). The box keeps its 2:1 shape while the
// image loads, so nothing below it moves; if it can't be drawn (offline, the day's maps used up,
// maps not set up), one quiet line takes its place. Tapping the map, or Enlarge, opens a sheet
// with a larger map and the day's stops. An interactive map here is a follow-up: the large map
// is an image for now.

/** The day's stops, for Enlarge's list (numbered by their place in the day, as the pins are). */
export interface MapListStop {
  id: string;
  time: string | null;
  customer: string;
  /** Under the name instead of a time (Routes: the pool's address). */
  detail?: string;
}

const OPEN_KEY = "schedule:dayMapOpen";

/** Mapbox's dark map in dark appearance (the image is drawn dark, not dimmed). */
const mapTheme = () => (appearance.scheme === "dark" ? "dark" : "light");

function readOpen(): boolean {
  try {
    return getServices().kv.get(OPEN_KEY) !== "0";
  } catch {
    return true;
  }
}

function writeOpen(open: boolean) {
  try {
    getServices().kv.set(OPEN_KEY, open ? "1" : "0");
  } catch {
    // Kept for this run only.
  }
}

/** The app's sign-in token for the website, read once per screen (null while it's read). */
function useToken(): string | null {
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    let gone = false;
    void getServices()
      .sync.accessToken()
      .then((t) => {
        if (!gone) setToken(t);
      })
      .catch(() => {});
    return () => {
      gone = true;
    };
  }, []);
  return token;
}

/** The map image in a box of fixed shape, rounded like the cards; reports when it fails. */
function MapImage({
  source,
  alt,
  ratio,
  onFail,
}: {
  source: ImageURISource;
  alt: string;
  ratio: number;
  onFail: () => void;
}) {
  return (
    <View style={[styles.box, { aspectRatio: ratio, backgroundColor: color.fill }]}>
      <Image
        source={source}
        accessible
        accessibilityRole="image"
        accessibilityLabel={alt}
        resizeMode="cover"
        onError={onFail}
        style={StyleSheet.absoluteFill}
      />
      {/* A hairline inside the edge, so the map sits in the card rather than on it. */}
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, styles.ring, { borderColor: color.separator }]}
      />
    </View>
  );
}

/** The Map row's chevron: right when folded, down when open. */
function Disclosure({ open }: { open: boolean }) {
  return (
    <View style={{ transform: [{ rotate: open ? "90deg" : "0deg" }] }}>
      <WebIcon name="chevronRight" size={16} color={color.textMuted} strokeWidth={2.4} />
    </View>
  );
}

/**
 * One tech's day as a map, at the top of Schedule › Day: the Map row, the map with Enlarge on
 * its corner, and "N stops aren't on the map" under it when needed.
 */
export function DayMap({
  company,
  pins,
  stops,
  missing,
  tech,
  day,
}: {
  company: string;
  /** encodePins of the day's pins; null when no stop is on the map. */
  pins: string | null;
  stops: MapListStop[];
  missing: number;
  tech: string;
  /** "Monday". */
  day: string;
}) {
  const token = useToken();
  const reduceMotion = useReduceMotion();
  const [open, setOpen] = useState(readOpen);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const [enlarged, setEnlarged] = useState(false);
  const src = pins ? mapUrl(API_URL, company, pins, { w: 640, h: 320 }, mapTheme()) : null;
  const failed = !!src && failedSrc === src;
  const shown = !!src && !!token && !failed;
  const note = missingNote(missing);
  const alt = mapAlt(tech, day, stops.length);
  if (!pins && !missing) return null;

  const toggle = () => {
    if (!reduceMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen(!open);
    writeOpen(!open);
  };

  return (
    <View>
      {shown ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Map"
          accessibilityState={{ expanded: open }}
          onPress={toggle}
          style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
        >
          <Text
            style={[type.body, face.semiBold, { flex: 1, color: color.text }]}
            maxFontSizeMultiplier={MAX_TEXT_SCALE}
          >
            Map
          </Text>
          <Text
            style={[type.secondary, { color: color.textMuted }]}
            maxFontSizeMultiplier={MAX_TEXT_SCALE}
          >
            {open ? "Hide" : stopsLabel(stops.length)}
          </Text>
          <Disclosure open={open} />
        </Pressable>
      ) : null}
      {shown && open ? (
        <View>
          {/* The map itself opens Enlarge too (Enlarge is the button for screen readers). */}
          <Pressable
            accessible={false}
            onPress={() => setEnlarged(true)}
            style={({ pressed }) => pressed && { opacity: 0.85 }}
          >
            <MapImage
              source={{ uri: src, headers: { Authorization: `Bearer ${token}` } }}
              alt={alt}
              ratio={2}
              onFail={() => setFailedSrc(src)}
            />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Enlarge Map"
            onPress={() => setEnlarged(true)}
            hitSlop={4}
            style={({ pressed }) => [
              styles.enlarge,
              { backgroundColor: pressed ? color.surface : tint(color.surface, 0.9) },
            ]}
          >
            <WebIcon name="expand" size={20} color={color.link} />
          </Pressable>
        </View>
      ) : null}
      {failed ? (
        <T variant="secondary" muted>
          Map not available right now.
        </T>
      ) : note && (open || !shown) ? (
        <T variant="secondary" muted style={{ marginTop: space["1"] }}>
          {note}
        </T>
      ) : null}
      {shown && pins ? (
        <EnlargeSheet
          open={enlarged}
          onClose={() => setEnlarged(false)}
          company={company}
          pins={pins}
          token={token}
          tech={tech}
          day={day}
          stops={stops}
          note={note}
          alt={alt}
        />
      ) : null}
    </View>
  );
}

/** The large map and the day's stops below it, in a sheet titled "{Tech} · {Monday}". */
function EnlargeSheet({
  open,
  onClose,
  company,
  pins,
  token,
  tech,
  day,
  stops,
  note,
  alt,
}: {
  open: boolean;
  onClose: () => void;
  company: string;
  pins: string;
  token: string;
  tech: string;
  day: string;
  stops: MapListStop[];
  note: string | null;
  alt: string;
}) {
  const [failed, setFailed] = useState(false);
  const src = mapUrl(API_URL, company, pins, { w: 960, h: 640 }, mapTheme());
  return (
    <ModalSheet visible={open} onClose={onClose} title={`${tech} · ${day}`} cancel="Close">
      <View style={{ gap: space["2"] }}>
        {failed || !src ? (
          <T variant="secondary" muted>
            The map couldn’t be drawn right now.
          </T>
        ) : (
          <MapImage
            source={{ uri: src, headers: { Authorization: `Bearer ${token}` } }}
            alt={alt}
            ratio={3 / 2}
            onFail={() => setFailed(true)}
          />
        )}
        {note ? (
          <T variant="secondary" muted>
            {note}
          </T>
        ) : null}
      </View>
      <View accessibilityLabel={`Stops on ${day}`}>
        <Group separatorInset={space["4"] + 28 + space["3"]}>
          {stops.map((s, i) => (
            <View
              key={s.id}
              accessible
              accessibilityLabel={
                s.detail !== undefined
                  ? `Stop ${i + 1}: ${s.customer}${s.detail ? `, ${s.detail}` : ""}`
                  : `Stop ${i + 1}: ${s.time ?? "No time"}, ${s.customer}`
              }
              style={styles.stop}
            >
              <View style={[styles.number, { backgroundColor: color.fill }]}>
                <Text
                  style={[styles.numberText, tabular, { color: color.text }]}
                  maxFontSizeMultiplier={1.6}
                >
                  {i + 1}
                </Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  style={[type.body, face.semiBold, tabular, { color: color.text }]}
                  maxFontSizeMultiplier={MAX_TEXT_SCALE}
                >
                  {s.detail !== undefined ? s.customer : (s.time ?? "No time")}
                </Text>
                {s.detail !== undefined && !s.detail ? null : (
                  <Text
                    numberOfLines={1}
                    style={[type.secondary, { color: color.textMuted }]}
                    maxFontSizeMultiplier={MAX_TEXT_SCALE}
                  >
                    {s.detail !== undefined ? s.detail : s.customer}
                  </Text>
                )}
              </View>
            </View>
          ))}
        </Group>
      </View>
    </ModalSheet>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space["2"],
    minHeight: minTap,
  },
  box: { width: "100%", borderRadius: shape.card, overflow: "hidden" },
  ring: { borderRadius: shape.card, borderWidth: StyleSheet.hairlineWidth },
  enlarge: {
    position: "absolute",
    top: space["2"],
    right: space["2"],
    width: minTap,
    height: minTap,
    borderRadius: minTap / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  stop: {
    flexDirection: "row",
    alignItems: "center",
    gap: space["3"],
    minHeight: minTap,
    paddingHorizontal: space["4"],
    paddingVertical: space["2"],
  },
  number: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  numberText: { fontFamily: font.displayBold, fontSize: 15, lineHeight: 20 },
});
