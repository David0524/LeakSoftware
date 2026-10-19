"use client";

import { useRef, useState, type KeyboardEvent, type PointerEvent, type WheelEvent } from "react";
import {
  CLEARED_DIAGRAM,
  DIAGRAM_SHAPES,
  LANDMARKS,
  LANDMARK_SIZE,
  LANDMARKS_MAX,
  DRAWING_MAX,
  clampSpaR,
  drawnPath,
  drawnShapeFrom,
  poolDiagram,
  spaSizeFor,
  type DiagramLayout,
  type DiagramShape,
  type DrawnShape,
  type Landmark,
  type LandmarkKind,
  type SpaShape,
} from "@leakbook/core";
import { savePoolDiagram } from "@/app/actions/diagram";
import { DiagramShapes } from "./pool-diagram";
import { Segmented } from "./segmented";
import { useConfirm } from "./sheet";
import { Button, Checkbox, cx } from "./ui";

// The Pool Shape sheet (owner, 2026-10-19): ten tiles in two rows of five (the seven preset
// shapes, Landmarks, Draw, and Clear), Mirror and Has a spa, and the drawing itself, where the
// spa is moved, reshaped (tap), and resized (pinch, or its corner handle).

const W = 160;
const H = 100;
const unit = (n: number) => Math.round(Math.min(1, Math.max(0, n)) * 10_000) / 10_000;
type Tool = "line" | "circle" | "pen";
const TOOLS: { value: Tool; label: string }[] = [
  { value: "line", label: "Line" },
  { value: "circle", label: "Circle" },
  { value: "pen", label: "Freeform" },
];

/** A tile's drawing area: one small SVG, the same size for every tile. */
function TileArt({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-7 w-full" aria-hidden="true">
      {children}
    </svg>
  );
}

const TILE =
  "flex min-h-11 flex-col items-center gap-1 rounded-2xl px-0.5 pt-1.5 pb-1 text-[0.75rem] leading-tight font-medium transition-colors " +
  "focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-60";
const tileState = (on: boolean) =>
  on
    ? "bg-link/12 font-semibold text-link ring-2 ring-link ring-inset"
    : "bg-fill text-text hover:bg-text/[0.1]";

