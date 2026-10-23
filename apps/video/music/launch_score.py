"""The launch film's score, written in code (docs/plans/launch-video.md, section 7.2).

Built around the narration's timeline (build/timeline.json, from src/prepare.ts):
  - the cold open: a low drone and a ticking clock, a riser into silence;
  - "Not anymore.": a hard hit;
  - the tour: a driving, gritty groove at the timeline's tempo (heavy drums, palm-muted bass
    and guitar chugs, a chord pad and a held bass under them), ducked under the voice;
  - every chapter card: a fill and a crash, the band at full level while nobody talks;
  - the vision: a big swell, open chords and a lead, into an end hit on the logo.

Writes build/music.wav (the score, ducked), build/voice.wav (the narration placed on the
timeline) and build/mix.wav (both, at about -14 LUFS with true peaks under -1 dBFS).

    python3 music/launch_score.py

Needs numpy and ffmpeg. Everything is synthesized here; no samples or loops from anywhere else.
When a licensed track is in audio/track/ (music/track.py), it plays from the hit instead.
"""

import json
import os
import subprocess
import sys

import numpy as np

import track

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUILD = os.path.join(ROOT, "build")
SR = 48000
# Mix levels: the voice bus, and the music bus under it (music/check_mix.py checks the gap).
VOICE_LUFS = -16.0
MUSIC_LUFS = -27.0
# With the licensed track: the music's level where nobody talks (after the hit), short-term.
TRACK_GAP_LUFS = -15.0
HIT_TRIM = 0.7
RNG = np.random.default_rng(20261023)


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
    for d in (-detune, 0.0, detune) if detune else (0.0,):
        ph = RNG.random()
        out += 2 * ((t * freq * (1 + d) + ph) % 1.0) - 1
    return out / (3 if detune else 1)


def env(n, attack, decay, sustain=0.0, release=0.0, total=None):
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
    midi = 12 * (octave + 1) + names[pitch]
    return 440 * 2 ** ((midi - 69) / 12)


# ---------------------------------------------------------------------------
# Instruments (each made once, then placed)
# ---------------------------------------------------------------------------


def kick():
    n = seconds(0.55)
    t = np.arange(n) / SR
    f = 46 + 110 * np.exp(-t * 28)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 6.5)
    click = fft_filter(RNG.standard_normal(n), low=1500) * np.exp(-t * 180) * 0.35
    return drive(body + click, 2.2)


def snare():
    n = seconds(0.45)
    t = np.arange(n) / SR
    tone = np.sin(2 * np.pi * 185 * t) * np.exp(-t * 22) * 0.6
    noise = fft_filter(RNG.standard_normal(n), low=900, high=9000) * np.exp(-t * 14)
    return drive(tone + noise * 0.9, 2.6) * 0.9


def hat(open_=False):
    n = seconds(0.4 if open_ else 0.08)
    t = np.arange(n) / SR
    x = fft_filter(RNG.standard_normal(n), low=7000)
    return x * np.exp(-t * (9 if open_ else 70)) * 0.45


def tom(freq):
    n = seconds(0.5)
    t = np.arange(n) / SR
    f = freq * (1 + 0.5 * np.exp(-t * 30))
    return drive(np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 7), 1.8) * 0.8


def crash(dur=3.0):
    n = seconds(dur)
    t = np.arange(n) / SR
    x = fft_filter(RNG.standard_normal(n), low=3500, high=14000)
    shimmer = 1 + 0.15 * np.sin(2 * np.pi * 7 * t)
    return x * np.exp(-t * 1.6) * shimmer * 0.55


def boom():
    """The hit: a long sub drop, a noise burst, a low distorted stab."""
    n = seconds(3.2)
    t = np.arange(n) / SR
    f = 32 + 70 * np.exp(-t * 9)
    sub = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 1.4)
    burst = fft_filter(RNG.standard_normal(n), high=5000) * np.exp(-t * 9) * 0.5
    stab = power_chord("E2", 3.2, mute=False) * np.exp(-t * 1.1) * 0.7
    return drive(sub * 1.2 + burst + stab, 1.6)


