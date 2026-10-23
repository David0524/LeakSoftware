"""The 60-second hype cut's score, written in code (docs/plans/launch-video.md, section 10).

Built on the hype timeline (build/hype/timeline.json, from src/render-hype.ts), in the long
film's gritty, blue-collar sound but tighter and more driving, at 120 BPM:
  - the cold open: a low drone, a clock on the beat, a muffled pulse, and a two-bar riser that
    cuts to dead silence before "Not anymore.";
  - the hit, just after the words (the timeline's `hit`): a sub drop, a distorted stab, a crash;
  - the groove: heavy drums, palm-muted bass and guitar chugs on eighths, a fill and a crash into
    every stretch where nobody talks, ducked well under every voice line;
  - the lift into the vision: a snare roll, then ringing open chords, a pad and a lead;
  - the end hit on the logo, its chord ringing out to silence under the end card.

Writes build/hype/music.wav (the score, ducked), build/hype/voice.wav (the narration on the
timeline) and build/hype/mix.wav (both: about -14 LUFS integrated, true peak under -1 dBTP).

    python3 music/hype_score.py           # make the score and the mix, then check them
    python3 music/hype_score.py --check [out/sundeck-pro-hype.mp4]

The check measures the mix (or the finished film) with ffmpeg's EBU R128 meter, and for every
voice line the voice stem against the music stem as short-term loudness (K-weighted, 3 s windows
inside the line; a line shorter than 3 s is measured over its own span). It fails when any line's
music is less than 12 dB under the voice, the integrated loudness is off -14 by more than 1 LU,
or the true peak is over -1 dBTP.

Needs numpy and ffmpeg. Everything is synthesized here; no samples or loops from anywhere else.
"""

import json
import os
import subprocess
import sys

import numpy as np

import track

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUILD = os.path.join(ROOT, "build", "hype")
SR = 48000
RNG = np.random.default_rng(20261023)

# Mix targets. The voice bus sits at VOICE_LUFS; the music bus is set so the band, where nobody
# talks, plays at about GAP_MUSIC_LUFS (short-term); under each line it's ducked until it sits
# DUCK_TARGET dB under the voice (the check's floor is MIN_GAP).
VOICE_LUFS = -15.0
GAP_MUSIC_LUFS = -13.0
DUCK_TARGET = 14.5
MIN_GAP = 12.0
# With the licensed track (owner, 2026-10-23): a present bed, 8 to 10 dB under the voice and
# never less than 7, up to full between lines.
GAP_MUSIC_LUFS_TRACK = -14.0
TRACK_DUCK_TARGET = 9.0
TRACK_MIN_GAP = 7.0
TARGET_LUFS = -14.0
PEAK_CEILING = -1.0


# ---------------------------------------------------------------------------
# Tools
# ---------------------------------------------------------------------------


def seconds(n):
    return int(round(n * SR))


def place(bus, sound, t, gain=1.0, pan=0.0):
    """Adds a mono sound to a stereo bus at time t (seconds), panned -1..1."""
    i = seconds(t)
    if i >= bus.shape[1] or i + len(sound) <= 0:
        return
    a, b = max(0, i), min(bus.shape[1], i + len(sound))
    s = sound[a - i : b - i] * gain
    left = np.cos((pan + 1) * np.pi / 4)
    right = np.sin((pan + 1) * np.pi / 4)
    bus[0, a:b] += s * left * 1.414
    bus[1, a:b] += s * right * 1.414


def fft_filter(x, low=None, high=None, slope=1.5):
    """Low-pass (above `high`) and high-pass (below `low`) by shaping the spectrum."""
    n = len(x)
    spec = np.fft.rfft(x, n)
    f = np.fft.rfftfreq(n, 1 / SR)
    g = np.ones_like(f)
    if high:
        g *= 1 / (1 + (f / high) ** (2 * slope))
    if low:
        g *= 1 / (1 + (low / np.maximum(f, 1e-3)) ** (2 * slope))
    return np.fft.irfft(spec * g, n)


def saw(freq, dur, detune=0.0):
    t = np.arange(seconds(dur)) / SR
    out = np.zeros_like(t)
    voices = (-detune, 0.0, detune) if detune else (0.0,)
    for d in voices:
        out += 2 * ((t * freq * (1 + d) + RNG.random()) % 1.0) - 1
    return out / len(voices)


