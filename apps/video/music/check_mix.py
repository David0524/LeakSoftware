"""Checks the launch film's mix: integrated loudness and true peak of the finished film (or
build/mix.wav), and for every narration line how far the music sits under the voice.

    python3 music/check_mix.py [out/sundeck-launch.mp4]

Each line is measured over its own span in build/timeline.json, with the voice and music stems
at the gains the mix gives them (launch_score.py's VOICE_LUFS and MUSIC_LUFS), as integrated
loudness (EBU R128). Prints a table and fails when a line's music is less than 12 dB under it.
"""

import json
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from launch_score import MUSIC_LUFS, VOICE_LUFS  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUILD = os.path.join(ROOT, "build")
TARGET_GAP = 12.0


def loudness(path, start=None, length=None, gain=0.0):
    args = ["ffmpeg", "-nostats"]
    if start is not None:
        args += ["-ss", f"{start:.3f}", "-t", f"{length:.3f}"]
    args += ["-i", path, "-af", f"volume={gain:.2f}dB,ebur128=peak=true", "-f", "null", "-"]
    out = subprocess.run(args, capture_output=True, text=True).stderr
    summary = out[out.rfind("Summary:") :]
    lufs = float(summary.split("I:")[1].split("LUFS")[0])
    peak = float(summary.split("Peak:")[1].split("dBFS")[0])
    return lufs, peak


def main():
    film = sys.argv[1] if len(sys.argv) > 1 else os.path.join(BUILD, "mix.wav")
    lufs, peak = loudness(film)
    print(f"{os.path.relpath(film, ROOT)}: {lufs:.1f} LUFS integrated, true peak {peak:.1f} dBTP")

    voice = os.path.join(BUILD, "voice.wav")
    music = os.path.join(BUILD, "music.wav")
    v_gain = VOICE_LUFS - loudness(voice)[0]
    m_gain = MUSIC_LUFS - loudness(music)[0]
    with open(os.path.join(BUILD, "timeline.json")) as f:
        lines = json.load(f)["lines"]

    worst = None
    print("line  voice  music  gap")
    for line in lines:
        start, length = line["start"], line["end"] - line["start"]
        v = loudness(voice, start, length, v_gain)[0]
        m = loudness(music, start, length, m_gain)[0]
        gap = v - m
        flag = "" if gap >= TARGET_GAP else "  < 12 dB"
        print(f"{line['n']:>4}  {v:5.1f}  {m:5.1f}  {gap:4.1f}{flag}")
        if worst is None or gap < worst[1]:
            worst = (line["n"], gap)
    print(f"Smallest gap: line {worst[0]}, {worst[1]:.1f} dB")
    if worst[1] < TARGET_GAP:
        sys.exit(1)


if __name__ == "__main__":
    main()
