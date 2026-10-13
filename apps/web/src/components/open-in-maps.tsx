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
 * A whole day's stops in Google Maps, always (Apple Maps links take one stop at a time), so
 * the button says so.
 */
export function OpenRouteInMaps({ href, className }: { href: string; className?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cx(buttonClass("secondary"), className)}
    >
      {PIN}
      Open Route in Google Maps
    </a>
  );
}