def env(n, attack, decay, sustain=0.0, release=0.0):
    """Attack-decay-sustain envelope in seconds over n samples, with a release at the end."""
    e = np.full(n, sustain, dtype=float)
    a = min(n, seconds(attack))
    d = min(n - a, seconds(decay))
    if a:
        e[:a] = np.linspace(0, 1, a)
    if d:
        e[a : a + d] = sustain + (1 - sustain) * np.exp(-5 * np.arange(d) / d)
    r = min(n, seconds(release))
    if r:
        e[n - r :] *= np.linspace(1, 0, r)
    return e


def drive(x, amount):
    return np.tanh(x * amount) / np.tanh(amount)


def note(name):
    names = {"C": 0, "C#": 1, "D": 2, "D#": 3, "E": 4, "F": 5, "F#": 6, "G": 7, "G#": 8, "A": 9, "A#": 10, "B": 11}
    pitch, octave = name[:-1], int(name[-1])
    return 440 * 2 ** ((12 * (octave + 1) + names[pitch] - 69) / 12)


# ---------------------------------------------------------------------------
# Instruments (each made once, then placed)
# ---------------------------------------------------------------------------


def kick(weight=1.0):
    n = seconds(0.5)
    t = np.arange(n) / SR
    f = 44 + 120 * np.exp(-t * 30)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * (7.5 / weight))
    click = fft_filter(RNG.standard_normal(n), low=1800) * np.exp(-t * 220) * 0.4
    return drive(body + click, 2.4)


def snare():
    n = seconds(0.4)
    t = np.arange(n) / SR
    tone = np.sin(2 * np.pi * 190 * t) * np.exp(-t * 24) * 0.55
    noise = fft_filter(RNG.standard_normal(n), low=1000, high=9500) * np.exp(-t * 15)
    return drive(tone + noise * 0.95, 2.8) * 0.9


def hat(open_=False):
    n = seconds(0.35 if open_ else 0.07)
    t = np.arange(n) / SR
    x = fft_filter(RNG.standard_normal(n), low=7500)
    return x * np.exp(-t * (10 if open_ else 75)) * 0.42


def tom(freq):
    n = seconds(0.45)
    t = np.arange(n) / SR
    f = freq * (1 + 0.5 * np.exp(-t * 30))
    return drive(np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 7.5), 1.9) * 0.8


def crash(dur=3.0):
    n = seconds(dur)
    t = np.arange(n) / SR
    x = fft_filter(RNG.standard_normal(n), low=3500, high=14000)
    return x * np.exp(-t * 1.7) * (1 + 0.15 * np.sin(2 * np.pi * 7 * t)) * 0.55


def boom(dur=3.0):
    """The hit: a long sub drop, a noise burst and a low distorted stab."""
    n = seconds(dur)
    t = np.arange(n) / SR
    f = 30 + 75 * np.exp(-t * 9)
    sub = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 1.5)
    burst = fft_filter(RNG.standard_normal(n), high=5000) * np.exp(-t * 10) * 0.55
    stab = power_chord("E2", dur, mute=False) * np.exp(-t * 1.2) * 0.75
    return drive(sub * 1.25 + burst + stab, 1.7)


def tick(high=True):
    n = seconds(0.05)
    t = np.arange(n) / SR
    ping = np.sin(2 * np.pi * (2900 if high else 2300) * t) * np.exp(-t * 160)
    click = fft_filter(RNG.standard_normal(n), low=2000) * np.exp(-t * 400) * 0.4
    return (ping + click) * 0.35


def bass(freq, dur):
    """A palm-muted electric bass note: a saw through a dark filter, quick decay."""
    x = saw(freq, dur, detune=0.003)
    x = fft_filter(x, high=480, slope=2)
    return drive(x * env(len(x), 0.004, dur * 0.7, sustain=0.3, release=0.03), 2.2)


