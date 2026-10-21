// The animatic: each scene's captions, taps and timing on plain device boxes, over the music,
// so the pacing can be checked before anything is recorded. The real recordings replace the
// boxes' contents later; the timing, captions and transitions stay.
import type { CSSProperties, ReactNode } from "react";
import {
  AbsoluteFill,
  Audio,
  Easing,
  Img,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { leak, pool, type Beat, type Device, type Scene, type Video } from "./storyboard";
import { brand, display, neutral, status, text } from "./theme";
import { FPS, SECTIONS, TRANSITION, frames } from "./timing";

export type Aspect = "wide" | "tall";
export type AnimaticProps = { story: "leak" | "pool"; aspect: Aspect };

type Rect = { x: number; y: number; w: number; h: number };

const videos: Record<AnimaticProps["story"], Video> = { leak, pool };

/** A brand hex color at an opacity. */
const alpha = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

const ease = Easing.bezier(0.33, 0, 0.2, 1);

const seconds = (frame: number) => frame / FPS;

/** Where each device sits, per aspect and per set of devices on screen. */
function layout(aspect: Aspect, devices: Device[]): Partial<Record<Device, Rect>> {
  const both = devices.length === 2;
  if (aspect === "wide") {
    if (!both) {
      return devices[0] === "desktop"
        ? { desktop: { x: 310, y: 110, w: 1300, h: 720 } }
        : { [devices[0]!]: { x: 780, y: 70, w: 360, h: 780 } };
    }
    if (devices.includes("desktop")) {
      const other = devices.find((d) => d !== "desktop")!;
      return {
        desktop: { x: 200, y: 140, w: 1120, h: 660 },
        [other]: { x: 1390, y: 70, w: 350, h: 760 },
      };
    }
    return {
      phone: { x: 570, y: 70, w: 350, h: 760 },
      customer: { x: 1000, y: 70, w: 350, h: 760 },
    };
  }
  if (!both) {
    return devices[0] === "desktop"
      ? { desktop: { x: 60, y: 420, w: 960, h: 760 } }
      : { [devices[0]!]: { x: 290, y: 190, w: 500, h: 1080 } };
  }
  if (devices.includes("desktop")) {
    const other = devices.find((d) => d !== "desktop")!;
    return {
      desktop: { x: 60, y: 170, w: 960, h: 600 },
      [other]: { x: 340, y: 640, w: 400, h: 860 },
    };
  }
  return {
    phone: { x: 70, y: 220, w: 450, h: 980 },
    customer: { x: 560, y: 220, w: 450, h: 980 },
  };
}

const deviceLabel: Record<Device, string> = {
  desktop: "Owner · website",
  phone: "Tech · iPhone",
  customer: "Customer · phone",
};

/** Slide-and-scale in at the start and out at the end; nothing else moves during it. */
function useTransition(duration: number, width: number) {
  const frame = useCurrentFrame();
  const enter = interpolate(frame, [0, TRANSITION], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ease,
  });
  const exit = interpolate(frame, [duration, duration + TRANSITION], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ease,
  });
  const shift = width * 0.3;
  return {
    transform: `translateX(${(1 - enter) * shift - exit * shift}px) scale(${0.94 + 0.06 * enter - 0.06 * exit})`,
    opacity: Math.min(enter, 1 - exit),
  } satisfies CSSProperties;
}

/** A caption that slides in word by word and holds. */
function Caption({
  words,
  at,
  size,
  color,
  width,
}: {
  words: string;
  at: number;
  size: number;
  color: string;
  width: number;
}) {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        fontFamily: display,
        fontWeight: 800,
        fontSize: size,
        lineHeight: 1.05,
        color,
        maxWidth: width,
        textAlign: "center",
        letterSpacing: -0.5,
      }}
    >
      {words.split(" ").map((word, i) => {
        const p = interpolate(frame, [frames(at) + i * 3, frames(at) + i * 3 + 12], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: ease,
        });
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              opacity: p,
              transform: `translateY(${(1 - p) * 36}px)`,
              marginRight: "0.25em",
            }}
          >
            {word}
          </span>
        );
      })}
    </div>
  );
}

