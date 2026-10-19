"""Stamp the iPhone app's main binary with the SDK it was compiled against.

Usage: python3 scripts/stamp-ios-sdk.py <app.ipa> <SDKSettings.json>

ld64.lld on Linux writes the deployment target (iOS 18) as the binary's SDK version in
LC_BUILD_VERSION. iOS decides from that field whether an app gets the current system design:
an app "built with" the iOS 18 SDK runs in compatibility mode on iOS 26 and later, without
Liquid Glass. Called by scripts/build-ios.sh.
"""

import json
import struct
import sys
import zipfile

LC_BUILD_VERSION = 0x32
MH_MAGIC_64 = 0xFEEDFACF


def encode(version: str) -> int:
    """Mach-O version numbers: xxxx.yy.zz as nibbles (27.1 -> 0x001B0100)."""
    major, minor, patch = ([int(p) for p in version.split(".")] + [0, 0])[:3]
    return (major << 16) | (minor << 8) | patch


def stamp(data: bytes, sdk: int) -> bytes:
    b = bytearray(data)
    if struct.unpack_from("<I", b, 0)[0] != MH_MAGIC_64:
        raise SystemExit("The app binary isn't a 64-bit Mach-O.")
    ncmds = struct.unpack_from("<I", b, 16)[0]
    offset = 32  # after mach_header_64
    for _ in range(ncmds):
        cmd, size = struct.unpack_from("<II", b, offset)
        if cmd == LC_BUILD_VERSION:
            # build_version_command: cmd, cmdsize, platform, minos, sdk, ntools
            struct.pack_into("<I", b, offset + 16, sdk)
            return bytes(b)
        offset += size
    raise SystemExit("The app binary has no LC_BUILD_VERSION.")


def main() -> None:
    ipa, settings = sys.argv[1], sys.argv[2]
    with open(settings) as f:
        version = json.load(f)["Version"]
    with zipfile.ZipFile(ipa) as z:
        items = [(info, z.read(info.filename)) for info in z.infolist()]
    app = next(
        info.filename.split("/")[1]
        for info, _ in items
        if info.filename.startswith("Payload/") and info.filename.count("/") >= 2
    )
    # The app's binary, and each extension's (the Live Activity's widget extension).
    binaries = {f"Payload/{app}/{app.removesuffix('.app')}"}
    for info, _ in items:
        parts = info.filename.split("/")
        if len(parts) == 5 and parts[2] == "PlugIns" and parts[3] == parts[4] + ".appex":
            binaries.add(info.filename)
    with zipfile.ZipFile(ipa, "w", zipfile.ZIP_DEFLATED) as z:
        for info, data in items:
            z.writestr(info, stamp(data, encode(version)) if info.filename in binaries else data)
    for b in sorted(binaries):
        print(f"Stamped {b} as built with the iOS {version} SDK")


if __name__ == "__main__":
    main()
