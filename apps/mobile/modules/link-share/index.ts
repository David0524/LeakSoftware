import { requireOptionalNativeModule } from "expo";

/** Android's share sheet with EXTRA_TITLE (android/…/LinkShareModule.kt); null elsewhere. */
export const LinkShareNative = requireOptionalNativeModule<{
  share(text: string, title: string | null): void;
}>("LinkShare");