function BeatRow({ beat, scale }: { beat: Beat; scale: number }) {
  const frame = useCurrentFrame();
  const t = seconds(frame);
  const shown = beat.tap ? beat.at - 0.8 : beat.at;
  const p = interpolate(t, [shown, shown + 0.35], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ease,
  });
  if (p === 0) return null;
  const fontSize = 17 * 1.6 * scale;
  const base: CSSProperties = {
    opacity: p,
    transform: `translateY(${(1 - p) * 16}px)`,
    fontFamily: text,
    fontSize,
    marginBottom: 14 * scale,
  };
  if (beat.tap) {
    const pressed = t >= beat.at && t < beat.at + 0.2;
    const ring = interpolate(t, [beat.at - 0.35, beat.at + 0.1], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    return (
      <div style={{ ...base, display: "flex", justifyContent: "center", position: "relative" }}>
        <div
          style={{
            background: brand.water,
            color: brand.paper,
            fontWeight: 600,
            borderRadius: 999,
            padding: `${12 * scale}px ${28 * scale}px`,
            transform: `scale(${pressed ? 0.96 : 1})`,
            position: "relative",
          }}
        >
          {beat.text}
          {ring > 0 && ring < 1 && (
            <div
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                width: 90 * scale,
                height: 90 * scale,
                marginLeft: -45 * scale,
                marginTop: -45 * scale,
                borderRadius: 999,
                border: `${5 * scale}px solid ${brand.water}`,
                opacity: 1 - ring,
                transform: `scale(${0.5 + ring})`,
              }}
            />
          )}
        </div>
      </div>
    );
  }
  const toneColor = beat.tone ? status[beat.tone] : undefined;
  return (
    <div
      style={{
        ...base,
        background: brand.paper,
        borderRadius: 16 * scale,
        padding: `${16 * scale}px ${20 * scale}px`,
        color: brand.navy,
        fontWeight: 500,
      }}
    >
      {toneColor ? (
        <span
          style={{
            color: brand.paper,
            background: toneColor,
            borderRadius: 999,
            padding: `${4 * scale}px ${16 * scale}px`,
            fontWeight: 700,
          }}
        >
          {beat.text}
        </span>
      ) : (
        beat.text
      )}
    </div>
  );
}

function DeviceBox({ device, rect, scene }: { device: Device; rect: Rect; scene: Scene }) {
  const frame = useCurrentFrame();
  const t = seconds(frame);
  const desktop = device === "desktop";
  const scale = desktop ? rect.w / 1300 : rect.w / 360;
  const image = scene.image?.on === device ? scene.image : undefined;
  const imageIn = image
    ? interpolate(t, [image.at, image.at + 0.4], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: ease,
      })
    : 0;
  const content: ReactNode = (
    <div
      style={{
        padding: 22 * scale,
        display: "flex",
        flexDirection: "column",
        height: "100%",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          fontFamily: text,
          fontSize: 15 * 1.4 * scale,
          color: neutral[500],
          fontWeight: 600,
          marginBottom: 18 * scale,
        }}
      >
        {deviceLabel[device]}
      </div>
      {image?.kind === "logo" && imageIn > 0 && (
        <Img
          src={staticFile(image.src)}
          style={{
            height: 70 * scale,
            objectFit: "contain",
            alignSelf: "flex-start",
            marginBottom: 18 * scale,
            opacity: imageIn,
          }}
        />
      )}
      {scene.beats
        .filter((b) => b.on === device)
        .map((b, i) => (
          <BeatRow key={i} beat={b} scale={desktop ? scale * 1.25 : scale * 0.8} />
        ))}
      {image?.kind === "photo" && imageIn > 0 && (
        <Img
          src={staticFile(image.src)}
          style={{
            marginTop: "auto",
            width: "100%",
            aspectRatio: "3 / 2",
            objectFit: "cover",
            borderRadius: 16 * scale,
            opacity: imageIn,
            transform: `scale(${0.92 + 0.08 * imageIn})`,
          }}
        />
      )}
    </div>
  );
  const shadow = `0 ${30 * scale}px ${70 * scale}px ${alpha(brand.navy, 0.16)}`;
  if (desktop) {
    return (
      <div
        style={{
          position: "absolute",
          left: rect.x,
          top: rect.y,
          width: rect.w,
          height: rect.h,
          borderRadius: 18,
          background: neutral[50],
          boxShadow: shadow,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: 44,
            background: brand.paper,
            display: "flex",
            alignItems: "center",
            gap: 10,
            paddingLeft: 18,
          }}
        >
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{ width: 14, height: 14, borderRadius: 7, background: neutral[200] }}
            />
          ))}
        </div>
        {content}
      </div>
    );
  }
  return (
    <div
      style={{
        position: "absolute",
        left: rect.x,
        top: rect.y,
        width: rect.w,
        height: rect.h,
        borderRadius: 56 * scale,
        background: neutral[900],
        padding: 12 * scale,
        boxSizing: "border-box",
        boxShadow: shadow,
      }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          borderRadius: 44 * scale,
          background: neutral[50],
          overflow: "hidden",
          paddingTop: 30 * scale,
          boxSizing: "border-box",
        }}
      >
        {content}
      </div>
    </div>
  );
}