def power_chord(root, dur, mute=True):
    """Root, fifth and octave through a fuzz and a small cab: a palm-muted chug, or ringing."""
    f = note(root)
    x = saw(f, dur, 0.004) + saw(f * 1.5, dur, 0.004) * 0.8 + saw(f * 2, dur, 0.004) * 0.6
    x = drive(x * 3.2, 3.8)
    x = fft_filter(x, low=95, high=1700 if mute else 3600, slope=1.6)
    e = env(len(x), 0.003, 0.08 if mute else dur * 0.8, sustain=0.0 if mute else 0.4, release=0.03)
    return x * e * 0.5


def pad(freqs, dur):
    x = sum(saw(f, dur, 0.006) for f in freqs) / len(freqs)
    x = fft_filter(x, high=2600, slope=1.2)
    return x * env(len(x), 0.35, dur, sustain=1.0, release=0.8) * 0.6


def lead(freq, dur):
    """A gritty lead with a slide up into each note."""
    n = seconds(dur)
    t = np.arange(n) / SR
    f = freq * (1 - 0.06 * np.exp(-t * 18)) * (1 + 0.004 * np.sin(2 * np.pi * 5.5 * t))
    x = 2 * ((np.cumsum(f) / SR) % 1.0) - 1
    x = drive(fft_filter(x, high=3000) * 2.2, 2.2)
    return x * env(n, 0.02, dur, sustain=0.8, release=0.2) * 0.33


def drone(dur):
    n = seconds(dur)
    t = np.arange(n) / SR
    x = saw(note("E1"), dur, 0.004) + saw(note("B1"), dur, 0.005) * 0.6 + saw(note("E2"), dur, 0.003) * 0.3
    x = fft_filter(x, high=240, slope=2)
    return x * np.minimum(1, t / 1.2)


def riser(dur):
    """Noise that brightens and swells, with a saw climbing an octave and a half under it."""
    n = seconds(dur)
    t = np.arange(n) / SR
    x = RNG.standard_normal(n)
    k = (t / dur) ** 2
    noise = fft_filter(x, high=900) * (1 - k) + fft_filter(x, low=2500) * k
    f = note("E2") * 2 ** (1.5 * (t / dur) ** 1.6)
    tone = drive((2 * ((np.cumsum(f) / SR) % 1.0) - 1) * 1.5, 1.5)
    tone = fft_filter(tone, high=2200)
    return (noise * 0.6 + tone * 0.35) * (t / dur) ** 2.2


def roll(dur, s):
    """A snare roll in sixteenths that swells (into the vision)."""
    n = seconds(dur + 0.5)
    out = np.zeros(n)
    step = 60 / 120 / 4
    k = 0
    while k * step < dur - 1e-6:
        i = seconds(k * step)
        g = 0.25 + 0.75 * (k * step / dur) ** 1.5
        seg = s[: n - i]
        out[i : i + len(seg)] += seg * g
        k += 1
    return out


def reverb(bus, seconds_=2.2, mix=0.22):
    """A plate-ish reverb by convolution with decaying noise (each channel its own noise)."""
    n_ir = seconds(seconds_)
    t = np.arange(n_ir) / SR
    out = np.zeros_like(bus)
    for c in range(2):
        ir = fft_filter(RNG.standard_normal(n_ir), low=200, high=7000) * np.exp(-t * 6.9 / seconds_)
        ir /= np.sqrt(np.sum(ir**2))
        n = 1 << int(np.ceil(np.log2(bus.shape[1] + n_ir)))
        out[c] = np.fft.irfft(np.fft.rfft(bus[c], n) * np.fft.rfft(ir, n), n)[: bus.shape[1]]
    return out * mix


# ---------------------------------------------------------------------------
# Audio in and out, and the loudness meter
# ---------------------------------------------------------------------------


def load_audio(path, channels=1):
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", path, "-f", "f32le", "-ac", str(channels), "-ar", str(SR), "-"],
        check=True,
        capture_output=True,
    ).stdout
    x = np.frombuffer(raw, dtype=np.float32).astype(float)
    return x if channels == 1 else x.reshape(-1, channels).T


def write_wav(path, x):
    x = np.clip(x, -1, 1).astype(np.float32)
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "2", "-i", "-", "-c:a", "pcm_s24le", path],
        input=x.T.tobytes(),
        check=True,
    )


