// The app's settings live in app.json; this adds the one thing JSON can't: where the Firebase
// file for Android push (google-services.json) is. It's never committed (.gitignore). On EAS
// Build it comes from the EAS file variable GOOGLE_SERVICES_JSON, which the Android workflow
// (.github/workflows/android.yml) sets from the GitHub secret of the same name; a gitignored
// file in the project wouldn't be uploaded to the build server. Locally, a copy at
// apps/mobile/google-services.json is used when present; without either the app builds, and
// push stays off on Android (docs/play-store/README.md).
/* global __dirname */
const { existsSync } = require("node:fs");
const { join } = require("node:path");
const { withAndroidManifest } = require("expo/config-plugins");

// Play warned for 1.0.2 that the app requires a portrait screen and Wi-Fi, which some devices
// lack (owner, 2026-11-18: "The next Android release marks both required=false"). The app is
// portrait-only and works on mobile data, so neither is required.
const OPTIONAL_FEATURES = ["android.hardware.screen.portrait", "android.hardware.wifi"];

function withOptionalFeatures(config) {
  return withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest;
    const features = (manifest["uses-feature"] = manifest["uses-feature"] ?? []);
    for (const name of OPTIONAL_FEATURES) {
      const found = features.find((f) => f.$?.["android:name"] === name);
      if (found) found.$["android:required"] = "false";
      else features.push({ $: { "android:name": name, "android:required": "false" } });
    }
    return mod;
  });
}

module.exports = ({ config }) => {
  const googleServicesFile =
    process.env.GOOGLE_SERVICES_JSON ||
    (existsSync(join(__dirname, "google-services.json")) ? "./google-services.json" : undefined);
  const withFeatures = withOptionalFeatures(config);
  if (!googleServicesFile) return withFeatures;
  return { ...withFeatures, android: { ...withFeatures.android, googleServicesFile } };
};
