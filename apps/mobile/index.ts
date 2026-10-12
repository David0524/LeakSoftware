// Polyfills must load before anything else, then Expo Router registers the app.
import "./src/polyfills";
import "expo-router/entry";