function SceneView({
  scene,
  index,
  aspect,
  duration,
}: {
  scene: Scene;
  index: number;
  aspect: Aspect;
  duration: number;
}) {
  const { width } = useVideoConfig();
  const motion = useTransition(duration, width);
  const rects = layout(aspect, scene.devices);
  const wide = aspect === "wide";
  return (
    <AbsoluteFill style={motion}>
      <div
        style={{
          position: "absolute",
          left: wide ? 64 : 60,
          top: wide ? 40 : 70,
          fontFamily: text,
          fontSize: 26,
          fontWeight: 600,
          color: neutral[500],
        }}
      >
        {index + 1} · {scene.title}
      </div>
      {scene.devices.map((d) => (
        <DeviceBox key={d} device={d} rect={rects[d]!} scene={scene} />
      ))}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: wide ? 890 : 1560,
          display: "flex",
          justifyContent: "center",
        }}
      >
        <Caption
          words={scene.caption}
          at={0.35}
          size={wide ? 76 : 92}
          color={brand.navy}
          width={wide ? 1600 : 960}
        />
      </div>
    </AbsoluteFill>
  );
}

function Intro({ video, aspect, duration }: { video: Video; aspect: Aspect; duration: number }) {
  const frame = useCurrentFrame();
  const { width, fps } = useVideoConfig();
  const motion = useTransition(duration, width);
  const pop = spring({ frame, fps, config: { damping: 200 } });
  const wide = aspect === "wide";
  return (
    <AbsoluteFill
      style={{
        ...motion,
        opacity: 1,
        background: brand.navy,
        alignItems: "center",
        justifyContent: "center",
        gap: 48,
      }}
    >
      <Img
        src={staticFile("generated/sundeck-logo-reverse.svg")}
        style={{ width: wide ? 760 : 820, opacity: pop, transform: `scale(${0.88 + 0.12 * pop})` }}
      />
      <Caption
        words={video.opener}
        at={1.0}
        size={wide ? 64 : 76}
        color={brand.concrete}
        width={wide ? 1400 : 900}
      />
    </AbsoluteFill>
  );
}

function EndCard({ video, aspect, duration }: { video: Video; aspect: Aspect; duration: number }) {
  const frame = useCurrentFrame();
  const { width, fps } = useVideoConfig();
  const motion = useTransition(duration, width);
  const button = spring({ frame: frame - frames(1.6), fps, config: { damping: 200 } });
  const wide = aspect === "wide";
  return (
    <AbsoluteFill
      style={{
        ...motion,
        background: brand.navy,
        alignItems: "center",
        justifyContent: "center",
        gap: 56,
      }}
    >
      <Img
        src={staticFile("generated/sundeck-logo-reverse.svg")}
        style={{ width: wide ? 560 : 720 }}
      />
      <Caption
        words={video.tagline}
        at={0.4}
        size={wide ? 104 : 112}
        color={brand.paper}
        width={wide ? 1600 : 940}
      />
      <div
        style={{
          opacity: button,
          transform: `translateY(${(1 - button) * 24}px)`,
          background: brand.safety,
          color: brand.navy,
          fontFamily: text,
          fontWeight: 700,
          fontSize: wide ? 40 : 48,
          borderRadius: 999,
          padding: wide ? "22px 56px" : "26px 64px",
        }}
      >
        Start Free Trial
      </div>
      <div
        style={{
          opacity: button,
          fontFamily: text,
          fontWeight: 600,
          fontSize: wide ? 32 : 38,
          color: brand.concrete,
        }}
      >
        sundeckpro.com
      </div>
    </AbsoluteFill>
  );
}

export function Animatic({ story, aspect }: AnimaticProps) {
  const video = videos[story];
  return (
    <AbsoluteFill style={{ background: brand.concrete }}>
      <Audio src={staticFile(video.track)} />
      {SECTIONS.map((section, i) => {
        const from = frames(section.start);
        const duration = frames(section.end) - from;
        const last = section.id === "end";
        return (
          <Sequence
            key={section.id}
            from={from}
            durationInFrames={last ? duration : duration + TRANSITION}
            layout="none"
          >
            <AbsoluteFill>
              {section.id === "intro" ? (
                <Intro video={video} aspect={aspect} duration={duration} />
              ) : last ? (
                <EndCard video={video} aspect={aspect} duration={duration + TRANSITION} />
              ) : (
                <SceneView
                  scene={video.scenes[i - 1]!}
                  index={i - 1}
                  aspect={aspect}
                  duration={duration}
                />
              )}
            </AbsoluteFill>
          </Sequence>
        );
      })}
      <div
        style={{
          position: "absolute",
          right: 28,
          bottom: 20,
          fontFamily: text,
          fontSize: 20,
          color: neutral[400],
        }}
      >
        Animatic · timing check
      </div>
    </AbsoluteFill>
  );
}
