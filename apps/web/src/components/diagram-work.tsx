"use client";

import { useState, type KeyboardEvent, type MouseEvent } from "react";
import {
  SPA_SHAPES,
  SPA_SIZES,
  parseDiagramLayout,
  poolDiagram,
  type DiagramLayout,
  type DiagramShape,
  type MarkupShape,
  type SpaShape,
  type SpaSize,
} from "@leakbook/core";
import { saveDiagramMarkup, savePoolDiagram } from "@/app/actions/diagram";
import { DIAGRAM_MARKUP_SPACE } from "./markup";
import { MarkupEditor } from "./media-work";
import { DiagramShapes, PoolDiagram, type Pin } from "./pool-diagram";
import { Segmented } from "./segmented";
import { ShapePicker } from "./shape-picker";
import { Sheet } from "./sheet";
import { Button, Checkbox } from "./ui";

const round = (n: number) => Math.round(Math.min(1, Math.max(0, n)) * 10_000) / 10_000;

/**
 * The job's pool diagram (owner, 2026-10-19: "More customization to pool shape. Be able to
 * place the spa wherever." and "Add markup tools to the pool diagrams"): the drawing with the
 * findings' pins and the job's markup, Edit Pool Shape (shape, mirror, spa), and Mark Up.
 */
export function DiagramPanel({
  jobId,
  propertyId,
  shape,
  hasSpa,
  layout,
  markup,
  pins,
}: {
  jobId: string;
  propertyId: string;
  shape: DiagramShape | null;
  hasSpa: boolean;
  layout: unknown;
  markup: MarkupShape[];
  pins: Pin[];
}) {
  const [editing, setEditing] = useState<"shape" | "markup" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const close = () => setEditing(null);
  return (
    <div className="max-w-2xl space-y-3">
      <PoolDiagram
        shape={shape}
        hasSpa={hasSpa}
        layout={layout}
        markup={markup}
        pins={pins}
        title={`Pool diagram${pins.length ? ` with ${pins.length} finding pins` : ""}${markup.length ? " and markup" : ""}`}
        className="w-full rounded-xl bg-surface"
      />
      <div className="flex flex-wrap gap-3">
        <Button type="button" kind="secondary" onClick={() => setEditing("shape")}>
          Edit Pool Shape
        </Button>
        <Button type="button" kind="secondary" onClick={() => setEditing("markup")}>
          {markup.length ? "Edit Markup" : "Mark Up"}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-status-fail">
          {error}
        </p>
      ) : null}
      <Sheet open={editing === "shape"} onClose={close} title="Pool Shape">
        {editing === "shape" ? (
          <ShapeForm
            jobId={jobId}
            propertyId={propertyId}
            shape={shape}
            hasSpa={hasSpa}
            layout={parseDiagramLayout(layout)}
            onDone={close}
          />
        ) : null}
      </Sheet>
      {editing === "markup" ? (
        <MarkupEditor
          title="Mark Up Diagram"
          canvasLabel="Pool diagram"
          background={
            <svg
              viewBox="0 0 160 100"
              aria-hidden="true"
              className="block h-full w-full rounded bg-surface"
            >
              <DiagramShapes d={poolDiagram(shape, hasSpa, parseDiagramLayout(layout))} />
              {pins.map((p) => (
                <g key={p.id}>
                  <circle cx={p.x * 160} cy={p.y * 100} r={6} fill={p.color} />
                  <text
                    x={p.x * 160}
                    y={p.y * 100 + 2.6}
                    fontSize={7}
                    textAnchor="middle"
                    className="fill-paper font-display font-bold"
                  >
                    {p.label}
                  </text>
                </g>
              ))}
            </svg>
          }
          {...DIAGRAM_MARKUP_SPACE}
          shapes={markup}
          onCancel={close}
          onSave={async (shapes) => {
            const r = await saveDiagramMarkup({ jobId, markup: { version: 1, shapes } });
            if (!r.ok) return r.error;
            setError(null);
            close();
            return null;
          }}
        />
      ) : null}
    </div>
  );
}

