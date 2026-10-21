"""
Music for the demo videos, made in code (owner, 2026-10-21: "You make it with code. Start with
the audio, then build the demo over it"). docs/plans/demo-videos.md.

Two 45-second tracks at 128 BPM: 24 bars of 1.875 s. The video is cut to these bars: a 2-bar
intro (the logo), six scenes of 3 bars, and a 4-bar end card. Every scene change gets a soft
whoosh; the first scene lands on a hit. Writes, for each track:

  out/<name>.wav          44.1 kHz stereo, peak -1 dBFS
  out/<name>.timing.json  the bars and scene starts in seconds, for the video

Run: python3 apps/video/audio/score.py   (numpy only)
"""

import json
import math
import os
import wave

import numpy as np

SR = 44_100
BPM = 128
BEAT = 60 / BPM
BAR = BEAT * 4
BARS = 24
LENGTH = BARS * BAR  # 45.0 s
TAIL = 1.5  # the last chord rings past 45 s, faded to silence by 45 s in the render
N = int((LENGTH) * SR)
OUT = os.path.join(os.path.dirname(__file__), "out")

# The video's sections, in bars: start, length.
SECTIONS = [("intro", 0, 2)] + [(f"scene{i + 1}", 2 + 3 * i, 3) for i in range(6)] + [("end", 20, 4)]

rng = np.random.default_rng(7)


def t_of(bar, beat=0.0):
    return bar * BAR + beat * BEAT


def midi(n):
    return 440.0 * 2 ** ((n - 69) / 12)


def env_adsr(length, a, d, s, r, sr=SR):
    n = int(length * sr)
    na, nd, nr = int(a * sr), int(d * sr), int(r * sr)
    e = np.full(n + nr, s, dtype=np.float64)
    if na:
        e[:na] = np.linspace(0, 1, na)
    if nd:
        e[na : na + nd] = np.linspace(1, s, nd)
    e[n : n + nr] = np.linspace(s, 0, nr) if nr else []
    return e


def fit(e, n):
    """An envelope cut or padded with silence to n samples."""
    return e[:n] if len(e) >= n else np.concatenate([e, np.zeros(n - len(e))])