def tick(high=True):
    n = seconds(0.05)
    t = np.arange(n) / SR
    ping = np.sin(2 * np.pi * (2900 if high else 2300) * t) * np.exp(-t * 160)
    click = fft_filter(RNG.standard_normal(n), low=2000) * np.exp(-t * 400) * 0.4
    return (ping + click) * 0.35


def bass(freq, dur):
    """A palm-muted electric bass note: a saw through a dark filter, quick decay."""
    x = saw(freq, dur, detune=0.003)
    x = fft_filter(x, high=420, slope=2)
    x = drive(x * env(len(x), 0.004, dur * 0.7, sustain=0.25, release=0.03), 2.0)
    return x


def power_chord(root, dur, mute=True):
    """Root, fifth and octave, distorted: a palm-muted chug, or ringing when mute=False."""
    f = note(root)
    x = saw(f, dur, 0.004) + saw(f * 1.5, dur, 0.004) * 0.8 + saw(f * 2, dur, 0.004) * 0.6
    x = drive(x * 3.0, 3.5)
    x = fft_filter(x, low=90, high=1800 if mute else 3400, slope=1.6)
    e = env(len(x), 0.003, 0.09 if mute else dur * 0.8, sustain=0.0 if mute else 0.35, release=0.02)
    return x * e * 0.5


def pad(freqs, dur):
    """Open chord for the vision: detuned saws, soft attack, darkish."""
    x = sum(saw(f, dur, 0.006) for f in freqs) / len(freqs)
    x = fft_filter(x, high=2600, slope=1.2)
    return x * env(len(x), 0.6, dur, sustain=1.0, release=0.8) * 0.6


def lead(freq, dur):
    x = saw(freq, dur, 0.002)
    x = drive(fft_filter(x, high=3200) * 2.0, 2.0)
    t = np.arange(len(x)) / SR
    vib = 1 + 0.004 * np.sin(2 * np.pi * 5.5 * t)
    return x * vib * env(len(x), 0.05, dur, sustain=0.8, release=0.25) * 0.35


def drone(dur):
    n = seconds(dur)
    t = np.arange(n) / SR
    x = saw(note("E1"), dur, 0.004) + saw(note("B1"), dur, 0.005) * 0.6 + saw(note("E2"), dur, 0.003) * 0.25
    x = fft_filter(x, high=260, slope=2)
    swell = 0.55 + 0.45 * np.sin(2 * np.pi * t / 9.0 - np.pi / 2) ** 2
    return x * swell * np.minimum(1, t / 2.5)


def riser(dur):
    n = seconds(dur)
    t = np.arange(n) / SR
    x = RNG.standard_normal(n)
    # Brighter as it rises: blend from a dark to a bright copy.
    dark = fft_filter(x, high=900)
    bright = fft_filter(x, low=2500)
    k = (t / dur) ** 2
    return (dark * (1 - k) + bright * k) * (t / dur) ** 2.2 * 0.6


def reverb(bus, seconds_=2.4, mix=0.22):
    """A plate-ish reverb by convolution with decaying noise (each channel its own noise)."""
    n_ir = seconds(seconds_)
    t = np.arange(n_ir) / SR
    out = np.zeros_like(bus)
    for c in range(2):
        ir = fft_filter(RNG.standard_normal(n_ir), low=200, high=7000) * np.exp(-t * 6.9 / seconds_)
        ir /= np.sqrt(np.sum(ir**2))
        n = 1 << int(np.ceil(np.log2(bus.shape[1] + n_ir)))
        y = np.fft.irfft(np.fft.rfft(bus[c], n) * np.fft.rfft(ir, n), n)[: bus.shape[1]]
        out[c] = y
    return out * mix


# ---------------------------------------------------------------------------
# The voice
# ---------------------------------------------------------------------------


def load_audio(path):
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", path, "-f", "f32le", "-ac", "1", "-ar", str(SR), "-"],
        check=True,
        capture_output=True,
    ).stdout
    return np.frombuffer(raw, dtype=np.float32).astype(float)


def voice_track(timeline, n):
    v = np.zeros(n)
    for line in timeline["lines"]:
        if not line["voice"]:
            continue
        x = load_audio(os.path.join(ROOT, line["voice"]))
        i = seconds(line["start"])
        j = min(n, i + len(x))
        v[i:j] += x[: j - i]
    return v


