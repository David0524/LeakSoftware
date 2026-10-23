"use client";

import { useEffect, useRef, useState } from "react";

// The 3D mark over the night sea (apps/video/logo3d, the same clip as the link preview), in the
// home page's closing band. It loads only when the band comes near, plays muted and looping,
// and stays on its still frame for anyone who asks for less motion.

export function ClosingClip() {
  const ref = useRef<HTMLVideoElement>(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)");
    const io = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) {
          setNear(true);
          if (!still.matches) void v.play().catch(() => {});
        } else {
          v.pause();
        }
      },
      { rootMargin: "300px" },
    );
    io.observe(v);
    return () => io.disconnect();
  }, []);

  return (
    <video
      ref={ref}
      aria-hidden="true"
      muted
      loop
      playsInline
      preload="none"
      poster="/og/sundeck-pro.jpg"
      src={near ? "/og/sundeck-pro.mp4" : undefined}
      className="lp-clip pointer-events-none block aspect-video w-full object-cover lg:absolute lg:inset-y-0 lg:right-0 lg:aspect-auto lg:h-full lg:w-[62%]"
    />
  );
}