# The K-weighting of ITU-R BS.1770 at 48 kHz: a high shelf, then a high-pass.
K_FILTERS = (
    "biquad=b0=1.53512485958697:b1=-2.69169618940638:b2=1.19839281085285"
    ":a0=1:a1=-1.69065929318241:a2=0.73248077421585,"
    "biquad=b0=1.0:b1=-2.0:b2=1.0:a0=1:a1=-1.99004745483398:a2=0.99007225036621"
)


def k_weighted_power(stereo):
    """Mean K-weighted power per sample, summed over both channels (BS.1770)."""
    raw = subprocess.run(
        [
            "ffmpeg", "-v", "error", "-f", "f32le", "-ar", str(SR), "-ac", "2", "-i", "-",
            "-af", K_FILTERS, "-f", "f32le", "-ac", "2", "-",
        ],
        input=stereo.T.astype(np.float32).tobytes(),
        check=True,
        capture_output=True,
    ).stdout
    y = np.frombuffer(raw, dtype=np.float32).astype(float).reshape(-1, 2)
    return (y**2).sum(axis=1)


def window_lufs(power, a, b):
    """Loudness (LUFS, ungated) of samples a..b of a K-weighted power signal."""
    m = power[max(0, a) : max(a + 1, b)].mean()
    return -0.691 + 10 * np.log10(m + 1e-20)


def short_term_gap(vp, mp, start, end):
    """The voice's lead over the music in a line: the smallest over 3 s windows inside it."""
    a, b = seconds(start), seconds(end)
    win = seconds(3.0)
    if b - a <= win:
        v, m = window_lufs(vp, a, b), window_lufs(mp, a, b)
        return v - m, v, m
    worst = None
    for i in range(a, b - win + 1, seconds(0.1)):
        v, m = window_lufs(vp, i, i + win), window_lufs(mp, i, i + win)
        if worst is None or v - m < worst[0]:
            worst = (v - m, v, m)
    return worst


def line_gap(vp, mp, start, end):
    """The line's gap as music/check_mix.py reads it: short-term (3 s windows), or for a line
    under about 3 s momentary windows (0.4 s) while the voice speaks (within 8 dB of its loudest)."""
    if end - start > 3.2:
        return short_term_gap(vp, mp, start, end)[0]
    w = seconds(0.4)
    rows = [
        (window_lufs(vp, i, i + w), window_lufs(mp, i, i + w))
        for i in range(seconds(start), seconds(end) - w + 1, seconds(0.1))
    ]
    if not rows:
        return short_term_gap(vp, mp, start, end)[0]
    loudest = max(v for v, _ in rows)
    return min(v - m for v, m in rows if v >= loudest - 8)


def ebur128(path):
    """Integrated loudness and true peak by ffmpeg's EBU R128 meter."""
    out = subprocess.run(
        ["ffmpeg", "-nostats", "-i", path, "-af", "ebur128=peak=true", "-f", "null", "-"],
        capture_output=True,
        text=True,
    ).stderr
    summary = out[out.rfind("Summary:") :]
    lufs = float(summary.split("I:")[1].split("LUFS")[0])
    peak = float(summary.split("Peak:")[1].split("dBFS")[0])
    return lufs, peak


# ---------------------------------------------------------------------------
# The score
# ---------------------------------------------------------------------------


def hit_kit(band, air, verb, hit, k_big, s_s):
    """The hit after "Not anymore.": the boom, a crash, the big kick and a snare (the long
    film's score uses it too, at the same levels)."""
    hb = boom()
    place(air, hb, hit, 0.85)
    place(verb, hb, hit, 0.45)
    place(air, crash(4.0), hit, 0.65)
    place(band, k_big, hit, 1.0)
    place(band, s_s, hit, 0.6)


