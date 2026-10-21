// The demo videos on real screens: the logo, six scenes cut to the music's bars, the end card.
// Captions sit beside the devices (16:9) or above them (9:16).
import type { CSSProperties } from "react";
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
import { leak, pool, type Cut, type Scene } from "./cuts";
import { Browser, Phone } from "./screens";
import { brand, display, text } from "./theme";
import { SECTIONS, TRANSITION, frames } from "./timing";

export type Aspect = "wide" | "tall";
export type VideoProps = { story: "leak" | "pool"; aspect: Aspect };

const cuts: Record<VideoProps["story"], Cut> = { leak, pool };

const ease = Easing.bezier(0.33, 0, 0.2, 1);

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
  align = "center",
}: {
  words: string;
  at: number;
  size: number;
  color: string;
  width: number;
  align?: "center" | "left";
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
        textAlign: align,
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

function Intro({ video, aspect, duration }: { video: Cut; aspect: Aspect; duration: number }) {
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

function EndCard({ video, aspect, duration }: { video: Cut; aspect: Aspect; duration: number }) {
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

const eyebrow = (scene: Scene) =>
  scene.desktop && scene.phone
    ? `Website · ${scene.phone.who === "Customer" ? "customer's phone" : "iPhone app"}`
    : scene.desktop
      ? "On the website"
      : scene.phone?.who === "Customer"
        ? "On the customer's phone"
        : "In the iPhone app";

function SceneView({
  scene,
  aspect,
  duration,
}: {
  scene: Scene;
  aspect: Aspect;
  duration: number;
}) {
  const frame = useCurrentFrame();
  const { width } = useVideoConfig();
  const motion = useTransition(duration, width);
  const wide = aspect === "wide";
  const both = Boolean(scene.desktop && scene.phone);
  // A slow drift, so a held screen never sits dead still.
  const drift = interpolate(frame, [0, duration], [1, 1.03]);
  const stage: CSSProperties = {
    position: "absolute",
    transform: `scale(${drift})`,
    transformOrigin: "center",
  };
  const label: CSSProperties = {
    fontFamily: text,
    fontWeight: 600,
    fontSize: wide ? 26 : 30,
    color: brand.water,
    marginBottom: wide ? 18 : 16,
    textAlign: wide ? "left" : "center",
  };
  return (
    <AbsoluteFill style={motion}>
      <div
        style={
          wide
            ? {
                position: "absolute",
                left: 110,
                top: 0,
                bottom: 0,
                width: 520,
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
              }
            : {
                position: "absolute",
                left: 70,
                right: 70,
                top: 150,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
              }
        }
      >
        <div style={label}>{eyebrow(scene)}</div>
        <Caption
          words={scene.caption}
          at={0.3}
          size={wide ? 84 : 96}
          color={brand.navy}
          width={wide ? 520 : 940}
          align={wide ? "left" : "center"}
        />
      </div>
      <AbsoluteFill style={{ transform: `scale(${drift})` }}>
        {scene.desktop && (
          <Browser
            screen={scene.desktop}
            width={wide ? (both ? 1000 : 1140) : 1000}
            style={{
              ...stage,
              left: wide ? (both ? 680 : 690) : 40,
              top: wide ? (both ? 230 : 170) : both ? 560 : 720,
            }}
          />
        )}
        {scene.phone && (
          <Phone
            screen={scene.phone}
            statusBar={scene.phone.statusBar}
            height={wide ? (both ? 800 : 930) : both ? 940 : 1380}
            style={{
              ...stage,
              left: wide
                ? both
                  ? 1440
                  : 900
                : both
                  ? 560
                  : (1080 - (1380 * 0.964 * 402) / 874 - 1380 * 0.036) / 2,
              top: wide ? (both ? 170 : 75) : both ? 880 : 470,
            }}
          />
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

export function Video({ story, aspect }: VideoProps) {
  const cut = cuts[story];
  return (
    <AbsoluteFill style={{ background: brand.concrete }}>
      <Audio src={staticFile(cut.track)} />
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
                <Intro video={cut} aspect={aspect} duration={duration} />
              ) : last ? (
                <EndCard video={cut} aspect={aspect} duration={duration + TRANSITION} />
              ) : (
                <SceneView scene={cut.scenes[i - 1]!} aspect={aspect} duration={duration} />
              )}
            </AbsoluteFill>
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
}
