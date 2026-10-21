// MapKit JS in the browser (docs/plans/apple-maps.md): loaded from Apple's CDN only on pages with
// a map, after first paint, and started once per page with tokens from /api/mapkit-token. Only
// the parts of MapKit the website uses are typed here. Client-only.

export const MAPKIT_SRC = "https://cdn.apple-mapkit.com/mk/5.x.x/mapkit.core.js";
const READY = "__sundeckMapKitReady";

export interface MkCoordinate {
  latitude: number;
  longitude: number;
}
export interface MkAnnotation {
  data: Record<string, unknown>;
}
export interface MkMap {
  colorScheme: string;
  region: {
    toBoundingRegion(): {
      northLatitude: number;
      southLatitude: number;
      eastLongitude: number;
      westLongitude: number;
    };
  };
  addAnnotations(a: MkAnnotation[]): void;
  addOverlay(o: unknown): void;
  showItems(items: unknown[], options?: Record<string, unknown>): void;
  setCenterAnimated(c: MkCoordinate, animate?: boolean): void;
  addEventListener(type: string, fn: (e: { annotation?: MkAnnotation }) => void): void;
  destroy(): void;
}
export interface MapKit {
  init(options: { authorizationCallback: (done: (token: string) => void) => void }): void;
  addEventListener(type: string, fn: (e: { status?: string }) => void): void;
  Map: new (el: HTMLElement, options?: Record<string, unknown>) => MkMap;
  Coordinate: new (lat: number, lng: number) => MkCoordinate;
  CoordinateSpan: new (lat: number, lng: number) => unknown;
  Padding: new (top: number, right: number, bottom: number, left: number) => unknown;
  Annotation: new (
    at: MkCoordinate,
    factory: () => HTMLElement,
    options?: Record<string, unknown>,
  ) => MkAnnotation;
  PolylineOverlay: new (points: MkCoordinate[], options?: Record<string, unknown>) => unknown;
  Style: new (options: Record<string, unknown>) => unknown;
  FeatureVisibility?: { Hidden: string; Visible: string; Adaptive: string };
  PointOfInterestFilter?: { excludingAllCategories: unknown };
}

declare global {
  interface Window {
    mapkit?: MapKit;
    [READY]?: () => void;
  }
}

let loading: Promise<MapKit> | null = null;

/** MapKit JS, loading it once. Rejects when Apple's script can't be loaded (15 s at most). */
export function loadMapKit(): Promise<MapKit> {
  if (loading) return loading;
  loading = new Promise<MapKit>((resolve, reject) => {
    const failed = (why: string) => {
      loading = null;
      reject(new Error(why));
    };
    const timer = setTimeout(() => failed("MapKit took too long"), 15_000);
    window[READY] = () => {
      clearTimeout(timer);
      if (window.mapkit) resolve(window.mapkit);
      else failed("MapKit didn’t start");
    };
    const s = document.createElement("script");
    s.src = MAPKIT_SRC;
    s.async = true;
    s.crossOrigin = "anonymous";
    s.dataset.callback = READY;
    s.dataset.libraries = "map,annotations,overlays";
    s.onerror = () => {
      clearTimeout(timer);
      s.remove();
      failed("MapKit didn’t load");
    };
    document.head.appendChild(s);
  });
  return loading;
}

/** Start loading MapKit when the browser is idle after the page is drawn, so Enlarge is quick. */
export function preloadMapKit() {
  const go = () => void loadMapKit().catch(() => {});
  if ("requestIdleCallback" in window) requestIdleCallback(go, { timeout: 4000 });
  else setTimeout(go, 1500);
}

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

/** A token is asked for again 5 minutes before its 30 are up. */
const TOKEN_MS = 25 * 60 * 1000;
let token: { value: string; company: string; until: number } | null = null;
let company = "";
let started = false;
const failures = new Set<() => void>();

/** A MapKit token for this shop, or null when the site refuses one (signed out, used up, off). */
export async function mapkitToken(forCompany: string): Promise<string | null> {
  company = forCompany;
  if (token && token.company === forCompany && token.until > Date.now()) return token.value;
  try {
    const res = await fetch(`/api/mapkit-token?company=${encodeURIComponent(forCompany)}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const value = (await res.text()).trim();
    if (!value) return null;
    token = { value, company: forCompany, until: Date.now() + TOKEN_MS };
    return value;
  } catch {
    return null;
  }
}

/** Start MapKit once per page; its later token requests use the same endpoint. */
export function startMapKit(mk: MapKit) {
  if (started) return;
  started = true;
  mk.init({
    authorizationCallback: (done) => {
      void mapkitToken(company).then((t) => {
        if (t) done(t);
        else for (const f of failures) f();
      });
    },
  });
  // Apple refused the token, or the allowance is used: every open map steps aside.
  mk.addEventListener("error", () => {
    for (const f of failures) f();
  });
}

/** Be told when MapKit can't draw (its error event, or a refused token). */
export function onMapKitFailure(fn: () => void): () => void {
  failures.add(fn);
  return () => failures.delete(fn);
}