def lowpass(x, cutoff):
    """One-pole low-pass; cutoff may be a number or an array (a sweep)."""
    c = np.broadcast_to(np.asarray(cutoff, dtype=np.float64), x.shape)
    a = 1 - np.exp(-2 * math.pi * c / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc += a[i] * (x[i] - acc)
        y[i] = acc
    return y


def highpass(x, cutoff):
    return x - lowpass(x, cutoff)


def saw(freq, n, detune=0.0):
    ph = np.cumsum(np.full(n, freq * (1 + detune) / SR)) + rng.random()
    return 2 * (ph % 1) - 1


def add(buf, start_s, sig, gain=1.0):
    i = int(start_s * SR)
    if i >= len(buf):
        return
    j = min(len(buf), i + len(sig))
    buf[i:j] += sig[: j - i] * gain


# --- Drums -------------------------------------------------------------------------------


def kick():
    n = int(0.45 * SR)
    t = np.arange(n) / SR
    f = 48 + 110 * np.exp(-t * 28)
    body = np.sin(2 * math.pi * np.cumsum(f) / SR) * np.exp(-t * 7)
    click = rng.standard_normal(n) * np.exp(-t * 400) * 0.25
    return np.tanh((body + click) * 1.6)


def clap():
    n = int(0.3 * SR)
    t = np.arange(n) / SR
    noise = rng.standard_normal(n)
    e = np.zeros(n)
    for k, off in enumerate((0.0, 0.011, 0.022)):
        e += (t >= off) * np.exp(-np.clip(t - off, 0, None) * (90 if k < 2 else 18))
    return highpass(lowpass(noise * e, 6000), 900) * 0.8


def hat(open_=False):
    n = int((0.22 if open_ else 0.05) * SR)
    t = np.arange(n) / SR
    noise = rng.standard_normal(n)
    return highpass(noise, 7000) * np.exp(-t * (14 if open_ else 80)) * 0.35


def whoosh(length=0.9):
    """A soft swept noise ending on the beat: the transition sound."""
    n = int(length * SR)
    t = np.linspace(0, 1, n)
    noise = rng.standard_normal(n)
    sweep = lowpass(noise, 300 + 5000 * t**2)
    return sweep * np.sin(math.pi * t) ** 1.5 * 0.5


def riser(length):
    n = int(length * SR)
    t = np.linspace(0, 1, n)
    noise = highpass(rng.standard_normal(n), 500 + 7000 * t)
    tone = np.sin(2 * math.pi * np.cumsum(200 + 900 * t**2) / SR) * 0.15
    return (noise * 0.35 + tone) * t**2


def impact():
    n = int(2.5 * SR)
    t = np.arange(n) / SR
    boom = np.sin(2 * math.pi * np.cumsum(30 + 60 * np.exp(-t * 10)) / SR) * np.exp(-t * 2.2)
    crash = highpass(rng.standard_normal(n), 3000) * np.exp(-t * 3) * 0.25
    return np.tanh(boom * 1.4) + crash


# --- Tonal parts ---------------------------------------------------------------------------


def pad_chord(notes, length):
    n = int(length * SR)
    sig = np.zeros(n)
    for note in notes:
        for det in (-0.006, 0.0, 0.007):
            sig += saw(midi(note), n, det)
    sig /= len(notes) * 3
    e = fit(env_adsr(length - 0.4, 0.35, 0.3, 0.8, 0.4), n)
    return lowpass(sig * e, 1400)


def bass_note(note, length):
    n = int(length * SR)
    sig = saw(midi(note), n) * 0.6 + np.sin(2 * math.pi * midi(note - 12) * np.arange(n) / SR) * 0.6
    e = fit(env_adsr(length - 0.05, 0.005, 0.12, 0.7, 0.05), n)
    return lowpass(sig * e, 420)


def pluck(note, bright=1.0):
    n = int(0.35 * SR)
    t = np.arange(n) / SR
    sig = saw(midi(note), n) * 0.5 + np.sign(np.sin(2 * math.pi * midi(note) * t)) * 0.3
    cutoff = 400 + 4200 * bright * np.exp(-t * 18)
    return lowpass(sig, cutoff) * np.exp(-t * 9)


def echo(x, delay, feedback, mix):
    d = int(delay * SR)
    y = x.copy()
    for k in range(1, 5):
        shifted = np.zeros_like(x)
        shifted[d * k :] = x[: len(x) - d * k] * (feedback**k)
        y += shifted * mix
    return y


# --- Arrangement ---------------------------------------------------------------------------

TRACKS = {
    # Confident, a little darker: A minor (Am F C G).
    "leak": {
        "chords": [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]],
        "bass": [33, 29, 36, 31],
        "arp": [0, 2, 1, 2, 0, 2, 1, 3],
        "bright": 0.8,
    },
    # Sunny and open: D major (D A Bm G).
    "pool": {
        "chords": [[62, 66, 69], [61, 64, 69], [59, 62, 66], [55, 59, 62]],
        "bass": [38, 33, 35, 31],
        "arp": [0, 1, 2, 1, 0, 2, 1, 2],
        "bright": 1.0,
    },
}


