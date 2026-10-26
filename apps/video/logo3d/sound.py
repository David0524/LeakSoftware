"""Sound for the 3D logo clip's long versions (owner, 2026-10-25: "give me the longer looped
versions at 1080p and with sound"; picked 60 seconds, "Sea and soft music").

Everything is synthesized here, no samples: the sea breathing in long swells, water spilling
over the infinity edge, a light breeze, and a warm pad that changes chord with each 12-second
turn of the mark and swells, with a soft chime, as the mark comes round face-on (the start of
each loop). Fades in over 2 s and out over the last 4 s.

    python3 apps/video/logo3d/sound.py OUT.wav [--loops 5]

Needs numpy. Writes 48 kHz stereo WAV; ffmpeg's loudnorm brings it to about -16 LUFS when it's
put under the video.
"""

import sys
import wave

import numpy as np

RATE = 48000
LOOP = 12.0  # the clip's period: the mark is face-on at 0, 12, 24, ... s
rng = np.random.default_rng(20261025)


def shaped_noise(n, shape):
    """White noise filtered in one FFT by `shape(freqs)` (a gain per frequency)."""
    spec = np.fft.rfft(rng.standard_normal(n))
    spec *= shape(np.fft.rfftfreq(n, 1 / RATE))
    out = np.fft.irfft(spec, n)
    return out / (np.abs(out).max() + 1e-9)


def band(lo, hi, tilt=1.0):
    """A soft band: rises from `lo`, falls past `hi`, with a 1/f**tilt slope (pinkish)."""
    def shape(f):
        f = np.maximum(f, 1.0)
        return (1 / (1 + (lo / f) ** 4)) * (1 / (1 + (f / hi) ** 4)) / f ** (tilt / 2)
    return shape


def smooth(x, seconds):
    k = max(1, int(seconds * RATE))
    return np.convolve(x, np.ones(k) / k, mode="same")


def sea(n, t):
    """Long swells: a low rumble always there, and a brighter wash that rises with each wave."""
    rumble = np.stack([shaped_noise(n, band(40, 400, 1.2)) for _ in range(2)])
    wash = np.stack([shaped_noise(n, band(300, 5000, 0.8)) for _ in range(2)])
    env = np.zeros(n)
    at = 0.8
    while at < t[-1]:
        # A wave every 5 to 8 s: it builds over about 2 s and falls back over 3 to 4 s.
        peak = at + rng.uniform(1.6, 2.4)
        rise = np.clip((t - at) / (peak - at), 0, 1)
        fall = np.exp(-np.clip(t - peak, 0, None) / rng.uniform(1.4, 2.0))
        env = np.maximum(env, rng.uniform(0.6, 1.0) * np.sin(rise * np.pi / 2) ** 2 * fall)
        at += rng.uniform(5.0, 8.0)
    env = smooth(env, 0.25)
    return 0.30 * rumble * (0.55 + 0.45 * env) + 0.22 * wash * env ** 1.5


def spill(n, t):
    """The infinity edge: a thin, steady trickle, breathing a little."""
    water = np.stack([shaped_noise(n, band(1800, 7000, 0.3)) for _ in range(2)])
    return 0.045 * water * (0.8 + 0.2 * np.sin(2 * np.pi * 0.23 * t + np.array([[0], [1.3]])))


def breeze(n, t):
    """Air through the palm fronds, very low."""
    air = np.stack([shaped_noise(n, band(150, 1200, 1.0)) for _ in range(2)])
    return 0.05 * air * (0.6 + 0.4 * np.sin(2 * np.pi * 0.07 * t) ** 2)


def note(name):
    names = {"C": 0, "C#": 1, "D": 2, "D#": 3, "E": 4, "F": 5, "F#": 6, "G": 7, "G#": 8,
             "A": 9, "A#": 10, "B": 11}
    return 440.0 * 2 ** ((names[name[:-1]] + 12 * (int(name[-1]) + 1) - 69) / 12)


# One chord per turn: D major 9, B minor 11, G major 9, A sus, home to D.
CHORDS = [
    ["D3", "A3", "F#4", "C#5", "E5"],
    ["B2", "F#3", "D4", "A4", "E5"],
    ["G2", "D3", "B3", "F#4", "A4"],
    ["A2", "E3", "B3", "D4", "F#4"],
    ["D3", "A3", "F#4", "A4", "E5"],
]


def pad(n, t, loops):
    """Warm pad: each note a few soft, slightly detuned partials; chords cross-fade over 2 s at
    each turn, and the whole pad swells as the mark comes face-on."""
    out = np.zeros((2, n))
    for i in range(loops):
        chord = CHORDS[i % len(CHORDS)] if i < loops - 1 else CHORDS[-1]
        start, end = i * LOOP - 1.0, (i + 1) * LOOP + 1.0
        gate = np.clip((t - start) / 2.0, 0, 1) * np.clip((end - t) / 2.0, 0, 1)
        gate = np.sin(gate * np.pi / 2) ** 2
        for name in chord:
            f = note(name)
            # Detuned left and right for width, but not the bass: low notes would beat (wobble).
            spread = 0.0025 if f > 200 else 0.0
            for ch, detune in ((0, -spread), (1, spread)):
                for k, amp in ((1, 1.0), (2, 0.35), (3, 0.12)):
                    phase = rng.uniform(0, 2 * np.pi)
                    out[ch] += amp * gate * np.sin(2 * np.pi * f * k * (1 + detune) * t + phase)
    # The swell: up a little around each face-on moment, and slow vibrato-free breathing.
    face = np.cos(2 * np.pi * t / LOOP)  # 1 at face-on, -1 round the back
    out *= 0.6 + 0.4 * (face + 1) / 2
    return 0.035 * out


def chimes(n, t, loops):
    """A soft bell on each face-on moment after the first, on the new chord's top note."""
    out = np.zeros((2, n))
    for i in range(1, loops):
        at = i * LOOP + 0.15
        f = note(CHORDS[i % len(CHORDS)][-1]) * 2
        dt = np.clip(t - at, 0, None)
        on = t >= at
        tone = sum(a * np.sin(2 * np.pi * f * r * dt) * np.exp(-dt / d)
                   for r, a, d in ((1, 1.0, 2.2), (2.76, 0.35, 0.9), (5.4, 0.12, 0.4)))
        tone = tone * on * np.clip(dt / 0.004, 0, 1)
        out[0] += 0.8 * tone
        out[1] += 0.6 * tone
    return 0.05 * out


def main():
    args = sys.argv[1:]
    out = args[0]
    loops = int(args[args.index("--loops") + 1]) if "--loops" in args else 5
    seconds = loops * LOOP
    n = int(seconds * RATE)
    t = np.arange(n) / RATE
    mix = sea(n, t) + spill(n, t) + breeze(n, t) + pad(n, t, loops) + chimes(n, t, loops)
    fade = np.clip(t / 2.0, 0, 1) * np.clip((seconds - t) / 4.0, 0, 1)
    mix *= fade ** 1.5
    mix /= np.abs(mix).max() / 0.8
    pcm = (np.clip(mix.T, -1, 1) * 32767).astype("<i2")
    with wave.open(out, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(pcm.tobytes())
    print(f"wrote {out}: {seconds:.0f} s")


if __name__ == "__main__":
    main()
