"""The licensed music tracks (apps/video/audio/track/), when they're there.

audio/track/track.json says which file each film uses and where its beats are:

    {"launch": {"file": "combined.wav", "bpm": 128.0, "band_entry": 12.748,
                "intro_loop": [5.248, 9.0]},
     "hype":   {"file": "hard-yards.mp3", "bpm": 128.0, "band_entry": 12.748,
                "final_chord": 57.736}}

- `bpm`: the track's tempo. src/timing.ts and src/hype-timing.ts take it, so every line, chapter
  card and cut that snaps to the beat snaps to the track's beat.
- `band_entry`: the time in the file where the full band comes in, on a downbeat. It lands on
  the film's hit, just after "Not anymore.".
- `intro_loop` (launch): two whole bars of the stop-start intro, repeated as often as the cold
  open needs before the intro's last bars lead into the band entry.
- `final_chord` (hype): the downbeat of the track's last chord; the cut's last line ends on it.

The track files themselves are licensed and git-ignored (this repository is public). Without
them, both films use their code scores. `python3 music/track.py <file>` prints a file's tempo
and the beat nearest 12.748 s, from onsets (check the numbers by ear before trusting them).
"""

import json
import os
import subprocess
import sys

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TRACK_DIR = os.path.join(ROOT, "audio", "track")
INFO = os.path.join(TRACK_DIR, "track.json")


def info(film):
    """The film's track settings (with the file's full path), or None to use the code score."""
    if not os.path.exists(INFO):
        return None
    meta = json.load(open(INFO)).get(film)
    if not meta:
        return None
    path = os.path.join(TRACK_DIR, meta["file"])
    if not os.path.exists(path):
        return None
    return {**meta, "path": path}


def load(path, sr, channels=2):
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", path, "-f", "f32le", "-ac", str(channels), "-ar", str(sr), "-"],
        capture_output=True,
        check=True,
    ).stdout
    x = np.frombuffer(raw, np.float32).astype(np.float64)
    return x.reshape(-1, channels).T if channels > 1 else x


def _fade(n, sr, ms=30):
    """Equal-power fade-in curve of `ms` milliseconds."""
    k = max(1, int(sr * ms / 1000))
    return np.sin(np.linspace(0, np.pi / 2, k)) if n >= k else np.ones(n)


def _splice(parts, sr):
    """Joins stereo clips with 30 ms equal-power crossfades."""
    out = parts[0]
    for p in parts[1:]:
        k = min(int(sr * 0.03), out.shape[1], p.shape[1])
        a = np.cos(np.linspace(0, np.pi / 2, k))
        b = np.sin(np.linspace(0, np.pi / 2, k))
        mid = out[:, -k:] * a + p[:, :k] * b
        out = np.concatenate([out[:, :-k], mid, p[:, k:]], axis=1)
    return out


def launch_bed(sr, n, hit, total, silence):
    """The long film's music: the stop-start intro (its loop repeated on whole bars) under the
    cold open, dead silence from `silence` to the hit, the band entry on the hit, then the
    track straight on, faded over the film's last two bars."""
    meta = info("launch")
    x = load(meta["path"], sr)
    bar = 4 * 60 / meta["bpm"]
    entry = meta["band_entry"]
    lo, hi = meta["intro_loop"]
    cut = lambda a, b: x[:, int(round(a * sr)) : int(round(b * sr))]  # noqa: E731
    # Before the hit: intro up to the loop's end, the loop as many times as needed, then the
    # rest of the intro into the band entry.
    repeats = max(0, int(np.ceil((hit - entry) / (hi - lo) - 1e-6)))
    pre = _splice([cut(0, hi)] + [cut(lo, hi)] * repeats + [cut(hi, entry)], sr)
    post = cut(entry, x.shape[1] / sr)
    y = np.zeros((2, n))
    start = int(round(hit * sr)) - pre.shape[1]
    a = max(0, start)
    y[:, a : int(round(hit * sr))] = pre[:, a - start :]
    h = int(round(hit * sr))
    m = min(n - h, post.shape[1])
    y[:, h : h + m] = post[:, :m]
    if start < 0:
        y[:, : int(sr * 0.3)] *= np.linspace(0, 1, int(sr * 0.3))
    # Dead silence before "Not anymore.", with a 20 ms release so it doesn't click.
    s = int(round(silence * sr))
    rel = int(sr * 0.02)
    y[:, s - rel : s] *= np.linspace(1, 0, rel)
    y[:, s:h] = 0
    # The end: faded over the last two bars.
    f = int(round(2 * bar * sr))
    y[:, n - f :] *= np.cos(np.linspace(0, np.pi / 2, f)) ** 2
    return y


def hype_bed(sr, n, hit, silence):
    """The hype cut's music: the track as it is, its band entry on the hit, dead silence from
    `silence` to the hit; it ends on its own last chord."""
    meta = info("hype")
    x = load(meta["path"], sr)
    y = np.zeros((2, n))
    start = int(round((hit - meta["band_entry"]) * sr))
    a, b = max(0, start), min(n, start + x.shape[1])
    y[:, a:b] = x[:, a - start : b - start]
    s, h = int(round(silence * sr)), int(round(hit * sr))
    rel = int(sr * 0.02)
    y[:, s - rel : s] *= np.linspace(1, 0, rel)
    y[:, s:h] = 0
    tail = int(sr * 0.25)
    y[:, -tail:] *= np.linspace(1, 0, tail)
    return y


def detect(path, around=12.748):
    """Tempo (BPM) and the beat nearest `around`, from onsets: positive spectral flux, its
    autocorrelation at 32 beats' lag (fine tempo), then the phase that collects the most flux."""
    sr, hop, nfft = 22050, 256, 1024
    x = load(path, sr, 1)
    frames = 1 + (len(x) - nfft) // hop
    idx = np.arange(nfft)[None, :] + hop * np.arange(frames)[:, None]
    spec = np.abs(np.fft.rfft(x[idx] * np.hanning(nfft), axis=1))
    flux = np.maximum(0, np.diff(np.log1p(spec * 10), axis=0)).sum(axis=1)
    flux = np.concatenate([[0], flux])
    t = (np.arange(frames) * hop + nfft / 2) / sr
    m = t >= around + 1
    f = flux[m] - flux[m].mean()
    dt = hop / sr
    best = (None, 0.0)
    for period in np.arange(0.35, 0.75, 0.00002):
        lag = 32 * period / dt
        lo = int(lag)
        if lo + 2 >= len(f):
            break
        fr = lag - lo
        v = (f[: -lo - 1] * (f[lo:-1] * (1 - fr) + f[lo + 1 :] * fr)).mean()
        if best[0] is None or v > best[0]:
            best = (v, period)
    period = best[1]
    span = t[m][-1] - t[m][0]
    scores = [
        np.interp(t[m][0] + o + np.arange(int(span / period)) * period, t, flux).sum()
        for o in np.arange(0, period, 0.002)
    ]
    b0 = t[m][0] + 0.002 * int(np.argmax(scores))
    beat = b0 + round((around - b0) / period) * period
    return round(60 / period, 2), round(float(beat), 3)


def main():
    if len(sys.argv) < 2:
        for film in ("launch", "hype"):
            meta = info(film)
            print(f"{film}: " + (f"{meta['file']}, {meta['bpm']} BPM" if meta else "code score"))
        return 0
    bpm, beat = detect(sys.argv[1])
    print(f"{sys.argv[1]}: {bpm} BPM, a beat at {beat:.3f} s")
    return 0


if __name__ == "__main__":
    sys.exit(main())