def compose(tl, n, hit_only=False):
    """The band (ducked under the voice), the air (hits, crashes, swells) and a reverb send.
    `hit_only`: just the hit after "Not anymore." (the licensed track plays everything else)."""
    beat = tl["beat"]
    bar = beat * 4
    hit = tl["hit"]
    lines = {l["n"]: l for l in tl["lines"]}
    vision = tl["vision"]
    end_hit = tl["endHit"]
    total = tl["total"]
    silence = lines[6]["start"] - 0.25  # the picture goes black here: dead air until the hit

    band = np.zeros((2, n))
    air = np.zeros((2, n))
    verb = np.zeros((2, n))
    k_s, k_big, s_s, h_s, h_o = kick(), kick(1.6), snare(), hat(), hat(True)

    if hit_only:
        hit_kit(band, air, verb, hit, k_big, s_s)
        return band, air, verb

    # Cold open: drone, the clock on every beat, a muffled pulse on 1 and 3, the riser.
    d = drone(silence)
    d[-seconds(0.03) :] *= np.linspace(1, 0, seconds(0.03))
    place(band, d, 0, 0.55)
    t, k = 0.25, 0
    while t < silence - 0.05:
        place(air, tick(k % 2 == 0), t, 0.5, pan=0.25 if k % 2 else -0.25)
        if k % 2 == 0:
            place(band, fft_filter(k_s, high=900) * 0.8, t, 0.7)
        t += beat
        k += 1
    rise = riser(2 * bar)
    rise[-seconds(0.02) :] *= np.linspace(1, 0, seconds(0.02))
    place(air, rise, silence - 2 * bar, 0.6)
    # Everything stops dead at the black frame.
    for bus in (band, air, verb):
        bus[:, seconds(silence) : seconds(hit)] = 0

    # The hit, just after "Not anymore.".
    hit_kit(band, air, verb, hit, k_big, s_s)

    # The groove: from the hit to the vision, eighths at 120 BPM.
    prog = ["E2", "E2", "C2", "D2"]
    bass_n = {r: bass(note(r.replace("2", "1")), beat / 2 * 0.92) for r in set(prog)}
    chug = {r: power_chord(r, beat / 2 * 0.92) for r in set(prog)}
    ring = {r: power_chord(r, bar, mute=False) for r in set(prog)}
    kick_p = [1, 0, 0, 1, 1, 0, 1, 0]
    snare_p = [0, 0, 1, 0, 0, 0, 1, 0]
    chug_p = [1, 1, 1, 0, 1, 1, 0, 1]
    t = hit + beat * 2  # two beats of ringing hit before the band comes in
    e = 4
    while t < vision - 1e-6:
        step = e % 8
        root = prog[(e // 8) % 4]
        if kick_p[step]:
            place(band, k_s, t, 0.95)
        if snare_p[step]:
            place(band, s_s, t, 0.8, pan=0.05)
            place(verb, s_s, t, 0.3)
        place(band, h_o if step == 7 else h_s, t, 0.3 if step % 2 else 0.45, pan=0.35)
        place(band, bass_n[root], t, 0.85)
        if chug_p[step]:
            place(band, chug[root], t, 0.42, pan=-0.5)
            place(band, chug[root], t + 0.011, 0.36, pan=0.5)
        if step == 0:
            place(band, ring[root], t, 0.14)
        t += beat / 2
        e += 1

    # The stretches where nobody talks: a crash where the band opens up, and a tom fill on the
    # last beat before the next line comes in.
    talk = [(l["start"], l["end"]) for l in tl["lines"]]
    for (a0, a1), (b0, _) in zip(talk, talk[1:]):
        if a1 < hit or b0 > vision - 0.01 or b0 - a1 < 1.2:
            continue
        open_at = hit + np.ceil((a1 - hit) / beat) * beat
        place(air, crash(2.4), open_at, 0.45, pan=-0.2)
        fill = b0 - beat
        for i, f in enumerate([190, 160, 130, 100]):
            place(band, tom(f), fill + i * beat / 4, 0.75, pan=-0.4 + i * 0.25)

    # The lift into the vision: a snare roll over the last bar, then everything opens.
    place(band, roll(bar, s_s), vision - bar, 0.6)
    place(air, riser(bar), vision - bar, 0.4)
    place(air, crash(4.0), vision, 0.75)
    place(band, k_big, vision, 1.0)
    vision_prog = [("E3", "B3", "G#4"), ("C#3", "G#3", "E4"), ("A2", "E3", "C#4"), ("B2", "F#3", "D#4")]
    lead_line = ["B4", "E5", "F#5", "G#5", "B5", "G#5", "F#5", "E5"]
    t, i = vision, 0
    while t < end_hit - 1e-6:
        chord = vision_prog[i % 4]
        dur = min(bar, end_hit - t)
        p = pad([note(x) for x in chord], dur + 0.6)
        place(air, p, t, 0.5, pan=-0.2 if i % 2 else 0.2)
        place(verb, p, t, 0.35)
        place(band, power_chord(chord[0].replace("3", "2"), dur, mute=False), t, 0.3, pan=-0.4)
        place(band, power_chord(chord[0].replace("3", "2"), dur, mute=False), t + 0.012, 0.26, pan=0.4)
        place(band, bass(note(chord[0]) / 2, dur * 0.95), t, 0.75)
        for q in range(8):
            tq = t + q * beat / 2
            if tq >= end_hit:
                break
            place(band, h_s, tq, 0.4 if q % 2 == 0 else 0.28, pan=0.35)
            if q in (0, 3, 4):
                place(band, k_s, tq, 0.95)
            if q in (2, 6):
                place(band, s_s, tq, 0.8)
                place(verb, s_s, tq, 0.35)
        ln = lead(note(lead_line[(2 * i) % 8]), beat * 2)
        place(air, ln, t, 0.3)
        place(air, lead(note(lead_line[(2 * i + 1) % 8]), beat * 2), t + beat * 2, 0.3)
        place(verb, ln, t, 0.25)
        t += bar
        i += 1
    # A beat of air before the end hit, so it lands.
    for bus in (band, air):
        a = seconds(end_hit - beat / 2)
        bus[:, a : seconds(end_hit)] *= np.linspace(1, 0.15, seconds(end_hit) - a)

    # The end hit on the logo; its chord rings under the line, into the end card.
    card = lines[43]["start"] - 0.25
    eb = boom(4.0)
    place(air, eb, end_hit, 0.95)
    place(verb, eb, end_hit, 0.4)
    place(air, crash(5.0), end_hit, 0.7)
    place(band, k_big, end_hit, 1.0)
    ring_len = card - end_hit + 0.4
    fade = np.minimum(1, (ring_len - np.arange(seconds(ring_len)) / SR) / 0.6).clip(0, 1)
    final = pad([note("E2"), note("B2"), note("E3"), note("G#3"), note("B3")], ring_len)
    final *= np.exp(-np.arange(len(final)) / SR * 0.25) * fade
    place(air, final, end_hit, 0.55)
    place(verb, final, end_hit, 0.45)
    chord = power_chord("E2", ring_len, mute=False) * np.exp(-np.arange(seconds(ring_len)) / SR * 0.5)
    place(air, chord * fade, end_hit, 0.35)

    # The end card: one last chord on the cut, ringing out to silence before the film ends.
    last = total - card - 0.15
    tail = np.clip((last - np.arange(seconds(last)) / SR) / last, 0, 1) ** 1.6
    closing = pad([note("E2"), note("B2"), note("E3"), note("G#3"), note("B3"), note("E4")], last)
    closing *= tail
    place(air, closing, card, 0.6)
    place(verb, closing, card, 0.5)
    place(air, power_chord("E2", last, mute=False) * tail, card, 0.3)
    place(band, k_big, card, 0.8)
    place(air, crash(3.0) * np.clip(np.linspace(1, 0, seconds(3.0)) * 1.0, 0, 1), card, 0.4)
    return band, air, verb


def voice_track(tl, n):
    v = np.zeros(n)
    for line in tl["lines"]:
        x = load_audio(os.path.join(ROOT, line["voice"]))
        i = seconds(line["start"])
        j = min(n, i + len(x))
        v[i:j] += x[: j - i]
    return v


def duck_curve(tl, n, depths, attack=0.05, release=0.22):
    """The music's gain: down by each line's depth (dB) while it talks, with quick ramps."""
    g_db = np.zeros(n)
    for line, depth in zip(tl["lines"], depths):
        a, b = seconds(line["start"] - 0.06), seconds(line["end"] + 0.1)
        g_db[max(0, a) : b] = np.minimum(g_db[max(0, a) : b], depth)
    # Attack 50 ms down, release 220 ms up, as a one-pole smoother on the gain in dB.
    hop = 48
    coarse = g_db[::hop]
    out = np.zeros_like(coarse)
    level = 0.0
    down = 1 - np.exp(-hop / SR / attack)
    up = 1 - np.exp(-hop / SR / release)
    # Look ahead so the duck is down when the first word lands.
    lead = int(0.05 * SR / hop)
    coarse = np.concatenate([coarse[lead:], np.zeros(lead)])
    for i, target in enumerate(coarse):
        level += (target - level) * (down if target < level else up)
        out[i] = level
    full = np.repeat(out, hop)[:n]
    return 10 ** (np.pad(full, (0, n - len(full))) / 20)


def main():
    tl = json.load(open(os.path.join(BUILD, "timeline.json")))
    total = tl["total"]
    n = seconds(total)
    print("  composing…")
    meta = track.info("hype")
    band, air, verb = compose(tl, n, hit_only=bool(meta))
    if meta:
        # The licensed track (music/track.py) plays the whole cut: its stop-start intro under the
        # cold open, dead air before "Not anymore.", the band entry on the hit (with the hit
        # layered on it), its final chord under the end card.
        print(f"  track: {meta['file']}")
        silence = next(l for l in tl["lines"] if l["n"] == 6)["start"] - 0.25
        band += track.hype_bed(SR, n, tl["hit"], silence)
    wet = reverb(verb, 2.2, 0.45)
    music = band + air + wet
    if not meta:
        # The code score's grit (a mastered track gets none).
        music = drive(music * 0.8, 1.15)
    # Ends clean: nothing rings past the last frame, and the reverb tail is faded with it.
    end_fade = seconds(1.0)
    music[:, -end_fade:] *= np.linspace(1, 0, end_fade) ** 2

    voice = voice_track(tl, n)
    voice2 = np.vstack([voice, voice])
    vp = k_weighted_power(voice2)
    # The voice bus to VOICE_LUFS over its lines (ungated, speech only).
    speech = np.zeros(n, bool)
    for l in tl["lines"]:
        speech[seconds(l["start"]) : seconds(l["end"])] = True
    v_lufs = -0.691 + 10 * np.log10(vp[speech].mean())
    v_gain = 10 ** ((VOICE_LUFS - v_lufs) / 20)
    voice2 *= v_gain
    vp *= v_gain**2

    music, depths = duck_to_voice(
        tl, n, music, voice2, vp, speech,
        GAP_MUSIC_LUFS_TRACK if meta else GAP_MUSIC_LUFS,
        TRACK_DUCK_TARGET if meta else DUCK_TARGET,
        track_ramps=bool(meta),
    )

    os.makedirs(BUILD, exist_ok=True)
    music_path = os.path.join(BUILD, "music.wav")
    voice_path = os.path.join(BUILD, "voice.wav")
    write_wav(music_path, music)
    write_wav(voice_path, voice2)
    print("  ducks (dB): " + ", ".join(f"{l['n']}: {d:.0f}" for l, d in zip(tl["lines"], depths)))
    mix(music_path, voice_path)
    return check()


def duck_to_voice(tl, n, music, voice2, vp, speech, gap_lufs, target, track_ramps=False):
    """Sets the music to `gap_lufs` where nobody talks (after the hit), then ducks each line
    until the music sits `target` dB under the voice (short-term, as heard). With a dense,
    compressed track the ducks are faster (80 ms down, 300 ms up) and the music's 1-4 kHz band
    dips a further 3 dB under the voice, where the words are. Returns the music and the depths.
    """
    if track_ramps:
        talk = speech.astype(float)
        k = seconds(0.08)
        talk = np.convolve(talk, np.ones(k) / k, mode="same")
        mid = np.vstack([fft_filter(music[c], low=1000, high=4000, slope=2.0) for c in range(2)])
        music = music - mid * (1 - 10 ** (-3 / 20)) * talk
    mp = k_weighted_power(music)
    gaps = ~speech
    gaps[: seconds(tl["hit"])] = False
    m_lufs = -0.691 + 10 * np.log10(mp[gaps].mean())
    m_gain = 10 ** ((gap_lufs - m_lufs) / 20)
    music = music * m_gain
    mp = mp * m_gain**2
    ramps = (0.08, 0.3) if track_ramps else (0.05, 0.22)
    # A few passes, since the ramps and the 3 s windows interact.
    depths = [0.0] * len(tl["lines"])
    for _ in range(8):
        g = duck_curve(tl, n, depths, *ramps)
        mpd = mp * g**2
        worst = 99.0
        for i, l in enumerate(tl["lines"]):
            gap = (line_gap if track_ramps else lambda *a: short_term_gap(*a)[0])(
                vp, mpd, l["start"], l["end"]
            )
            worst = min(worst, gap)
            if gap < target:
                depths[i] = max(-45.0, depths[i] - (target - gap) - 0.3)
        if worst >= target:
            break
    return music * duck_curve(tl, n, depths, *ramps), depths


def mix(music_path, voice_path):
    """Sums the stems, sets -14 LUFS, and limits true peaks under -1 dBTP (4× oversampled),
    checked after an AAC encode like the film's (a dense rock mix overshoots there), with the
    ceiling lowered until the encode stays under."""
    pre = os.path.join(BUILD, "mix-pre.wav")
    out = os.path.join(BUILD, "mix.wav")
    probe = os.path.join(BUILD, "mix-probe.m4a")
    subprocess.run(
        [
            "ffmpeg", "-v", "error", "-y", "-i", voice_path, "-i", music_path, "-filter_complex",
            "[0:a][1:a]amix=inputs=2:normalize=0[a]", "-map", "[a]", "-c:a", "pcm_f32le", pre,
        ],
        check=True,
    )
    gain, limit = 0.0, 0.79
    for _ in range(8):
        subprocess.run(
            [
                "ffmpeg", "-v", "error", "-y", "-i", pre, "-af",
                f"volume={gain:.2f}dB,aresample=192000,"
                f"alimiter=limit={limit:.3f}:attack=1:release=50:level=false,aresample=48000",
                "-c:a", "pcm_s24le", out,
            ],
            check=True,
        )
        lufs, peak = ebur128(out)
        subprocess.run(
            ["ffmpeg", "-v", "error", "-y", "-i", out, "-c:a", "aac", "-b:a", "256k", probe],
            check=True,
        )
        _, coded = ebur128(probe)
        if abs(lufs - TARGET_LUFS) < 0.15 and coded < PEAK_CEILING - 0.1:
            break
        gain += TARGET_LUFS - lufs
        if coded >= PEAK_CEILING - 0.1:
            limit *= 10 ** (-(coded - PEAK_CEILING + 0.3) / 20)
    os.remove(pre)
    os.remove(probe)


def check(film=None):
    path = film or os.path.join(BUILD, "mix.wav")
    lufs, peak = ebur128(path)
    ok = abs(lufs - TARGET_LUFS) <= 1.0 and peak < PEAK_CEILING
    floor = TRACK_MIN_GAP if track.info("hype") else MIN_GAP
    print(f"{os.path.relpath(path, ROOT)}: {lufs:.1f} LUFS integrated, true peak {peak:.1f} dBTP")
    tl = json.load(open(os.path.join(BUILD, "timeline.json")))
    vp = k_weighted_power(load_audio(os.path.join(BUILD, "voice.wav"), 2))
    mp = k_weighted_power(load_audio(os.path.join(BUILD, "music.wav"), 2))
    print("line  start   voice  music   gap  (short-term LUFS, 3 s windows)")
    worst = None
    for l in tl["lines"]:
        gap, v, m = short_term_gap(vp, mp, l["start"], l["end"])
        flag = "" if gap >= floor else f"  < {floor:.0f} dB"
        print(f"{l['n']:>4}  {l['start']:5.2f}  {v:6.1f} {m:6.1f}  {gap:5.1f}{flag}")
        if worst is None or gap < worst[1]:
            worst = (l["n"], gap)
    print(f"Smallest gap: line {worst[0]}, {worst[1]:.1f} dB")
    if worst[1] < floor:
        ok = False
    if not ok:
        print("The mix fails its check.")
    return 0 if ok else 1


if __name__ == "__main__":
    if "--check" in sys.argv:
        rest = [a for a in sys.argv[1:] if a != "--check"]
        sys.exit(check(rest[0] if rest else None))
    sys.exit(main())
