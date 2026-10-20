"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { MapProvider } from "@/lib/map-provider";

// Which service the page's live maps use, set by the server page (it alone reads the
// environment; docs/plans/apple-maps.md). Mapbox unless a page says otherwise.

const MapProviderContext = createContext<MapProvider>("mapbox");

export function MapProviderScope({
  provider,
  children,
}: {
  provider: MapProvider;
  children: ReactNode;
}) {
  return <MapProviderContext value={provider}>{children}</MapProviderContext>;
}

export const useMapProvider = () => useContext(MapProviderContext);
