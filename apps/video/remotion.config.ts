import { Config } from "@remotion/cli/config";

// Photos, shop logos, and (copied in by scripts/prepare.mjs) the music, fonts and Sundeck logo.
Config.setPublicDir("./assets");
Config.setVideoImageFormat("jpeg");
Config.setCodec("h264");
