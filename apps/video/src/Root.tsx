import { Composition } from "remotion";
import { Video } from "./Video";
import { FPS, TOTAL_FRAMES } from "./timing";

// Each video in both formats from one edit: 16:9 for demos on a call, 9:16 to text.
const formats = [
  { suffix: "Wide", aspect: "wide", width: 1920, height: 1080 },
  { suffix: "Tall", aspect: "tall", width: 1080, height: 1920 },
] as const;

export function Root() {
  return (
    <>
      {(["leak", "pool"] as const).flatMap((story) =>
        formats.map((f) => (
          <Composition
            key={story + f.suffix}
            id={`${story === "leak" ? "Leak" : "Pool"}${f.suffix}`}
            component={Video}
            durationInFrames={TOTAL_FRAMES}
            fps={FPS}
            width={f.width}
            height={f.height}
            defaultProps={{ story, aspect: f.aspect }}
          />
        )),
      )}
    </>
  );
}
