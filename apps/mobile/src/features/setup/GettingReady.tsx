import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedProps,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import Svg, { ClipPath, Defs, Path, Rect } from "react-native-svg";
import {
  downloadCount,
  downloadProgress,
  type DownloadKind,
  type DownloadProgress,
} from "@leakbook/core";
import type { DownloadState } from "@leakbook/sync";
import { Group, useReduceMotion } from "../../ui/components";
import { WebIcon, type WebIconName } from "../../ui/WebIcon";
import { color, font, MAX_TEXT_SCALE, minTap, space, tabular, type } from "../../ui/theme";
import { waterPath } from "../../lib/poolWave";

const AnimatedPath = Animated.createAnimatedComponent(Path);

/** The pool: about 220 by 120 pt (gestures spec section 11). */
const W = 220;
const H = 120;
const STROKE = 2;
/** Where the water sits while the count isn't known: it moves, with no percent. */
const UNKNOWN_LEVEL = 0.4;

const ICONS: Record<string, WebIconName> = {
  settings: "more",
  customers: "today",
  pools: "pin",
  jobs: "jobs",
  photos: "photos",
  paperwork: "note",
  messages: "messages",
};

/**
 * Getting Ready (owner, 2026-10-20: "Downloading your company takes a long time. Give a more
 * interesting loading bar."; gestures spec section 11): a pool that fills to the real progress
 * with a slow wave on its surface, the percent under it, the kinds of things being downloaded
 * with their counts, and a footer. When it's done the water reaches the top and the percent
 * turns into a checkmark. Under Reduce Motion the surface is flat and the level steps.
 */
export function GettingReady({
  download,
  finishing,
}: {
  download: DownloadState | null;
  /** The download has finished: full pool and the checkmark. */
  finishing: boolean;
}) {
  const p: DownloadProgress = downloadProgress(download?.pulled ?? {}, download?.totals ?? null);
  const fraction = finishing ? 1 : p.fraction;
  const percent = useRolling(fraction == null ? null : Math.floor(fraction * 100));
  const spoken = finishing ? "Your company is downloaded." : p.spoken;
  return (
    <View style={styles.wrap}>
      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel="Downloading your company"
        accessibilityValue={
          fraction == null
            ? { text: spoken }
            : { min: 0, max: 100, now: Math.floor(fraction * 100), text: spoken }
        }
        style={styles.poolBlock}
      >
        <Pool level={fraction ?? UNKNOWN_LEVEL} />
        <View style={styles.figure}>
          {finishing ? (
            <WebIcon name="check" size={34} color={color.link} strokeWidth={3} />
          ) : (
            <Text
              style={[styles.percent, tabular, { color: color.text }]}
              maxFontSizeMultiplier={MAX_TEXT_SCALE}
            >
              {percent == null ? " " : `${percent}%`}
            </Text>
          )}
        </View>
        <Text
          style={[type.body, { color: color.textMuted, textAlign: "center" }]}
          maxFontSizeMultiplier={MAX_TEXT_SCALE}
        >
          Downloading your company
        </Text>
      </View>

      {p.kinds.length ? (
        <Group separatorInset={space["4"] + 28}>
          {p.kinds.map((k) => (
            <KindRow
              key={k.key}
              kind={k}
              current={!finishing && p.current?.key === k.key}
              done={finishing || k.complete}
            />
          ))}
        </Group>
      ) : null}

      <Text
        style={[type.secondary, { color: color.textMuted, textAlign: "center" }]}
        maxFontSizeMultiplier={MAX_TEXT_SCALE}
      >
        This happens once. After this, the app works without signal.
      </Text>
    </View>
  );
}

