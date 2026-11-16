"use client";

import { useMemo, useState } from "react";
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
import { Segmented } from "./segmented";
import { SectionTitle } from "./ui";

// Trends on a pool's chemical log (docs/design/2026-11-16-chemistry-trends.md): 90 Days | 6
// Months | 1 Year, a small line chart per reading with the pool's range shaded, and the month's
// chemical cost as bars when the shop charges for chemicals. Plain SVG.

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
  const outside = (v: number) => v < series.low || v > series.high;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={series.summary}
      className="block h-auto w-full"
    >
      <rect
        x={PAD_X}
        y={y(series.high)}
        width={W - PAD_X * 2}
        height={Math.max(2, y(series.low) - y(series.high))}
        rx={3}
        className="fill-status-pass/20"
      />
      <line
        x1={PAD_X}
        x2={W - PAD_X}
        y1={H - PAD_Y + 4}
        y2={H - PAD_Y + 4}
        className="stroke-separator"
        strokeWidth={1}
      />
      {points.length > 1 ? (
        <polyline
          points={points.map((p) => `${p.cx.toFixed(1)},${p.cy.toFixed(1)}`).join(" ")}
          fill="none"
          className="stroke-link"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ) : null}
      {points.map((p) => (
        <circle
          key={p.at}
          cx={p.cx}
          cy={p.cy}
          r={3.5}
          className={outside(p.value) ? "fill-status-fail" : "fill-link"}
        />
      ))}
      <text x={PAD_X} y={H} className="fill-text-muted text-[9px]">
        {shortDate(new Date(from).toISOString(), timeZone)}
      </text>
      <text x={W - PAD_X} y={H} textAnchor="end" className="fill-text-muted text-[9px]">
        {shortDate(new Date(to).toISOString(), timeZone)}
      </text>
    </svg>
  );
}

function CostChart({ bars }: { bars: CostBar[] }) {
  const max = Math.max(1, ...bars.map((b) => b.cents));
  const slot = (W - PAD_X * 2) / bars.length;
  const bw = Math.min(28, slot * 0.6);
  return (
    <svg
      viewBox={`0 0 ${W} ${H + 8}`}
      role="img"
      aria-label={costSummary(bars)}
      className="block h-auto w-full"
    >
      {bars.map((b, i) => {
        const h = (b.cents / max) * (H - PAD_Y * 2 - 8);
        const cx = PAD_X + slot * i + slot / 2;
        return (
          <g key={b.month}>
            <rect
              x={cx - bw / 2}
              y={H - PAD_Y - h}
              width={bw}
              height={Math.max(h, b.cents > 0 ? 2 : 0)}
              rx={3}
              className="fill-link"
            />
            {b.cents > 0 ? (
              <text
                x={cx}
                y={H - PAD_Y - h - 3}
                textAnchor="middle"
                className="fill-text-muted text-[8px]"
              >
                {formatCents(b.cents).replace(/\.00$/, "")}
              </text>
            ) : null}
            <text x={cx} y={H + 6} textAnchor="middle" className="fill-text-muted text-[9px]">
              {b.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** The pool's trends: pass the log (up to a year) and the year's added chemicals. */
export function ChemTrends({
  readings,
  additions,
  charges,
  timeZone,
  now,
}: {
  readings: ChemicalReading[];
  additions: ChemicalAddition[];
  charges: boolean;
  timeZone: string;
  now: string;
}) {
  const [period, setPeriod] = useState<TrendPeriod>("90d");
  const series = useMemo(() => readingSeries(readings, period, now), [readings, period, now]);
  const bars = useMemo(
    () => chemicalCostBars(additions, period, now, timeZone),
    [additions, period, now, timeZone],
  );
  const win = trendWindow(period, now);
  const from = Date.parse(win.from);
  const to = Date.parse(win.to);
  const spent = bars.some((b) => b.cents > 0);
  return (
    <section className="mt-8 max-w-2xl">
      <SectionTitle>Trends</SectionTitle>
      <Segmented
        label="Period"
        hideLabel
        name="trend-period"
        value={period}
        onChange={setPeriod}
        options={TREND_PERIODS.map((p) => ({ value: p.key, label: p.label }))}
      />
      {series.length === 0 ? (
        <p className="mt-4 rounded-2xl bg-text/[0.04] p-6 text-center text-text-muted">
          No readings in this period.
        </p>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {series.map((s) => (
            <figure key={s.key} className="card p-4">
              <figcaption className="mb-2 flex items-baseline justify-between gap-2">
                <span className="font-semibold">{s.label}</span>
                <span
                  className={`text-[0.9375rem] tabular-nums ${s.status === "ok" ? "text-text-muted" : "text-status-fail"}`}
                >
                  {s.latest} · {STATUS_WORD[s.status]}
                </span>
              </figcaption>
              <LineChart series={s} from={from} to={to} timeZone={timeZone} />
              <p className="mt-1 text-[0.8125rem] text-text-muted">
                Aim for {s.low}–{s.high} · {s.points.length}{" "}
                {s.points.length === 1 ? "reading" : "readings"}
              </p>
            </figure>
          ))}
        </div>
      )}
      {charges && spent ? (
        <figure className="card mt-3 p-4">
          <figcaption className="mb-2 flex items-baseline justify-between gap-2">
            <span className="font-semibold">Chemical Cost</span>
            <span className="text-[0.9375rem] text-text-muted tabular-nums">
              {formatCents(bars.reduce((sum, b) => sum + b.cents, 0))}
            </span>
          </figcaption>
          <CostChart bars={bars} />
          <p className="mt-1 text-[0.8125rem] text-text-muted">Each month’s added chemicals.</p>
        </figure>
      ) : null}
    </section>
  );
}