export function PoolShapeEditor({
  jobId,
  propertyId,
  shape: savedShape,
  hasSpa: savedSpa,
  layout,
  onDone,
}: {
  jobId: string;
  propertyId: string;
  shape: DiagramShape | null;
  hasSpa: boolean;
  layout: DiagramLayout;
  onDone: () => void;
}) {
  const [shape, setShape] = useState<DiagramShape | null>(savedShape);
  const [hasSpa, setHasSpa] = useState(savedSpa);
  const [mirror, setMirror] = useState(layout.mirror === true);
  const [spa, setSpa] = useState<{ x: number; y: number; r: number; shape: SpaShape } | null>(
    layout.spa
      ? {
          x: layout.spa.x,
          y: layout.spa.y,
          r: poolDiagram(savedShape, true, layout).spa!.r,
          shape: layout.spa.shape ?? "round",
        }
      : null,
  );
  const [drawing, setDrawing] = useState<DrawnShape[]>(layout.drawing ?? []);
  const [landmarks, setLandmarks] = useState<Landmark[]>(layout.landmarks ?? []);
  const [panel, setPanel] = useState<"landmarks" | "draw" | null>(null);
  const [tool, setTool] = useState<Tool>("line");
  const [placing, setPlacing] = useState<LandmarkKind | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [stroke, setStroke] = useState<{ x: number; y: number }[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, confirmSheet] = useConfirm();
  const svg = useRef<SVGSVGElement>(null);
  // What the current press is doing, and the touches down (for a pinch).
  const press = useRef<{
    what: "spa" | "resize" | "landmark" | "draw" | "pinch" | null;
    index?: number;
    start: { x: number; y: number };
    moved: boolean;
    startR?: number;
    startGap?: number;
  }>({ what: null, start: { x: 0, y: 0 }, moved: false });
  const touches = useRef(new Map<number, { x: number; y: number }>());

  // Where the spa is drawn now: placed, or the default corner.
  const drawnSpa = poolDiagram(shape, hasSpa, { mirror }).spa;
  const spaNow = hasSpa
    ? (spa ??
      (drawnSpa
        ? { x: drawnSpa.cx / W, y: drawnSpa.cy / H, r: drawnSpa.r, shape: "round" as SpaShape }
        : null))
    : null;
  const next: DiagramLayout = {
    ...(mirror ? { mirror: true } : {}),
    ...(hasSpa && spa
      ? { spa: { x: spa.x, y: spa.y, r: spa.r, size: spaSizeFor(spa.r), shape: spa.shape } }
      : {}),
    ...(drawing.length ? { drawing } : {}),
    ...(landmarks.length ? { landmarks } : {}),
  };
  const d = poolDiagram(shape, hasSpa, next);

  const at = (e: { clientX: number; clientY: number }) => {
    const box = svg.current!.getBoundingClientRect();
    return {
      x: unit((e.clientX - box.left) / box.width),
      y: unit((e.clientY - box.top) / box.height),
    };
  };
  const onSpa = (p: { x: number; y: number }) =>
    !!spaNow && Math.hypot((p.x - spaNow.x) * W, (p.y - spaNow.y) * H) <= spaNow.r + 2;
  const onHandle = (p: { x: number; y: number }) =>
    !!spaNow &&
    Math.hypot((p.x - spaNow.x) * W - spaNow.r * 0.71, (p.y - spaNow.y) * H - spaNow.r * 0.71) <= 6;
  const landmarkAt = (p: { x: number; y: number }) =>
    d.landmarks.findIndex(
      (l) =>
        Math.abs(p.x * W - l.cx) <= LANDMARK_SIZE / 2 + 2 &&
        Math.abs(p.y * H - l.cy) <= LANDMARK_SIZE / 2 + 2,
    );
  const setSpaR = (r: number) => spaNow && setSpa({ ...spaNow, r: clampSpaR(r) });

  function down(e: PointerEvent<SVGSVGElement>) {
    const p = at(e);
    touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    e.currentTarget.setPointerCapture(e.pointerId);
    if (touches.current.size === 2 && spaNow && panel !== "draw") {
      const [a, b] = [...touches.current.values()];
      press.current = {
        what: "pinch",
        start: p,
        moved: true,
        startR: spaNow.r,
        startGap: Math.hypot(a!.x - b!.x, a!.y - b!.y),
      };
      return;
    }
    if (panel === "draw") {
      press.current = { what: "draw", start: p, moved: false };
      setStroke([p]);
      return;
    }
    if (placing) {
      if (landmarks.length < LANDMARKS_MAX) setLandmarks([...landmarks, { kind: placing, ...p }]);
      setPlacing(null);
      press.current = { what: null, start: p, moved: false };
      return;
    }
    if (onHandle(p)) press.current = { what: "resize", start: p, moved: false, startR: spaNow!.r };
    else if (onSpa(p)) press.current = { what: "spa", start: p, moved: false };
    else {
      const i = landmarkAt(p);
      press.current =
        i >= 0
          ? { what: "landmark", index: i, start: p, moved: false }
          : { what: null, start: p, moved: false };
      if (i < 0) setSelected(null);
    }
  }

  function move(e: PointerEvent<SVGSVGElement>) {
    if (!touches.current.has(e.pointerId)) return;
    touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const p = at(e);
    const now = press.current;
    if (!now.moved && Math.hypot((p.x - now.start.x) * W, (p.y - now.start.y) * H) > 2)
      now.moved = true;
    if (now.what === "pinch" && touches.current.size === 2) {
      const [a, b] = [...touches.current.values()];
      setSpaR(now.startR! * (Math.hypot(a!.x - b!.x, a!.y - b!.y) / now.startGap!));
    } else if (now.what === "draw") setStroke((s) => (s ? [...s, p] : [p]));
    else if (now.what === "spa" && now.moved && spaNow) setSpa({ ...spaNow, x: p.x, y: p.y });
    else if (now.what === "resize" && spaNow)
      setSpaR(Math.hypot((p.x - spaNow.x) * W, (p.y - spaNow.y) * H));
    else if (now.what === "landmark" && now.moved && now.index !== undefined)
      setLandmarks(landmarks.map((l, i) => (i === now.index ? { ...l, x: p.x, y: p.y } : l)));
  }

  function up(e: PointerEvent<SVGSVGElement>) {
    touches.current.delete(e.pointerId);
    const now = press.current;
    if (now.what === "draw" && stroke) {
      const made = drawnShapeFrom(tool, [...stroke, at(e)]);
      if (made && drawing.length < DRAWING_MAX) setDrawing([...drawing, made]);
      setStroke(null);
    } else if (now.what === "spa" && !now.moved && spaNow)
      // Tapping the spa switches it round and square (owner, 2026-10-19).
      setSpa({ ...spaNow, shape: spaNow.shape === "square" ? "round" : "square" });
    else if (now.what === "landmark" && !now.moved) setSelected(now.index ?? null);
    if (touches.current.size === 0)
      press.current = { what: null, start: { x: 0, y: 0 }, moved: false };
  }

  function wheel(e: WheelEvent<SVGSVGElement>) {
    // A trackpad pinch arrives as a wheel with ctrlKey.
    if (!e.ctrlKey || !spaNow) return;
    e.preventDefault();
    setSpaR(spaNow.r * (1 - e.deltaY / 100));
  }

  function key(e: KeyboardEvent<SVGSVGElement>) {
    if (selected !== null && (e.key === "Delete" || e.key === "Backspace")) {
      e.preventDefault();
      setLandmarks(landmarks.filter((_, i) => i !== selected));
      setSelected(null);
      return;
    }
    if (!spaNow) return;
    const step = 0.02;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    if (moves[e.key]) {
      e.preventDefault();
      setSpa({
        ...spaNow,
        x: unit(spaNow.x + moves[e.key]![0]),
        y: unit(spaNow.y + moves[e.key]![1]),
      });
    } else if (e.key === "+" || e.key === "=") {
      e.preventDefault();
      setSpaR(spaNow.r + 1);
    } else if (e.key === "-") {
      e.preventDefault();
      setSpaR(spaNow.r - 1);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setSpa({ ...spaNow, shape: spaNow.shape === "square" ? "round" : "square" });
    }
  }

  async function clearAll() {
    if (
      !(await confirm({
        title: "Clear the pool diagram?",
        message: "The shape, spa, drawing, and landmarks are removed. Pins and markup stay.",
        confirmLabel: "Clear Diagram",
        destructive: true,
      }))
    )
      return;
    setShape(CLEARED_DIAGRAM.shape);
    setHasSpa(CLEARED_DIAGRAM.hasSpa);
    setMirror(false);
    setSpa(null);
    setDrawing([]);
    setLandmarks([]);
    setSelected(null);
    setPanel("draw");
  }

  const preview = stroke ? drawnShapeFrom(tool, stroke) : null;
  const spaLabel = spaNow
    ? `Spa, ${spaNow.shape === "square" ? "square" : "round"}, size ${Math.round(spaNow.r)}`
    : null;

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <p className="font-medium" id="shape-tiles">
          Pool shape
        </p>
        <div
          role="group"
          aria-labelledby="shape-tiles"
          className="grid grid-cols-5 gap-1.5"
          data-testid="shape-tiles"
        >
          {DIAGRAM_SHAPES.map((s) => {
            const on = shape === s.key;
            return (
              <button
                key={s.key}
                type="button"
                aria-pressed={on}
                onClick={() => setShape(on ? null : s.key)}
                className={cx(TILE, tileState(on))}
              >
                <TileArt>
                  <path
                    d={poolDiagram(s.key, false).pool}
                    className="fill-diagram-water stroke-water"
                    strokeWidth={5}
                  />
                </TileArt>
                {s.label}
              </button>
            );
          })}
          <button
            type="button"
            aria-expanded={panel === "landmarks"}
            onClick={() => {
              setPanel(panel === "landmarks" ? null : "landmarks");
              setPlacing(null);
            }}
            className={cx(TILE, tileState(panel === "landmarks"))}
          >
            <TileArt>
              <path
                d={LANDMARKS[0]!.path}
                transform="translate(37 7) scale(3.6)"
                fill="none"
                className="stroke-current"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </TileArt>
            Landmarks
          </button>
          <button
            type="button"
            aria-pressed={panel === "draw"}
            onClick={() => setPanel(panel === "draw" ? null : "draw")}
            className={cx(TILE, tileState(panel === "draw"))}
          >
            <TileArt>
              <path
                d="M30 80 C50 20 80 90 100 40 S130 20 135 30"
                fill="none"
                className="stroke-current"
                strokeWidth={6}
                strokeLinecap="round"
              />
            </TileArt>
            Draw
          </button>
          <button type="button" onClick={clearAll} className={cx(TILE, tileState(false))}>
            <TileArt>
              <path
                d="M58 22 L102 78 M102 22 L58 78"
                fill="none"
                className="stroke-current"
                strokeWidth={6}
                strokeLinecap="round"
              />
            </TileArt>
            Clear
          </button>
        </div>
      </div>

      {panel === "landmarks" ? (
        <div className="space-y-2">
          <div role="group" aria-label="Landmarks" className="flex flex-wrap gap-1.5">
            {LANDMARKS.map((l) => (
              <button
                key={l.key}
                type="button"
                aria-pressed={placing === l.key}
                onClick={() => setPlacing(placing === l.key ? null : l.key)}
                className={cx(
                  "flex min-h-11 items-center gap-1.5 rounded-full px-3 text-[0.9375rem] font-medium",
                  "focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus",
                  tileState(placing === l.key),
                )}
              >
                <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
                  <path
                    d={l.path}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.8}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                {l.label}
              </button>
            ))}
          </div>
          <p className="text-[0.9375rem] text-text-muted" aria-live="polite">
            {placing
              ? `Tap the drawing to put the ${LANDMARKS.find((l) => l.key === placing)!.label.toLowerCase()} there.`
              : "Pick one, then tap the drawing. Drag one to move it; tap it to remove it."}
          </p>
        </div>
      ) : null}

      {panel === "draw" ? (
        <div className="space-y-2">
          <div className="flex items-end gap-3">
            <Segmented
              label="Draw"
              name="draw_tool"
              value={tool}
              onChange={setTool}
              options={TOOLS}
            />
            <Button
              type="button"
              kind="secondary"
              disabled={drawing.length === 0}
              onClick={() => setDrawing(drawing.slice(0, -1))}
            >
              Undo
            </Button>
          </div>
          <p className="text-[0.9375rem] text-text-muted">
            Drag on the drawing. Draw on a shape, or Clear and start from nothing.
          </p>
        </div>
      ) : null}

      <div className="space-y-2">
        <Checkbox
          label="Mirror (flip left to right)"
          checked={mirror}
          onChange={(e) => setMirror(e.target.checked)}
        />
        <Checkbox
          label="Has a spa"
          checked={hasSpa}
          onChange={(e) => setHasSpa(e.target.checked)}
        />
      </div>

      <div className="space-y-2">
        <svg
          ref={svg}
          viewBox={`0 0 ${W} ${H}`}
          role="application"
          aria-label={[
            "Pool drawing",
            spaLabel,
            landmarks.length ? `${landmarks.length} landmarks` : null,
            drawing.length ? `${drawing.length} drawn` : null,
          ]
            .filter(Boolean)
            .join(", ")}
          aria-describedby="drawing-hint"
          tabIndex={0}
          data-testid="pool-drawing"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          onWheel={wheel}
          onKeyDown={key}
          className={cx(
            "w-full touch-none rounded-xl border border-control-border bg-surface select-none",
            "focus:outline-3 focus:outline-offset-2 focus:outline-focus",
            panel === "draw" || placing ? "cursor-crosshair" : "cursor-default",
          )}
        >
          <DiagramShapes d={d} />
          {preview ? (
            <path
              d={drawnPath(preview)}
              fill="none"
              className="stroke-water"
              strokeWidth={2}
              strokeDasharray="4 3"
              strokeLinecap="round"
            />
          ) : null}
          {selected !== null && d.landmarks[selected] ? (
            <rect
              x={d.landmarks[selected]!.cx - LANDMARK_SIZE / 2 - 2}
              y={d.landmarks[selected]!.cy - LANDMARK_SIZE / 2 - 2}
              width={LANDMARK_SIZE + 4}
              height={LANDMARK_SIZE + 4}
              rx={4}
              fill="none"
              className="stroke-link"
              strokeWidth={1.5}
            />
          ) : null}
          {d.spa && panel !== "draw" ? (
            // The spa's resize handle, at its lower right.
            <circle
              cx={d.spa.cx + d.spa.r * 0.71}
              cy={d.spa.cy + d.spa.r * 0.71}
              r={3.2}
              className="fill-surface stroke-link"
              strokeWidth={1.5}
            />
          ) : null}
        </svg>
        <p id="drawing-hint" className="text-[0.9375rem] text-text-muted">
          {hasSpa
            ? "Tap the spa to make it round or square. Drag it to move it; pinch or drag its corner to resize."
            : "Turn on Has a spa to put a spa on the drawing."}
        </p>
        {selected !== null && landmarks[selected] ? (
          <Button
            type="button"
            kind="danger"
            onClick={() => {
              setLandmarks(landmarks.filter((_, i) => i !== selected));
              setSelected(null);
            }}
          >
            Remove {LANDMARKS.find((l) => l.key === landmarks[selected]!.kind)!.label}
          </Button>
        ) : null}
        {spaNow ? (
          <div className="flex flex-wrap gap-x-4">
            {/* Buttons for the tap and the pinch, for keyboards and switch control. */}
            <button
              type="button"
              className="min-h-11 text-link"
              onClick={() =>
                setSpa({ ...spaNow, shape: spaNow.shape === "square" ? "round" : "square" })
              }
            >
              {spaNow.shape === "square" ? "Make the Spa Round" : "Make the Spa Square"}
            </button>
            <button
              type="button"
              className="min-h-11 text-link"
              onClick={() => setSpaR(spaNow.r - 2)}
            >
              Smaller
            </button>
            <button
              type="button"
              className="min-h-11 text-link"
              onClick={() => setSpaR(spaNow.r + 2)}
            >
              Larger
            </button>
            {spa ? (
              <button type="button" className="min-h-11 text-link" onClick={() => setSpa(null)}>
                Put the Spa Back in the Corner
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="text-status-fail">
          {error}
        </p>
      ) : null}
      <Button
        type="button"
        className="w-full"
        disabled={saving}
        onClick={async () => {
          setSaving(true);
          const r = await savePoolDiagram({ jobId, propertyId, shape, hasSpa, layout: next });
          setSaving(false);
          if (!r.ok) return setError(r.error);
          onDone();
        }}
      >
        {saving ? "Saving…" : "Save Pool Shape"}
      </Button>
      {confirmSheet}
    </div>
  );
}