def envelope(x, attack=0.03, release=0.35, win=0.02):
    """The voice's level, smoothed: fast up, slow down (for ducking)."""
    hop = seconds(win)
    frames = len(x) // hop
    rms = np.sqrt(np.mean(x[: frames * hop].reshape(frames, hop) ** 2, axis=1) + 1e-12)
    out = np.zeros_like(rms)
    up = 1 - np.exp(-win / attack)
    down = 1 - np.exp(-win / release)
    level = 0.0
    for i, r in enumerate(rms):
        level += (r - level) * (up if r > level else down)
        out[i] = level
    full = np.repeat(out, hop)
    return np.pad(full, (0, max(0, len(x) - len(full))), mode="edge")[: len(x)]


# ---------------------------------------------------------------------------
# The score
# ---------------------------------------------------------------------------


def track_score(timeline):
    """The long film on the licensed track (music/track.py): the track's stop-start intro under
    the cold open, dead air from just before "Not anymore." to the hit, the band entry on the hit
    with the hype cut's hit layered on it (same sounds, same levels), the track on to the end,
    faded over the last two bars. Ducked like the hype cut: 9 dB under each line (never less than
    7), fast ramps, the 1-4 kHz band dipped under the voice, full between lines."""
    import hype_score as H

    n = seconds(timeline["total"])
    hit = timeline["hit"]
    lines = {l["n"]: l for l in timeline["lines"]}
    silence = lines[6]["start"] - 0.25
    print("  track: " + track.info("launch")["file"])
    music = track.launch_bed(SR, n, hit, timeline["total"], silence)
    band, air, verb = (np.zeros((2, n)) for _ in range(3))
    H.hit_kit(band, air, verb, hit, H.kick(1.6), H.snare())
    # The same hit as the hype cut, trimmed so it measures as loud there as in the hype mix (the
    # long film's bed sits 1 dB lower, so the master gain is a little higher).
    music = music + (band + air + H.reverb(verb, 2.2, 0.45)) * HIT_TRIM

    voice = voice_track(timeline, n)
    voice2 = np.vstack([voice, voice])
    vp = H.k_weighted_power(voice2)
    speech = np.zeros(n, bool)
    for l in timeline["lines"]:
        speech[seconds(l["start"]) : seconds(l["end"])] = True
    v_lufs = -0.691 + 10 * np.log10(vp[speech].mean())
    v_gain = 10 ** ((VOICE_LUFS - v_lufs) / 20)
    voice2 *= v_gain
    vp *= v_gain**2
    print("  ducking…")
    music, depths = H.duck_to_voice(
        timeline, n, music, voice2, vp, speech, TRACK_GAP_LUFS, H.TRACK_DUCK_TARGET, track_ramps=True
    )
    print("  ducks (dB): " + ", ".join(f"{l['n']}: {d:.0f}" for l, d in zip(timeline["lines"], depths)))
    music_path = os.path.join(BUILD, "music.wav")
    voice_path = os.path.join(BUILD, "voice.wav")
    H.write_wav(music_path, music)
    H.write_wav(voice_path, voice2)
    # Written at the gains they're heard at (music/check_mix.py measures them as they are).
    with open(os.path.join(BUILD, "stems.json"), "w") as f:
        f.write('{ "as_heard": true }\n')
    print("  mixing…")
    H.BUILD = BUILD
    H.mix(music_path, voice_path)
    lufs, peak = loudness(os.path.join(BUILD, "mix.wav"))
    print(f"Wrote build/mix.wav: {lufs:.1f} LUFS integrated, true peak {peak:.1f} dBFS")


