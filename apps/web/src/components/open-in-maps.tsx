import { directionsHref, type LatLng } from "@leakbook/core";
import { buttonClass, cx } from "./ui";

// Directions links. Plain links (no browser code): /maps picks Apple Maps or Google Maps on
// the server, so the same tap always opens the same app.

const PIN = (
  <svg
    viewBox="0 0 24 24"
    className="size-5 shrink-0"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M12 21s-7-6.1-7-11.5a7 7 0 0 1 14 0C19 14.9 12 21 12 21z" />
    <circle cx="12" cy="9.5" r="2.5" />
  </svg>
);

/**
 * The address itself as the link to directions in the phone's maps app (the device's choice
 * under More, otherwise Apple Maps on Apple devices and Google Maps elsewhere). Opens in a new
 * tab on a computer.
 */
export function AddressLink({
  address,
  location,
  className,
}: {
  address: string;
  location?: LatLng | null;
  className?: string;
}) {
  return (
    <a
      href={directionsHref({ address, location })}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${address}, directions in Maps`}
      className={cx("text-link underline-offset-4 hover:underline", className)}
      data-testid="address-link"
    >
      {address}
    </a>
  );
}

/**
 * A day's directions in the device's maps app: the whole route in Google Maps; in Apple Maps
 * (whose links take one stop) the next stop. The button names the app.
 */
export function OpenRouteInMaps({
  href,
  app = "google",
  className,
  compact = false,
}: {
  href: string;
  /** The device's maps app: Google Maps opens the whole route, Apple Maps the next stop. */
  app?: "apple" | "google";
  className?: string;
  /** Just the app's name, to sit beside another button on a phone. */
  compact?: boolean;
}) {
  const full = app === "google" ? "Open Route in Google Maps" : "Next Stop in Apple Maps";
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={compact ? full : undefined}
      className={cx(
        buttonClass("secondary", compact ? "px-3 whitespace-nowrap" : undefined),
        className,
      )}
    >
      {PIN}
      {compact ? (app === "google" ? "Google Maps" : "Apple Maps") : full}
    </a>
  );
}