def build(name, spec):
    L = np.zeros(N + int(TAIL * SR))
    R = np.zeros_like(L)
    drums = np.zeros_like(L)
    bass = np.zeros_like(L)
    pads = np.zeros_like(L)
    arps = np.zeros_like(L)
    fx = np.zeros_like(L)
    k, c, h, ho = kick(), clap(), hat(), hat(True)

    groove = range(2, 20)  # the scenes
    for bar in range(BARS):
        chord_i = bar % 4
        chord = spec["chords"][chord_i]
        in_groove = bar in groove
        in_end = bar >= 20
        # Pads all the way through (they carry the intro and the end card).
        pads[int(t_of(bar) * SR) :][: int(BAR * SR)] += pad_chord(chord, BAR)[: int(BAR * SR)] * (
            0.55 if in_groove else 0.8
        )
        if in_groove or bar == 20:
            for beat in range(4):
                add(drums, t_of(bar, beat), k, 0.9)
                if beat in (1, 3):
                    add(drums, t_of(bar, beat), c, 0.45)
            # Hats build in after the first scene; open hats on the off-beats later.
            for eighth in range(8):
                if eighth % 2 == 1 and bar >= 5:
                    add(drums, t_of(bar, eighth / 2), ho if bar >= 11 and eighth in (3, 7) else h, 0.6)
            # Bass on the eighths, root and octave.
            root = spec["bass"][chord_i]
            for eighth in range(8):
                add(bass, t_of(bar, eighth / 2), bass_note(root + (12 if eighth in (3, 7) else 0), BEAT / 2), 0.55)
        if (in_groove and bar >= 3) or bar == 1:
            # The arp: sixteenths over the chord, an octave up, quieter in the intro.
            for s in range(16):
                note = chord[spec["arp"][s % 8] % 3] + 12 + (12 if s % 8 == 7 else 0)
                add(arps, t_of(bar, s / 4), pluck(note, spec["bright"]), 0.16 if bar == 1 else 0.22)
        if in_end and bar >= 21:
            # End card: a held chord and a slow arp, then let it ring.
            for s in range(0, 16, 2):
                note = chord[spec["arp"][s % 8] % 3] + 12
                add(arps, t_of(bar, s / 4), pluck(note, 0.6), 0.14)

    # Transitions: a whoosh into every scene and the end card; the riser and hit into scene 1.
    add(fx, t_of(2) - 1.6, riser(1.6), 0.8)
    add(fx, t_of(2), impact(), 0.7)
    for _, start, _ in SECTIONS[2:]:
        w = whoosh()
        add(fx, t_of(start) - len(w) / SR + 0.05, w, 0.55)
    add(fx, t_of(20), impact(), 0.6)

    # Sidechain: pads, bass and arps duck under each kick in the groove.
    duck = np.ones_like(L)
    dn = int(BEAT * SR)
    shape = 1 - 0.55 * np.exp(-np.linspace(0, 6, dn))
    for bar in list(groove) + [20]:
        for beat in range(4):
            i = int(t_of(bar, beat) * SR)
            duck[i : i + dn] = np.minimum(duck[i : i + dn], shape[: len(duck[i : i + dn])])

    arps_wet = echo(arps, BEAT * 0.75, 0.45, 0.5)
    # A touch of width: the pad and the arp's echo a few milliseconds apart left and right.
    w = int(0.011 * SR)
    pads_r = np.concatenate([np.zeros(w), pads[:-w]])
    arps_r = np.concatenate([np.zeros(w * 2), arps_wet[: -w * 2]])
    L = drums + bass * duck + pads * duck * 0.5 + arps_wet * duck + fx
    R = drums + bass * duck + pads_r * duck * 0.5 + arps_r * duck + fx

    # Fade in over the first 0.3 s and out over the last 2 s, ending silent at 45 s.
    total = np.arange(len(L)) / SR
    fade = np.clip(total / 0.3, 0, 1) * np.clip((LENGTH - total) / 2.0, 0, 1)
    L, R = L * fade, R * fade
    L, R = L[:N], R[:N]
    stereo = np.tanh(np.stack([L, R], axis=1))
    # Background music under captions: about -14 LUFS (online video), peaks well under 0 dBFS.
    stereo *= 10 ** (-4.5 / 20) / np.max(np.abs(stereo))

    os.makedirs(OUT, exist_ok=True)
    with wave.open(os.path.join(OUT, f"{name}.wav"), "wb") as f:
        f.setnchannels(2)
        f.setsampwidth(2)
        f.setframerate(SR)
        f.writeframes((stereo * 32767).astype("<i2").tobytes())
    timing = {
        "bpm": BPM,
        "bar": BAR,
        "length": LENGTH,
        "sections": [{"id": s, "start": t_of(b), "end": t_of(b + n)} for s, b, n in SECTIONS],
    }
    with open(os.path.join(OUT, f"{name}.timing.json"), "w") as f:
        json.dump(timing, f, indent=2)


if __name__ == "__main__":
    for name, spec in TRACKS.items():
        build(name, spec)
        print(f"wrote {name}.wav")
