import "react-native-url-polyfill/auto";
import { getRandomValues } from "expo-crypto";

// UUIDv7 ids (packages/core) need crypto.getRandomValues, which Hermes lacks.
const g = globalThis as { crypto?: { getRandomValues?: unknown } };
g.crypto ??= {};
g.crypto.getRandomValues ??= getRandomValues;