def main():
    timeline = json.load(open(os.path.join(BUILD, "timeline.json")))
    if track.info("launch"):
        return track_score(timeline)
    marker = os.path.join(BUILD, "stems.json")
    if os.path.exists(marker):
        os.remove(marker)
    total = timeline["total"]
    n = seconds(total)
    beat = timeline["beat"]
    bar = beat * 4
    hit = timeline["hit"]
    lines = {l["n"]: l for l in timeline["lines"]}
    cards = timeline["cards"]
    vision = timeline["chapters"].get("vision", lines[38]["start"])
    end_hit = lines[42]["start"]

    band = np.zeros((2, n))  # drums, bass, guitars: ducked
    air = np.zeros((2, n))  # hits, crashes, swells: ducked less
    verb_send = np.zeros((2, n))

    # Cold open: the drone and the clock, a riser, then silence before the hit.
    open_end = hit - 1.2
    d = drone(open_end + 0.4)
    d *= np.minimum(1, (open_end + 0.4 - np.arange(len(d)) / SR) / 0.4).clip(0, 1)
    place(band, d, 0, 1.2)
    # A dark Em pad over the drone, so the open is felt on a phone or laptop speaker too.
    op = pad([note("E3"), note("B3"), note("G3")], open_end + 0.4)
    op *= np.minimum(1, (open_end + 0.4 - np.arange(op.shape[-1]) / SR) / 0.6).clip(0, 1)
    place(air, op, 0, 0.9)
    place(verb_send, op, 0, 0.3)
    t = 0.6
    k = 0
    while t < open_end:
        place(air, tick(k % 2 == 0), t, 0.55, pan=0.25 if k % 2 else -0.25)
        t += 1.0
        k += 1
    rz = riser(3.0)
    place(air, rz, open_end - 3.0, 0.5)

    # "Not anymore.": the hit.
    hb = boom()
    place(air, hb, hit, 0.75)
    place(verb_send, hb, hit, 0.5)
    place(air, crash(4.0), hit, 0.6)

    # The groove: from line 7 to the vision.
    k_s, s_s, h_s, h_o = kick(), snare(), hat(), hat(True)
    groove_from = lines[7]["start"]
    progression = ["E2", "C2", "G2", "D2"]
    bass_notes = {r: bass(note(r.replace("2", "1")), beat / 2 * 0.95) for r in progression}
    chugs = {r: power_chord(r, beat / 2 * 0.95) for r in progression}
    rings = {r: power_chord(r, bar, mute=False) for r in progression}
    chords = {"E2": ("E3", "G3", "B3"), "C2": ("C3", "E3", "G3"), "G2": ("G2", "B2", "D3"), "D2": ("D3", "F#3", "A3")}
    groove_pads = {r: pad([note(x) for x in chords[r]], bar + 0.6) for r in progression}
    subs = {r: bass(note(r.replace("2", "1")), bar * 0.98) for r in progression}
    chug_pattern = [1, 1, 0, 1, 1, 1, 0, 1]
    kick_pattern = [1, 0, 0, 1, 1, 0, 0, 0]
    snare_pattern = [0, 0, 1, 0, 0, 0, 1, 0]

    def in_card(t):
        return any(c["start"] <= t < c["end"] for c in cards)

    t = groove_from
    eighth = 0
    while t < vision - 1e-6:
        step = eighth % 8
        bar_i = eighth // 8
        root = progression[bar_i % 4]
        place(band, k_s, t, 0.95) if kick_pattern[step] else None
        if snare_pattern[step]:
            place(band, s_s, t, 0.75, pan=0.05)
            place(verb_send, s_s, t, 0.35)
        place(band, h_o if step == 7 else h_s, t, 0.35 if step % 2 else 0.5, pan=0.35)
        place(band, bass_notes[root], t, 0.85)
        if chug_pattern[step]:
            place(band, chugs[root], t, 0.42, pan=-0.45)
            place(band, chugs[root], t + 0.012, 0.36, pan=0.45)
        if step == 0 and bar_i % 4 == 0:
            place(band, rings[root], t, 0.18, pan=0.0)
        if step == 0:
            # A chord pad on every bar and a held sub note: a full bed under the groove.
            place(band, groove_pads[root], t, 0.5, pan=-0.15 if bar_i % 2 else 0.15)
            place(verb_send, groove_pads[root], t, 0.25)
            place(band, subs[root], t, 0.55)
        t += beat / 2
        eighth += 1

    # Chapter lifts: a tom-and-snare fill into each card, a crash on its downbeat and on the
    # chapter's first line, and a riser under the card.
    for c in cards:
        start, end = c["start"], c["end"]
        if end > vision + 0.01:
            continue
        place(air, crash(2.6), start, 0.5, pan=-0.2)
        place(air, crash(2.6), end, 0.45, pan=0.2)
        place(verb_send, crash(2.6), end, 0.2)
        place(air, riser(max(0.5, end - start)), start, 0.35)
        fill_t = end - beat
        for i, f in enumerate([180, 150, 120, 95]):
            place(band, tom(f), fill_t + i * beat / 4, 0.7, pan=-0.4 + i * 0.25)
        place(band, k_s, end, 1.0)

    # The vision: a swell, half-time drums, open chords and a lead, into the end hit.
    vision_prog = [("C3", "G3", "E4"), ("G2", "D3", "B3"), ("D3", "A3", "F#4"), ("E3", "B3", "G4")]
    # The swell's crash lands in the breath before "Think about…", never on the word.
    lift_at = lines[37]["end"] + 0.15
    place(air, riser(2.5), lift_at - 2.5, 0.6)
    place(air, crash(4.0), lift_at, 0.7)
    t = vision
    i = 0
    lead_line = ["E4", "G4", "A4", "B4", "D5", "B4", "A4", "G4"]
    while t < end_hit - 1e-6:
        chord = vision_prog[i % 4]
        dur = min(bar, end_hit - t)
        p = pad([note(x) for x in chord], dur + 0.8)
        lift = min(1.0, 0.45 + 0.18 * i)
        place(air, p, t, 0.55 * lift, pan=-0.2 if i % 2 else 0.2)
        place(verb_send, p, t, 0.4 * lift)
        place(band, bass(note(chord[0]) / 2, dur * 0.9), t, 0.7)
        # Half time: kick on 1, snare on 3, hats on quarters; full time in the last two bars.
        full = t > end_hit - 2 * bar
        for q in range(4):
            tq = t + q * beat
            if tq >= end_hit:
                break
            place(band, h_s, tq, 0.4, pan=0.35)
            if q == 0 or (full and q == 2):
                place(band, k_s, tq, 0.95)
            if q == 2 or (full and q in (1, 3)):
                place(band, s_s, tq, 0.7)
                place(verb_send, s_s, tq, 0.4)
        if i >= 1:
            ln = lead(note(lead_line[(2 * i) % 8]), beat * 2)
            place(air, ln, t, 0.35 * lift)
            place(air, lead(note(lead_line[(2 * i + 1) % 8]), beat * 2), t + beat * 2, 0.35 * lift)
            place(verb_send, ln, t, 0.25)
        t += bar
        i += 1

    # The end hit on the logo, then the chord rings out under the end card.
    eb = boom()
    place(air, eb, end_hit, 0.95)
    place(air, crash(5.0), end_hit, 0.7)
    final = pad([note("E2"), note("B2"), note("E3"), note("G#3"), note("B3")], total - end_hit)
    place(air, final, end_hit, 0.5)
    place(verb_send, final, end_hit, 0.5)
    place(air, rings["E2"] * 1.0, end_hit, 0.35)

    # The licensed track, when there is one (music/track.py): it takes over from the hit, its
    # downbeat on the hit; the cold open stays the code score's.
    parts = track.aligned(SR, n, hit)
    if parts:
        print("  track: " + ", ".join(parts))
        cut = seconds(hit)
        for bus in (band, air, verb_send):
            bus[:, cut:] = 0

    print("  reverb…")
    wet = reverb(verb_send, 2.6, 0.5)

    # Ducking under the voice.
    print("  voice…")
    voice = voice_track(timeline, n)
    if np.any(voice):
        # The music steps back a quarter second before each word (look-ahead) and stays down
        # through the pauses inside a line.
        level = envelope(voice, release=0.5)
        ahead = seconds(0.25)
        level = np.maximum(level, np.concatenate([level[ahead:], np.full(ahead, level[-1])]))
        # Fully down at a soft word as well as a loud one (a shallow curve left the bed half up).
        duck = 1 / (1 + (level / 0.004) ** 2)
        duck = 0.3 + 0.7 * duck  # about -9 dB while talking
    else:
        duck = np.ones(n)
        for l in timeline["lines"]:
            a, b = seconds(l["start"] - 0.1), seconds(l["end"] + 0.25)
            duck[a:b] = 0.3
    band_duck = duck
    air_duck = duck

    music = band * band_duck + (air + wet) * air_duck
    if parts:
        # Under the voice the guitars step back furthest, the drums least.
        free = np.clip((duck - 0.3) / 0.7, 0, 1)
        floors = {"drums": 0.5, "bass": 0.4, "guitars": 0.22, "other": 0.28, "track": 0.32}
        for name, x in parts.items():
            music = music + x * (floors[name] + (1 - floors[name]) * free)
    # The vision lifts: about 5 dB up between lines, and further under the voice while it speaks.
    if np.any(voice):
        free = np.clip((duck - 0.3) / 0.7, 0, 1)
        a, b = seconds(lines[38]["start"] - 1.0), seconds(end_hit)
        lift = np.ones(n)
        # Up 2 dB under the voice and 6 dB between lines: the vision lifts.
        lift[a:b] = 1.25 + 0.75 * free[a:b]
        music = music * lift
    # Fade the very end.
    tail = seconds(1.2)
    music[:, -tail:] *= np.linspace(1, 0, tail)
    # A light saturation only: a heavy one squashed the ducks back up (the bed has to step back
    # under each line and come up between them).
    music = music * (0.8 / np.percentile(np.abs(music), 99.95))
    music = drive(music, 0.7) * 0.9

    write_wav(os.path.join(BUILD, "music.wav"), music)
    write_wav(os.path.join(BUILD, "voice.wav"), np.vstack([voice, voice]))
    print("  mixing…")
    mix()


