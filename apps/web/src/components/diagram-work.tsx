"use client";

import { useState } from "react";
import {
  parseDiagramLayout,
  poolDiagram,
  type DiagramShape,
  type MarkupShape,
} from "@leakbook/core";
import { saveDiagramMarkup } from "@/app/actions/diagram";
import { DIAGRAM_MARKUP_SPACE } from "./markup";
import { MarkupEditor } from "./media-work";
import { DiagramShapes, PoolDiagram, type Pin } from "./pool-diagram";
import { PoolShapeEditor } from "./pool-shape-editor";
import { Sheet } from "./sheet";
import { Button } from "./ui";
import { NO_CONNECTION, whenOffline } from "@/lib/offline";

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
          <PoolShapeEditor
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
            const r = await whenOffline(
              saveDiagramMarkup({ jobId, markup: { version: 1, shapes } }),
              { ok: false as const, error: NO_CONNECTION },
            );
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
