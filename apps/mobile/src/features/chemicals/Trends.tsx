import { useMemo, useState } from "react";
import { View } from "react-native";
import Svg, { Circle, G, Line, Polyline, Rect, Text as SvgText } from "react-native-svg";
import {
  TREND_PERIODS,
  chemicalCostBars,
  costSummary,
  formatCents,
  readingSeries,
  trendWindow,
  type ChemicalAddition,
  type ChemicalReading,
  type CostBar,
  type ReadingSeries,
  type TrendPeriod,
} from "@leakbook/core";
import { Card, Empty, Section, Segmented, T } from "../../ui/components";
import { color, space, tabular } from "../../ui/theme";

// Trends on a pool's chemical log (docs/design/2026-11-16-chemistry-trends.md; the website's
// components/chem-trends.tsx): 90 Days | 6 Months | 1 Year, a small line chart per reading with
// the pool's range shaded, and each month's chemical cost as bars when the shop charges.

const W = 320;
const H = 112;
const PAD_X = 8;
const PAD_Y = 10;
const STATUS_WORD = { low: "Low", ok: "In range", high: "High" } as const;

function shortDate(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone }).format(
    new Date(iso),
  );
}

function LineChart({
  series,
  from,
  to,
  timeZone,
}: {
  series: ReadingSeries;
  from: number;
  to: number;
  timeZone: string;
}) {
  const x = (iso: string) =>
    PAD_X + ((Date.parse(iso) - from) / Math.max(1, to - from)) * (W - PAD_X * 2);
  const y = (v: number) =>
    H - PAD_Y - ((v - series.min) / Math.max(1e-9, series.max - series.min)) * (H - PAD_Y * 2);
  const points = series.points.map((p) => ({ ...p, cx: x(p.at), cy: y(p.value) }));
  return (
    <Svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ aspectRatio: W / H }}>
      <Rect
        x={PAD_X}
        y={y(series.high)}
        width={W - PAD_X * 2}
        height={Math.max(2, y(series.low) - y(series.high))}
        rx={3}
        fill={color.pass}
        fillOpacity={0.2}
      />
      <Line
        x1={PAD_X}
        x2={W - PAD_X}
        y1={H - PAD_Y + 4}
        y2={H - PAD_Y + 4}
        stroke={color.separator}
        strokeWidth={1}
      />
      {points.length > 1 ? (
        <Polyline
          points={points.map((p) => `${p.cx.toFixed(1)},${p.cy.toFixed(1)}`).join(" ")}
          fill="none"
          stroke={color.link}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ) : null}
      {points.map((p) => (
        <Circle
          key={p.at}
          cx={p.cx}
          cy={p.cy}
          r={3.5}
          fill={p.value < series.low || p.value > series.high ? color.fail : color.link}
        />
      ))}
      <SvgText x={PAD_X} y={H} fontSize={9} fill={color.textMuted}>
        {shortDate(new Date(from).toISOString(), timeZone)}
      </SvgText>
      <SvgText x={W - PAD_X} y={H} fontSize={9} fill={color.textMuted} textAnchor="end">
        {shortDate(new Date(to).toISOString(), timeZone)}
      </SvgText>
    </Svg>
  );
}

function CostChart({ bars }: { bars: CostBar[] }) {
  const max = Math.max(1, ...bars.map((b) => b.cents));
  const slot = (W - PAD_X * 2) / bars.length;
  const bw = Math.min(28, slot * 0.6);
  return (
    <Svg width="100%" viewBox={`0 0 ${W} ${H + 8}`} style={{ aspectRatio: W / (H + 8) }}>
      {bars.map((b, i) => {
        const h = (b.cents / max) * (H - PAD_Y * 2 - 8);
        const cx = PAD_X + slot * i + slot / 2;
        return (
          <G key={b.month}>
            <Rect
              x={cx - bw / 2}
              y={H - PAD_Y - h}
              width={bw}
              height={Math.max(h, b.cents > 0 ? 2 : 0)}
              rx={3}
              fill={color.link}
            />
            {b.cents > 0 ? (
              <SvgText
                x={cx}
                y={H - PAD_Y - h - 3}
                fontSize={8}
                fill={color.textMuted}
                textAnchor="middle"
              >
                {formatCents(b.cents).replace(/\.00$/, "")}
              </SvgText>
            ) : null}
            <SvgText x={cx} y={H + 6} fontSize={9} fill={color.textMuted} textAnchor="middle">
              {b.label}
            </SvgText>
          </G>
        );
      })}
    </Svg>
  );
}

/** The pool's trends: its log (a year's worth) and the year's added chemicals. */
export function PoolTrends({
  readings,
  additions,
  charges,
  timeZone,
}: {
  readings: ChemicalReading[];
  additions: ChemicalAddition[];
  charges: boolean;
  timeZone: string;
}) {
  const [period, setPeriod] = useState<TrendPeriod>("90d");
  const now = useMemo(() => new Date().toISOString(), []);
  const series = useMemo(() => readingSeries(readings, period, now), [readings, period, now]);
  const bars = useMemo(
    () => chemicalCostBars(additions, period, now, timeZone),
    [additions, period, now, timeZone],
  );
  const win = trendWindow(period, now);
  const from = Date.parse(win.from);
  const to = Date.parse(win.to);
  const total = bars.reduce((sum, b) => sum + b.cents, 0);
  return (
    <Section title="Trends">
      <View style={{ gap: space["3"] }}>
        <Segmented
          label="Period"
          accessibilityLabel="Trend period"
          value={period}
          onChange={setPeriod}
          options={TREND_PERIODS.map((p) => ({ value: p.key, label: p.label }))}
        />
        {series.length === 0 ? (
          <Empty>No readings in this period.</Empty>
        ) : (
          series.map((s) => (
            <Card key={s.key} style={{ gap: space["2"] }}>
              <View
                style={{ flexDirection: "row", justifyContent: "space-between", gap: space["2"] }}
              >
                <T variant="bodyEmphasis">{s.label}</T>
                <T
                  muted={s.status === "ok"}
                  style={[tabular, s.status !== "ok" && { color: color.fail }]}
                >
                  {`${s.latest} · ${STATUS_WORD[s.status]}`}
                </T>
              </View>
              <View accessible accessibilityRole="image" accessibilityLabel={s.summary}>
                <LineChart series={s} from={from} to={to} timeZone={timeZone} />
              </View>
              <T variant="secondary" muted>
                {`Aim for ${s.low}–${s.high} · ${s.points.length} ${s.points.length === 1 ? "reading" : "readings"}`}
              </T>
            </Card>
          ))
        )}
        {charges && total > 0 ? (
          <Card style={{ gap: space["2"] }}>
            <View
              style={{ flexDirection: "row", justifyContent: "space-between", gap: space["2"] }}
            >
              <T variant="bodyEmphasis">Chemical Cost</T>
              <T muted style={tabular}>
                {formatCents(total)}
              </T>
            </View>
            <View accessible accessibilityRole="image" accessibilityLabel={costSummary(bars)}>
              <CostChart bars={bars} />
            </View>
            <T variant="secondary" muted>
              Each month’s added chemicals.
            </T>
          </Card>
        ) : null}
      </View>
    </Section>
  );
}
