#!/usr/bin/env bash
# Runs inside the Android emulator (.github/workflows/android-screenshots.yml): installs the
# app, sets a clean status bar, and runs screenshots.yaml. Usage: run.sh <apk> <out dir>
set -euo pipefail
apk=$1
out=$2
mkdir -p "$out"

adb wait-for-device
until [ "$(adb shell getprop sys.boot_completed | tr -d '\r')" = 1 ]; do sleep 2; done
adb install -r -g "$apk"

# A clean status bar: 9:41, full battery and signal, no notification icons.
adb shell settings put global sysui_demo_allowed 1
demo() { adb shell am broadcast -a com.android.systemui.demo -e command "$@" >/dev/null; }
demo enter
demo clock -e hhmm 0941
demo battery -e level 100 -e plugged false
demo network -e wifi show -e level 4 -e fully true
demo network -e mobile show -e level 4 -e datatype none -e fully true
demo notifications -e visible false

adb logcat -c
status=0
maestro test --format junit --output "$out/maestro.xml" --debug-output "$out/debug" \
  --test-output-dir "$out/maestro" -e EMAIL="$EMAIL" -e PASSWORD="$PASSWORD" -e LEAK_JOB="$LEAK_JOB" \
  -e SENT_JOB="$SENT_JOB" -e VISIT_JOB="$VISIT_JOB" \
  apps/mobile/maestro/screenshots.yaml || status=$?
mkdir -p "$out/debug"
adb logcat -d > "$out/debug/logcat.txt" || true

# takeScreenshot saves inside Maestro's output folder; gather the eight at the top of $out.
find "$out/maestro" "$out/debug" -maxdepth 6 -name '[0-9]-*.png' -exec cp {} "$out/" \; 2>/dev/null || true
ls -l "$out"
exit "$status"
