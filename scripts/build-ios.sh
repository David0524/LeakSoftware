#!/usr/bin/env bash
# Builds apps/ios/xtool/SundeckPro.ipa for Sideloadly (`pnpm build:ios`).
#
# xtool copies every binary framework into the app, including static ones (Sentry's
# xcframework is a static library: its code is already linked into the app). A static
# archive can't be code-signed, so Sideloadly fails with "macho sign/edit failed (-11)".
# Such frameworks are removed from the .ipa after the build; the app never loads them.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root/apps/ios"

# xtool needs a terminal. Release: optimized, as the App Store build will be (a debug build
# is noticeably slower on the phone, animations included).
script -qec "xtool dev build --ipa -c release" /dev/null
ipa=xtool/SundeckPro.ipa

# The linker on Linux stamps the app as built with the iOS 18 SDK (its minimum version), so
# iOS 26 and later run it in compatibility mode: no Liquid Glass tab bar, bars, or controls.
# Stamp the main binary with the SDK it was compiled against (the SDK's SDKSettings.json).
sdk_settings="$HOME/.swiftpm/swift-sdks/darwin.artifactbundle/Developer/Platforms/iPhoneOS.platform/Developer/SDKs/iPhoneOS.sdk/SDKSettings.json"
python3 "$root/scripts/stamp-ios-sdk.py" "$ipa" "$sdk_settings"

static=$(python3 - "$ipa" <<'EOF'
import struct, sys, zipfile

def is_static(data: bytes) -> bool:
    if data.startswith(b"!<arch>\n"):
        return True
    # A fat (universal) binary: look at its first slice.
    if data[:4] == b"\xca\xfe\xba\xbe":
        count = struct.unpack(">I", data[4:8])[0]
        if count:
            offset = struct.unpack(">I", data[8 + 8 : 8 + 12])[0]
            return data[offset : offset + 8] == b"!<arch>\n"
    return False

with zipfile.ZipFile(sys.argv[1]) as z:
    for name in z.namelist():
        parts = name.split("/")
        # Payload/X.app/Frameworks/Y.framework/Y
        if len(parts) == 5 and parts[2] == "Frameworks" and parts[3] == parts[4] + ".framework":
            if is_static(z.read(name)):
                print("/".join(parts[:4]))
EOF
)

for framework in $static; do
  echo "Removing static framework $framework (already linked into the app)"
  zip -q -d "$ipa" "$framework/*" "$framework/"
done
# Drop the Frameworks folder if nothing is left in it.
if [ -n "$static" ] && ! unzip -Z1 "$ipa" | grep -q '/Frameworks/.'; then
  zip -q -d "$ipa" 'Payload/*.app/Frameworks/'
fi
echo "Wrote $(pwd)/$ipa"
