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

module.exports = ({ config }) => {
  const googleServicesFile =
    process.env.GOOGLE_SERVICES_JSON ||
    (existsSync(join(__dirname, "google-services.json")) ? "./google-services.json" : undefined);
  if (!googleServicesFile) return config;
  return { ...config, android: { ...config.android, googleServicesFile } };
};