def write_wav(path, x):
    x = np.clip(x, -1, 1).astype(np.float32)
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "2", "-i", "-", "-c:a", "pcm_s24le", path],
        input=x.T.tobytes(),
        check=True,
    )


def loudness(path, extra=""):
    """Integrated loudness and true peak, measured by ffmpeg's ebur128."""
    out = subprocess.run(
        ["ffmpeg", "-nostats", "-i", path, "-af", f"{extra}ebur128=peak=true", "-f", "null", "-"],
        capture_output=True,
        text=True,
    ).stderr
    summary = out[out.rfind("Summary:") :]
    lufs = float(summary.split("I:")[1].split("LUFS")[0])
    peak = float(summary.split("Peak:")[1].split("dBFS")[0])
    return lufs, peak


def mix():
    music = os.path.join(BUILD, "music.wav")
    voice = os.path.join(BUILD, "voice.wav")
    out = os.path.join(BUILD, "mix.wav")
    has_voice = loudness(voice)[0] > -70
    if has_voice:
        # The voice bus at about -16 LUFS; the music under it (at least 7 dB under each line,
        # music/check_mix.py); then the whole at -14.
        v_lufs, _ = loudness(voice)
        m_lufs, _ = loudness(music)
        v_gain = VOICE_LUFS - v_lufs
        m_gain = MUSIC_LUFS - m_lufs
        graph = (
            f"[0:a]volume={v_gain:.2f}dB[v];[1:a]volume={m_gain:.2f}dB[m];"
            "[v][m]amix=inputs=2:normalize=0[a]"
        )
        inputs = ["-i", voice, "-i", music]
    else:
        graph = "[0:a]anull[a]"
        inputs = ["-i", music]
    pre = os.path.join(BUILD, "mix-pre.wav")
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", *inputs, "-filter_complex", graph, "-map", "[a]", "-c:a", "pcm_s24le", pre],
        check=True,
    )
    lufs, peak = loudness(pre)
    gain = -14.0 - lufs
    # A gentle limiter keeps true peaks under -1 dBFS after the gain.
    subprocess.run(
        [
            "ffmpeg", "-v", "error", "-y", "-i", pre, "-af",
            f"volume={gain:.2f}dB,alimiter=limit=0.84:attack=2:release=60:level=false",
            "-ar", str(SR), "-c:a", "pcm_s24le", out,
        ],
        check=True,
    )
    os.remove(pre)
    lufs, peak = loudness(out)
    print(f"Wrote build/mix.wav: {lufs:.1f} LUFS integrated, true peak {peak:.1f} dBFS")


if __name__ == "__main__":
    sys.exit(main())
