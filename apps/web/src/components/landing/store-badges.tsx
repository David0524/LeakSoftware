import { cx } from "../ui";
import { APP_STORE_URL } from "./structured-data";

/**
 * The stores' own badges (owner, 2026-11-06: "Add App Store and Play Store linked logos to the
 * website. You can leave Android's as no link for now"), unaltered as Apple's and Google's
 * guidelines ask, both 40 px tall. Google Play links once the Android app is live there.
 */
export function StoreBadges({ className }: { className?: string }) {
  return (
    <div className={cx("flex flex-wrap items-center justify-center gap-3", className)}>
      <a href={APP_STORE_URL} className="inline-flex min-h-11 items-center">
        {/* eslint-disable-next-line @next/next/no-img-element -- a fixed-size SVG badge */}
        <img
          src="/badges/app-store.svg"
          alt="Download on the App Store"
          width={120}
          height={40}
          className="h-10 w-auto"
        />
      </a>
      <span className="inline-flex min-h-11 items-center">
        {/* eslint-disable-next-line @next/next/no-img-element -- a fixed-size badge */}
        <img
          src="/badges/google-play.png"
          alt="Google Play: coming soon"
          width={134}
          height={40}
          className="h-10 w-auto"
        />
      </span>
    </div>
  );
}
