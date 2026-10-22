import Svg, { Circle, Path } from "react-native-svg";
import type { DayProgress } from "@leakbook/core";
import { color } from "./theme";

/**
 * The day's progress ring on Today's summary line (owner, 2026-10-22, goal-gradient; docs/
 * design/2026-10-22-progress-cues.md), as on the website: 28 pt, the primary blue on a gray
 * track; with every stop done, a filled green circle with a check. The words beside it carry
 * the count, so the ring is hidden from TalkBack and VoiceOver.
 */
export function DayRing({ progress, size = 28 }: { progress: DayProgress; size?: number }) {
  const r = 11;
  const c = 2 * Math.PI * r;
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      testID="day-ring"
    >
      {progress.state === "all_done" ? (
        <>
          <Circle cx={14} cy={14} r={13} fill={color.pass} />
          <Path
            d="M8.5 14.5l3.6 3.6 7.4-8"
            fill="none"
            stroke="#FFFFFF"
            strokeWidth={2.6}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      ) : (
        <>
          <Circle cx={14} cy={14} r={r} fill="none" stroke={color.fill} strokeWidth={4} />
          {progress.fraction > 0 ? (
            <Circle
              cx={14}
              cy={14}
              r={r}
              fill="none"
              stroke={color.primary}
              strokeWidth={4}
              strokeLinecap="round"
              strokeDasharray={`${c * progress.fraction} ${c}`}
              transform="rotate(-90 14 14)"
            />
          ) : null}
        </>
      )}
    </Svg>
  );
}