function KindRow({ kind, current, done }: { kind: DownloadKind; current: boolean; done: boolean }) {
  return (
    <View
      accessible
      accessibilityLabel={done ? `${kind.label}, done` : `${kind.label}, ${downloadCount(kind)}`}
      style={styles.row}
    >
      <WebIcon name={ICONS[kind.key] ?? "more"} size={20} color={color.textMuted} />
      <Text
        style={[type.body, { flex: 1, color: color.text }]}
        maxFontSizeMultiplier={MAX_TEXT_SCALE}
        numberOfLines={2}
      >
        {kind.label}
      </Text>
      <Text
        style={[type.secondary, tabular, { color: color.textMuted }]}
        maxFontSizeMultiplier={MAX_TEXT_SCALE}
      >
        {downloadCount(kind)}
      </Text>
      <View style={styles.state}>
        {done ? (
          <WebIcon name="check" size={18} color={color.link} strokeWidth={2.6} />
        ) : current ? (
          <ActivityIndicator size="small" color={color.textMuted} />
        ) : null}
      </View>
    </View>
  );
}

/**
 * The pool outline with the water in it: the level eases to each new value over 0.4 s, and the
 * surface waves on a 2 s loop. Reduce Motion: a flat surface and a level that steps.
 */
function Pool({ level }: { level: number }) {
  const reduceMotion = useReduceMotion();
  const height = useSharedValue(level);
  const phase = useSharedValue(0);
  const wave = useSharedValue(reduceMotion ? 0 : 1);

  useEffect(() => {
    height.set(reduceMotion ? level : withTiming(level, { duration: 400 }));
  }, [level, reduceMotion, height]);

  useEffect(() => {
    if (reduceMotion) {
      cancelAnimation(phase);
      wave.set(0);
      return;
    }
    wave.set(1);
    phase.set(0);
    phase.set(withRepeat(withTiming(1, { duration: 2000, easing: Easing.linear }), -1, false));
    return () => cancelAnimation(phase);
  }, [reduceMotion, phase, wave]);

  const props = useAnimatedProps(() => ({
    d: waterPath(W, H, height.value, phase.value, wave.value),
  }));

  const radius = 28;
  return (
    <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <Defs>
        <ClipPath id="pool">
          <Rect x={0} y={0} width={W} height={H} rx={radius} ry={radius} />
        </ClipPath>
      </Defs>
      <AnimatedPath animatedProps={props} fill={color.water} clipPath="url(#pool)" />
      <Rect
        x={STROKE / 2}
        y={STROKE / 2}
        width={W - STROKE}
        height={H - STROKE}
        rx={radius - STROKE / 2}
        ry={radius - STROKE / 2}
        stroke={color.controlBorder}
        strokeWidth={STROKE}
        fill="none"
      />
    </Svg>
  );
}

/** A number that rolls to each new value over 0.4 s (steps under Reduce Motion). */
function useRolling(target: number | null): number | null {
  const reduceMotion = useReduceMotion();
  const [shown, setShown] = useState(target ?? 0);
  const from = useRef(target ?? 0);
  const still = target == null || reduceMotion;
  useEffect(() => {
    if (target == null || still) {
      from.current = target ?? 0;
      return;
    }
    const start = from.current;
    const began = Date.now();
    let frame = 0;
    const step = () => {
      const t = Math.min(1, (Date.now() - began) / 400);
      const v = Math.round(start + (target - start) * (1 - (1 - t) * (1 - t)));
      from.current = v;
      setShown(v);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, still]);
  return still ? target : shown;
}

const styles = StyleSheet.create({
  wrap: { gap: space["5"], paddingVertical: space["4"] },
  poolBlock: { alignItems: "center", gap: space["2"] },
  figure: { minHeight: 42, justifyContent: "center", marginTop: space["2"] },
  percent: { fontFamily: font.displayExtraBold, fontSize: 34, lineHeight: 42 },
  row: {
    minHeight: minTap,
    flexDirection: "row",
    alignItems: "center",
    gap: space["2"],
    paddingHorizontal: space["4"],
    paddingVertical: 10,
  },
  state: { width: 22, alignItems: "center" },
});
