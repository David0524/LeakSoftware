#!/usr/bin/env bash
# Smooths the owner's iPhone screen recordings for the launch video: drops the repeated
# frames iOS writes when the recorder stalls (at most 10 in a row, so a still screen keeps
# a real frame every 1/6 s and never morphs), then fills those gaps with
# motion-interpolated frames, at a steady 60 fps.
# Usage: scripts/launch-video-smooth.sh [recording.mov ...]  (default: every new .mov and .mp4)
# Writes apps/video/assets/owner/smooth/<name>.mp4; skips ones already made.
set -euo pipefail
dir="$(cd "$(dirname "$0")/.." && pwd)/apps/video/assets/owner"
mkdir -p "$dir/smooth"
files=("$@")
[ ${#files[@]} -eq 0 ] && files=("$dir"/*.mov "$dir"/*.mp4)
for f in "${files[@]}"; do
  out="$dir/smooth/$(basename "${f%.*}").mp4"
  [ -f "$out" ] && { echo "have $out"; continue; }
  echo "smoothing $(basename "$f")"
  ffmpeg -v error -y -i "$f" -an \
    -vf "mpdecimate=hi=64*4:lo=64*2:frac=0.1:max=10,minterpolate=fps=60:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1:scd=none" \
    -c:v libx264 -crf 14 -preset slow -pix_fmt yuv420p "$out.tmp.mp4"
  mv "$out.tmp.mp4" "$out"
done