/** Shape, mirror, and the spa: tap the drawing to move the spa; arrow keys nudge it. */
function ShapeForm({
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
  const [spaAt, setSpaAt] = useState<{ x: number; y: number } | null>(
    layout.spa ? { x: layout.spa.x, y: layout.spa.y } : null,
  );
  const [size, setSize] = useState<SpaSize>(layout.spa?.size ?? "medium");
  const [spaShape, setSpaShape] = useState<SpaShape>(layout.spa?.shape ?? "round");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A size or shape alone keeps the spa where it is drawn now.
  const draft = poolDiagram(shape, hasSpa, { mirror });
  const at = spaAt ?? (draft.spa ? { x: draft.spa.cx / 160, y: draft.spa.cy / 100 } : null);
  const next: DiagramLayout = {
    ...(mirror ? { mirror: true } : {}),
    ...(hasSpa && at && (spaAt || size !== "medium" || spaShape !== "round")
      ? { spa: { x: at.x, y: at.y, size, shape: spaShape } }
      : {}),
  };
  const d = poolDiagram(shape, hasSpa, next);

  const place = (e: MouseEvent<SVGSVGElement>) => {
    if (!hasSpa) return;
    const box = e.currentTarget.getBoundingClientRect();
    setSpaAt({
      x: round((e.clientX - box.left) / box.width),
      y: round((e.clientY - box.top) / box.height),
    });
  };
  const nudge = (e: KeyboardEvent<SVGSVGElement>) => {
    const step = 0.02;
    const move: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const delta = move[e.key];
    if (!delta || !hasSpa || !at) return;
    e.preventDefault();
    setSpaAt({ x: round(at.x + delta[0]), y: round(at.y + delta[1]) });
  };

  return (
    <div className="space-y-5">
      <ShapePicker value={shape} onChange={setShape} />
      <Checkbox
        label="Mirror (flip left to right)"
        checked={mirror}
        onChange={(e) => setMirror(e.target.checked)}
      />
      <Checkbox label="Has a spa" checked={hasSpa} onChange={(e) => setHasSpa(e.target.checked)} />
      {hasSpa ? (
        <>
          <div className="space-y-2">
            <p className="font-medium" id="spa-place-label">
              Where the spa is
            </p>
            <p className="text-[0.9375rem] text-text-muted" id="spa-place-hint">
              Tap the drawing to move the spa anywhere. Arrow keys move it too.
            </p>
            <svg
              viewBox="0 0 160 100"
              role="application"
              aria-labelledby="spa-place-label"
              aria-describedby="spa-place-hint"
              tabIndex={0}
              data-testid="spa-picker"
              onClick={place}
              onKeyDown={nudge}
              className="w-full cursor-crosshair touch-manipulation rounded-xl border border-control-border bg-surface focus:outline-3 focus:outline-offset-2 focus:outline-focus"
            >
              <DiagramShapes d={d} />
            </svg>
            {spaAt ? (
              <button type="button" className="min-h-11 text-link" onClick={() => setSpaAt(null)}>
                Put the Spa Back in the Corner
              </button>
            ) : null}
          </div>
          <Segmented
            label="Spa size"
            name="spa_size"
            value={size}
            onChange={setSize}
            options={SPA_SIZES.map((z) => ({ value: z.key, label: z.label }))}
          />
          <Segmented
            label="Spa shape"
            name="spa_shape"
            value={spaShape}
            onChange={setSpaShape}
            options={SPA_SHAPES.map((z) => ({ value: z.key, label: z.label }))}
          />
        </>
      ) : (
        <svg viewBox="0 0 160 100" aria-hidden="true" className="w-full rounded-xl bg-surface">
          <DiagramShapes d={d} />
        </svg>
      )}
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
    </div>
  );
}
