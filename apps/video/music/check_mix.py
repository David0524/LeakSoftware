"""Checks the launch film's mix: integrated loudness and true peak of the finished film (or
build/mix.wav), and for every narration line how far the music sits under the voice.

    python3 music/check_mix.py [out/sundeck-pro-launch.mp4]

The voice and music stems are measured as heard: each at the gain the mix gives it
(launch_score.py's VOICE_LUFS and MUSIC_LUFS); the master then moves both alike. Both are read as EBU R128 short-term loudness (3-second windows, every 0.1 s). For
each line, every window that lies inside the line gives voice minus music (a line shorter than
3 seconds uses momentary loudness, 0.4-second windows); the line's figure is the smallest of
those taken while the voice speaks (within 8 dB of the line's loudest window). Prints a table
and fails when any line's music is less than 10 dB under its voice.
"""

import json
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from launch_score import MUSIC_LUFS, VOICE_LUFS  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUILD = os.path.join(ROOT, "build")
TARGET_GAP = 10.0
WINDOW = 3.0


def loudness(path, gain=0.0):
    """Integrated loudness and true peak."""
    out = subprocess.run(
        ["ffmpeg", "-nostats", "-i", path, "-af", f"volume={gain:.2f}dB,ebur128=peak=true", "-f", "null", "-"],
        capture_output=True,
        text=True,
    ).stderr
    summary = out[out.rfind("Summary:") :]
    lufs = float(summary.split("I:")[1].split("LUFS")[0])
    peak = float(summary.split("Peak:")[1].split("dBFS")[0])
    return lufs, peak


def short_term(path, gain, key="S"):
    """Short-term (S, 3 s) or momentary (M, 0.4 s) loudness every 0.1 s, by the window's end."""
    out = subprocess.run(
        [
            "ffmpeg", "-nostats", "-i", path, "-af",
            f"volume={gain:.2f}dB,ebur128=metadata=1,ametadata=print:key=lavfi.r128.{key}",
            "-f", "null", "-",
        ],
        capture_output=True,
        text=True,
    ).stderr
    values, t = {}, None
    for row in out.splitlines():
        if "pts_time:" in row:
            t = round(float(row.split("pts_time:")[1].split()[0]), 1)
        elif f"lavfi.r128.{key}=" in row and t is not None:
            values[t] = float(row.split("=")[1])
    return values


def main():
    film = sys.argv[1] if len(sys.argv) > 1 else os.path.join(BUILD, "mix.wav")
    lufs, peak = loudness(film)
    print(f"{os.path.relpath(film, ROOT)}: {lufs:.1f} LUFS integrated, true peak {peak:.1f} dBTP")

    voice = os.path.join(BUILD, "voice.wav")
    music = os.path.join(BUILD, "music.wav")
    v_gain = VOICE_LUFS - loudness(voice)[0]
    m_gain = MUSIC_LUFS - loudness(music)[0]
    # The master's gain moves both stems alike, so the gap is the same before and after it.
    sv = short_term(voice, v_gain)
    sm = short_term(music, m_gain)
    mv = short_term(voice, v_gain, "M")
    mm = short_term(music, m_gain, "M")
    with open(os.path.join(BUILD, "timeline.json")) as f:
        lines = json.load(f)["lines"]

    worst = None
    print("line  voice  music  gap   (short-term, as heard; smallest window in the line)")
    for line in lines:
        a, b = line["start"], line["end"]
        if b - a <= WINDOW:
            # A short line ("Not anymore."): its own momentary windows (0.4 s) instead.
            ends = [round(e / 10, 1) for e in range(int((a + 0.4) * 10) + 1, int(b * 10) + 1)]
            rows = [(mv[e], mm[e]) for e in ends if e in mv and e in mm]
        else:
            ends = [round(e / 10, 1) for e in range(int((a + WINDOW) * 10) + 1, int(b * 10) + 1)]
            rows = [(sv[e], sm[e]) for e in ends if e in sv and e in sm]
        # Only while the voice is speaking (within 8 dB of the line's loudest window).
        loudest = max(r[0] for r in rows)
        rows = [r for r in rows if r[0] >= loudest - 8]
        v, m = min(rows, key=lambda r: r[0] - r[1])
        gap = v - m
        flag = "" if gap >= TARGET_GAP else f"  < {TARGET_GAP:.0f} dB"
        print(f"{line['n']:>4}  {v:5.1f}  {m:5.1f}  {gap:4.1f}{flag}")
        if worst is None or gap < worst[1]:
            worst = (line["n"], gap)
    print(f"Smallest gap: line {worst[0]}, {worst[1]:.1f} dB")
    if worst[1] < TARGET_GAP:
        sys.exit(1)


if __name__ == "__main__":
    main()
